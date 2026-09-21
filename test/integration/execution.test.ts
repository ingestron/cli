import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { stringify } from "yaml";
import { executeAsync } from "@ingestron/core";
import { installPackage } from "@ingestron/core/adapter";
import { digest } from "@ingestron/core/adapter";
import { writeOutput } from "@ingestron/core/adapter";
function fixture(t: any, supported = true, delay = false) {
  const root = mkdtempSync(resolve(tmpdir(), "ion-execution-host-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = resolve(root, "origin");
  mkdirSync(origin);
  mkdirSync(resolve(origin, "plugin"));
  const descriptor = {
    apiVersion: "ingestron.provider/v1",
    id: "fixture",
    version: "1.0.0",
    platform: "fixture",
    activities: {},
    compatibility: {
      plan: "ingestron.plan/v1",
      minimumCli: "4.2.0",
      requiredFeatures: supported ? ["provider-execution"] : [],
    },
    ...(supported
      ? {
          execution: {
            apiVersion: "ingestron.execution/v1",
            transport: "local-python/v1",
            entryPoint: "execute.py",
            actions: ["prepare", "discover", "review", "approve", "run"],
            status: "receipt",
            retry: "same-run-id",
            cancellation: "interrupt",
          },
        }
      : {}),
  };
  writeFileSync(resolve(origin, "plugin/provider.yaml"), stringify(descriptor));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: origin, stdio: "pipe" });
  git("init", "-q");
  git("add", ".");
  git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "-qm",
    "fixture",
  );
  git("tag", "1.0.0");
  installPackage(root, "test/executor/plugin/provider.yaml@1.0.0", {
    fromGit: origin,
  });
  writeFileSync(resolve(root, "project.yaml"), "id: synthetic\n");
  // Read the canonical resolved package identity, independent of installation result presentation.
  const reference = "test/executor/plugin/provider.yaml@1.0.0";
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: origin,
    encoding: "utf8",
  }).trim();
  const build = {
    apiVersion: "ingestron.project-build/v1",
    environment: "dev",
    sourceFiles: {
      "project.yaml": digest(readFileSync(resolve(root, "project.yaml"))),
    },
    packageLockSha256: digest(
      readFileSync(resolve(root, "packages.lock.yaml")),
    ),
    packages: [
      {
        configuration: "local",
        reference,
        commit,
        directory: ".",
        scope: { flows: ["customers"] },
      },
    ],
  };
  const files = {
    "ingestron-project.json": JSON.stringify(build),
    "flows/customers/connector.json": JSON.stringify({
      sourceSettings: { token: { $secret: { env: "DEMO_TOKEN" } } },
    }),
    "execute.py":
      'import sys,json,os\nr=json.load(sys.stdin)\nassert os.environ.get("NOT_A_SOURCE_SECRET") is None\nassert os.environ.get("DEMO_TOKEN")=="synthetic" if r["action"]=="run" else True\nprint(json.dumps({"apiVersion":"ingestron.execution-result/v1","status":"succeeded","action":r["action"],"flows":r["flows"]}))\n',
  };
  if (delay)
    files["execute.py"] =
      'import time,json\ntime.sleep(60)\nprint(json.dumps({"apiVersion":"ingestron.execution-result/v1","status":"succeeded"}))\n';
  writeOutput(
    resolve(root, "build/generated"),
    {
      project: "synthetic",
      environment: "dev",
      selection: { projectBuild: true },
      digest: "build-digest",
    },
    files,
  );
  return {
    root,
    files,
    ctx: { root, allowExecute: true, allowWrite: true, allowNetwork: true },
  };
}
test("explicit local execution receipts, retry, secret filtering and tamper/stale preflight", async (t) => {
  const f = fixture(t);
  writeFileSync(
    resolve(f.root, ".env"),
    "DEMO_TOKEN=synthetic\nNOT_A_SOURCE_SECRET=withheld\n",
  );
  let r = await executeAsync({ root: f.root, allowWrite: true }, "run", {
    provider: "local",
  });
  assert.equal(r.ok, false);
  assert.equal(r.diagnostics[0].code, "PERMISSION");
  r = await executeAsync(f.ctx, "run", {
    flow: "customers",
    runId: "first",
    envFile: ".env",
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.result.status, "succeeded");
  const retry = await executeAsync(f.ctx, "run", {
    retry: "first",
    envFile: ".env",
  });
  assert.equal(retry.ok, true, JSON.stringify(retry));
  assert.equal(retry.result.attempt, 2);
  const status = await executeAsync({ root: f.root }, "run_status", {
    id: "first",
  });
  assert.equal(status.result.status, "succeeded");
  assert.ok(!JSON.stringify(status).includes('synthetic"'));
  assert.equal(
    (await executeAsync(f.ctx, "run", { runId: "first" })).ok,
    false,
  );
  writeFileSync(resolve(f.root, "project.yaml"), "id: changed\n");
  r = await executeAsync(f.ctx, "run", { retry: "first" });
  assert.equal(r.diagnostics[0].code, "STALE");
  writeFileSync(resolve(f.root, "project.yaml"), "id: synthetic\n");
  writeFileSync(
    resolve(f.root, "build/generated/execute.py"),
    'print("edited")',
  );
  r = await executeAsync(f.ctx, "run", {});
  assert.equal(r.diagnostics[0].code, "CONFLICT");
});
test("providers without execution capability stay unavailable", async (t) => {
  const f = fixture(t, false);
  const r = await executeAsync(f.ctx, "run", {});
  assert.equal(r.ok, false);
  assert.equal(r.diagnostics[0].code, "NOT_IMPLEMENTED");
});
test("MCP execution requires separate opt-in and uses the shared operations", async (t) => {
  const { createServer } = await import("../../src/mcp/index.js");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } =
    await import("@modelcontextprotocol/sdk/inMemory.js");
  const f = fixture(t);
  for (const enabled of [false, true]) {
    const server = createServer(f.root, true, "dev", true, enabled),
      client = new Client({ name: "test", version: "1.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    await client.connect(b);
    const listed = await client.listTools();
    assert.equal(
      listed.tools.some((x) => x.name === "ingestron_run"),
      enabled,
    );
    if (enabled) {
      const r: any = await client.callTool({
        name: "ingestron_run",
        arguments: { action: "discover" },
      });
      assert.equal(JSON.parse(r.content[0].text).ok, true, r.content[0].text);
    }
    await client.close();
    await server.close();
  }
});

test("foreground interruption records a retryable interrupted run", async (t) => {
  const f = fixture(t, true, true);
  const pending = executeAsync(f.ctx, "run", {
    action: "discover",
    runId: "interrupted",
  });
  const timer = setTimeout(() => process.emit("SIGINT"), 150);
  const result = await pending;
  clearTimeout(timer);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "INTERRUPTED");
  const status = await executeAsync({ root: f.root }, "run_status", {
    id: "interrupted",
  });
  assert.equal(status.result.status, "interrupted");
});

test("runtime preparation requires network permission separately", async (t) => {
  const f = fixture(t);
  const r = await executeAsync(
    { ...f.ctx, allowNetwork: false },
    "runtime_prepare",
    {},
  );
  assert.equal(r.ok, false);
  assert.equal(r.diagnostics[0].code, "PERMISSION");
});

test("CLI secret file is project-relative and is not parsed as a Node option", (t) => {
  const f = fixture(t);
  writeFileSync(
    resolve(f.root, ".env"),
    "DEMO_TOKEN=synthetic\nNOT_A_SOURCE_SECRET=withheld\nNODE_OPTIONS=--invalid-secret-sentinel\n",
  );
  const output = execFileSync(
    process.execPath,
    [
      resolve("build/cli/cli/index.js"),
      "--project",
      f.root,
      "--json",
      "--no-input",
      "run",
      "--flow",
      "customers",
      "--run-id",
      "cli-secrets",
      "--secrets-file",
      ".env",
    ],
    { encoding: "utf8" },
  );
  const result = JSON.parse(output);
  assert.equal(result.ok, true, output);
  assert.equal(result.result.status, "succeeded");
  assert.ok(!output.includes("withheld"));
});
