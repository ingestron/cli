import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { stringify } from "yaml";
import { fixture } from "../support/project.js";
import { execute } from "@ingestron/core";
import { installPackage, resolvePackage } from "@ingestron/core/adapter";

function setup(
  t: any,
  code = `export function command(request) { return {echo:request.input, context:request.context}; }`,
  schema: any = {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: { name: { type: "string" } },
  },
  namespace?: string,
) {
  const f = fixture(t),
    repo = resolve(f.root, "package");
  mkdirSync(resolve(repo, "plugin"), { recursive: true });
  writeFileSync(
    resolve(repo, "plugin/provider.yaml"),
    stringify({
      apiVersion: "ingestron.provider/v1",
      id: "synthetic",
      version: "1.0.0",
      platform: "adf",
      activities: {},
      compatibility: { plan: "ingestron.plan/v1", minimumCli: "2.4.0" },
      commands: {
        apiVersion: "ingestron.provider-commands/v1",
        execution: "offline-json",
        ...(namespace ? { namespace } : {}),
        module: "./commands.mjs",
        definitions: [
          {
            name: "discover import",
            description: "Synthetic import",
            inputSchema: schema,
          },
        ],
      },
    }),
  );
  writeFileSync(resolve(repo, "plugin/commands.mjs"), code);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, stdio: "pipe" });
  git("init", "--quiet");
  git("add", ".");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "fixture",
  );
  git("tag", "1.0.0");
  installPackage(f.root, "example/commands@1.0.0", { fromGit: repo });
  f.project.providers.packages.dbx = {
    source: "example/commands",
    version: "1.0.0",
  };
  writeFileSync(resolve(f.root, "project.yaml"), stringify(f.project));
  const run = (
    operation: "provider_commands" | "provider_command",
    args: any,
  ) =>
    execute(
      {
        root: f.root,
        environment: "dev",
        allowWrite: false,
        allowNetwork: false,
      },
      operation,
      { configuration: "engineering", ...args },
    );
  return { ...f, run };
}
test("locked provider commands share read-only operations and validate input", (t) => {
  const f = setup(t);
  const catalog = f.run("provider_commands", {});
  assert.equal(catalog.ok, true, JSON.stringify(catalog));
  const result = f.run("provider_command", {
    command: "discover import",
    input: { name: "customers" },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal((result.result as any).result.echo.name, "customers");
  assert.equal((result.result as any).environment, "dev");
  assert.equal((result.result as any).execution, "offline-json");
  assert.equal(
    f.run("provider_command", {
      command: "discover import",
      input: { name: 3 },
    }).ok,
    false,
  );
  assert.equal(
    f.run("provider_command", { command: "deploy apply", input: {} }).ok,
    false,
  );
  const cli = resolve("build/cli/cli/index.js");
  const output = JSON.parse(
    execFileSync(
      process.execPath,
      [
        cli,
        "--project",
        f.root,
        "--json",
        "providers",
        "commands",
        "engineering",
      ],
      { encoding: "utf8" },
    ),
  );
  assert.deepEqual(output.result, catalog.result);
  writeFileSync(
    resolve(f.root, "input.json"),
    JSON.stringify({ name: "customers" }),
  );
  const cliResult = JSON.parse(
    execFileSync(
      process.execPath,
      [
        cli,
        "--project",
        f.root,
        "--json",
        "provider",
        "engineering",
        "discover",
        "import",
        "--input",
        "input.json",
      ],
      { encoding: "utf8" },
    ),
  );
  assert.deepEqual(cliResult.result, result.result);
  writeFileSync(
    resolvePackage(f.root, "example/commands@1.0.0").file,
    "tampered",
  );
  assert.equal(f.run("provider_commands", {}).ok, false);
});
test("help never executes provider code and commands cannot access host APIs", (t) => {
  const f = setup(
    t,
    `throw new Error('module executed'); export function command() { return {}; }`,
  );
  assert.equal(f.run("provider_commands", {}).ok, true);
  assert.equal(
    f.run("provider_command", {
      command: "discover import",
      input: { name: "x" },
    }).ok,
    false,
  );
});
test("provider command VM denies filesystem, network, process and asynchronous outputs", (t) => {
  const f = setup(
    t,
    `export function command() { return {process:typeof process,fetch:typeof fetch,require:typeof require}; }`,
  );
  const result = f.run("provider_command", {
    command: "discover import",
    input: { name: "x" },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual((result.result as any).result, {
    process: "undefined",
    fetch: "undefined",
    require: "undefined",
  });
  const asyncFixture = setup(
    t,
    `export async function command() { return {}; }`,
  );
  assert.equal(
    asyncFixture.run("provider_command", {
      command: "discover import",
      input: { name: "x" },
    }).ok,
    false,
  );
});

test("provider command computation remains bounded", (t) => {
  const f = setup(t, "export function command() { while(true) {} }");
  const result = f.run("provider_command", {
    command: "discover import",
    input: { name: "x" },
  });
  assert.equal(result.ok, false);
});

test("command schema alternatives remain bounded and cannot hide references", (t) => {
  const alternative = {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: { name: { type: "string" } },
  };
  const other = {
    type: "object",
    additionalProperties: false,
    required: ["count"],
    properties: { count: { type: "integer" } },
  };
  const f = setup(t, undefined, { oneOf: [alternative, other] });
  for (const input of [{ name: "source" }, { count: 2 }])
    assert.equal(
      f.run("provider_command", { command: "discover import", input }).ok,
      true,
    );
  assert.equal(
    f.run("provider_command", { command: "discover import", input: {} }).ok,
    false,
  );
  for (const schema of [
    { oneOf: Array(5).fill(alternative) },
    { oneOf: [alternative, { $ref: "https://example.invalid/schema" }] },
  ]) {
    const bad = setup(t, undefined, schema);
    assert.equal(
      bad.run("provider_command", {
        command: "discover import",
        input: { name: "source" },
      }).ok,
      false,
    );
  }
});

test("plugin namespace uses the same locked offline operation and help never executes guest code", async (t) => {
  const f = setup(t);
  const registry = execute({ root: f.root }, "plugin_commands", {});
  assert.equal(registry.ok, true, JSON.stringify(registry));
  assert.equal(registry.result.bindings[0].namespace, "synthetic");
  const args = {
    namespace: "synthetic",
    command: "discover import",
    input: { name: "customers" },
  };
  const result = execute({ root: f.root }, "plugin_command", args);
  assert.deepEqual(
    result.result,
    f.run("provider_command", { command: args.command, input: args.input })
      .result,
  );
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } =
    await import("@modelcontextprotocol/sdk/inMemory.js");
  const { createServer } = await import("../../src/mcp/index.js");
  const server = createServer(f.root);
  const client = new Client({ name: "namespace-parity", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  const response: any = await client.callTool({
    name: "ingestron_plugin_command",
    arguments: args,
  });
  assert.deepEqual(JSON.parse(response.content[0].text), result);
  writeFileSync(resolve(f.root, "input.json"), JSON.stringify(args.input));
  const cli = (...words: string[]) => {
    const child = spawnSync(
      process.execPath,
      [
        resolve("build/cli/cli/index.js"),
        "--project",
        f.root,
        "--json",
        ...words,
      ],
      { encoding: "utf8" },
    );
    assert.equal(child.stderr, "");
    return { status: child.status, data: JSON.parse(child.stdout) };
  };
  const invoked = cli(
    "synthetic",
    "discover",
    "import",
    "--input",
    "input.json",
  );
  assert.equal(invoked.status, 0, JSON.stringify(invoked));
  assert.deepEqual(invoked.data.result, result.result);
  const help = cli("synthetic", "discover", "import", "--help");
  assert.equal(help.status, 0);
  assert.match(help.data.result.text, /--target/);
  assert.match(help.data.result.text, /Input schema/);
  f.project.providers.configurations.second = {
    ...f.project.providers.configurations.engineering,
  };
  writeFileSync(resolve(f.root, "project.yaml"), stringify(f.project));
  assert.equal(
    execute({ root: f.root }, "plugin_command", args).diagnostics[0]?.code,
    "COMMAND_TARGET",
  );
  assert.equal(
    cli(
      "synthetic",
      "discover",
      "import",
      "--target",
      "engineering",
      "--input",
      "input.json",
    ).status,
    0,
  );
  assert.equal(
    execute({ root: f.root }, "plugin_command", { ...args, target: "missing" })
      .ok,
    false,
  );
  const throws = setup(t, `throw new Error("Guest was executed");`);
  assert.equal(execute({ root: throws.root }, "plugin_commands", {}).ok, true);
  assert.equal(
    execute({ root: throws.root }, "plugin_command", args).ok,
    false,
  );
});

test("plugin namespace rejects reserved names without running provider code", (t) => {
  const f = setup(
    t,
    `throw new Error("Guest was executed");`,
    { type: "object" },
    "plugin",
  );
  const result = execute({ root: f.root }, "plugin_commands", {});
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.code, "COMMAND_NAMESPACE");
});
