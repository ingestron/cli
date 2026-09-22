import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { parse } from "yaml";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
  cpSync,
  readFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { fixture } from "../test/support/project.js";
import { ecosystem } from "../test/support/ecosystem.js";
const root = process.cwd(),
  release = resolve(root, "build/release");
mkdirSync(release, { recursive: true });
const temporary = mkdtempSync(resolve(tmpdir(), "ingestron-installed-")),
  cleanup: Array<() => void> = [];
try {
  const pack = resolve(temporary, "archive");
  mkdirSync(pack);
  execFileSync("pnpm", ["pack", "--pack-destination", pack], { stdio: "pipe" });
  const archive = resolve(
    pack,
    readdirSync(pack).find((n) => n.endsWith(".tgz"))!,
  );
  cpSync(archive, resolve(release, archive.split("/").at(-1)!));
  const inventory = execFileSync("tar", ["-tzf", archive], {
    encoding: "utf8",
  });
  assert.doesNotMatch(
    inventory,
    /package\/build\/(cli|assets)\/(providers|generation)\//,
  );
  assert.doesNotMatch(inventory, /databricks-bundle|lakeflow|\.j2$/m);
  for (const path of inventory.trim().split("\n"))
    assert.match(
      path,
      /^package\/(?:build\/cli\/(?:cli\/|mcp\/|version\.(?:js|d\.ts)$)|(?:package\.json|README\.md|SECURITY\.md|CHANGELOG\.md|LICENSE|NOTICE|THIRD_PARTY_NOTICES\.md)$)/,
    );
  writeFileSync(
    resolve(temporary, "package.json"),
    JSON.stringify({
      name: "installed-cli-check",
      packageManager: "pnpm@10.15.0",
      private: true,
    }),
  );
  execFileSync(
    "pnpm",
    [
      "add",
      "--ignore-scripts",
      archive,
      `@ingestron/core@${JSON.parse(readFileSync("package.json", "utf8")).dependencies["@ingestron/core"]}`,
    ],
    {
      cwd: temporary,
      stdio: "pipe",
      timeout: 60000,
    },
  );
  const cli = resolve(
    temporary,
    "node_modules/ingestron/build/cli/cli/index.js",
  );
  execFileSync(
    process.execPath,
    [resolve(root, "examples/quickstart.mjs"), cli],
    { stdio: "pipe", timeout: 60000 },
  );
  const f = fixture({ after: (fn: () => void) => cleanup.push(fn) });
  const client = new Client({ name: "installed-cli-check", version: "1.0.0" });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [cli, "--project", f.root, "advanced", "mcp", "serve"],
        stderr: "pipe",
      }),
    );
    const list = await client.listTools();
    assert.ok(list.tools.some((t) => t.name === "ingestron_inspect"));
    assert.ok(
      !list.tools.some(
        (t) => t.name === "ingestron_apply" || t.name === "ingestron_run",
      ),
    );
    const result: any = await client.callTool({
      name: "ingestron_inspect",
      arguments: {},
    });
    assert.equal(JSON.parse(result.content[0].text).ok, true);
  } finally {
    await client.close();
  }
  console.log("Installed CLI stdio MCP permission boundary passed");
  const beforeAlias = readFileSync(resolve(f.root, "project.yaml"), "utf8");
  const writer = new Client({
    name: "installed-alias-check",
    version: "1.0.0",
  });
  try {
    await writer.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [
          cli,
          "--project",
          f.root,
          "advanced",
          "mcp",
          "serve",
          "--allow-write",
          "--allow-network",
        ],
        stderr: "pipe",
      }),
    );
    const installed: any = await writer.callTool({
      name: "ingestron_packages_install",
      arguments: {
        reference: "local@1.0.0",
        fromGit: resolve(f.root, "fixture-origin"),
      },
    });
    const result = JSON.parse(installed.content[0].text);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(
      result.result.reference,
      "ingestron/provider-local/plugin/provider.yaml@1.0.0",
    );
    assert.equal(
      readFileSync(resolve(f.root, "project.yaml"), "utf8"),
      beforeAlias,
    );
    const repeated: any = await writer.callTool({
      name: "ingestron_packages_install",
      arguments: { reference: "local", frozen: true },
    });
    assert.equal(JSON.parse(repeated.content[0].text).result.cached, true);
  } finally {
    await writer.close();
  }
  console.log(
    "Installed MCP alias resolution and cache-only project boundary passed",
  );
  const run = (project: string, ...args: string[]) => {
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [cli, "--project", project, "--json", "--no-input", ...args],
        { encoding: "utf8", timeout: 60000, maxBuffer: 20_000_000 },
      ),
    );
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    return result.result;
  };
  run(
    f.root,
    "plugin",
    "install",
    "example/fixture@1.0.0",
    "--frozen",
    "--cache-only",
  );
  run(
    f.root,
    "source",
    "add",
    "sample",
    "--type",
    "adls",
    "--format",
    "parquet",
  );
  f.put("metadata.json", {
    table: "sample",
    columns: [{ name: "id", logicalType: "integer", physicalType: "BIGINT" }],
  });
  run(f.root, "source", "import", "sample", "--metadata", "metadata.json");
  run(f.root, "contract", "draft", "sample", "--source", "sample");
  run(f.root, "contract", "check", "sample");
  run(f.root, "check");
  const apiCheck = resolve(temporary, "core-parity.mjs");
  writeFileSync(
    apiCheck,
    `import {executeAsync} from "@ingestron/core"; process.stdout.write(JSON.stringify(await executeAsync({root: process.argv[2], environment: 'dev', allowWrite: false, allowNetwork: false, allowExecute: false}, 'plan', {})));`,
  );
  const directPlan = JSON.parse(
    execFileSync(process.execPath, [apiCheck, f.root, cli], {
      cwd: temporary,
      encoding: "utf8",
    }),
  );
  assert.equal(directPlan.ok, true, JSON.stringify(directPlan.diagnostics));
  assert.deepEqual(
    run(f.root, "plan"),
    directPlan.result,
    "Installed CLI and core must produce the same plan and compiler identity",
  );

  run(f.root, "build", "--out", "app-generated");
  run(f.root, "check", "--output", "app-generated");
  console.log(
    "Installed source-to-contract and one-step build workflow passed",
  );
  f.put("environments/dev.yaml", f.project.environments.dev);
  f.project.environments.dev = { $resolve: "./environments/dev.yaml" };
  f.put("project.yaml", f.project);
  const originalProject = readFileSync(resolve(f.root, "project.yaml"), "utf8");
  run(f.root, "--dry-run", "environments", "add", "uat", "--from", "dev");
  assert.equal(
    readFileSync(resolve(f.root, "project.yaml"), "utf8"),
    originalProject,
  );
  run(f.root, "environments", "add", "uat", "--from", "dev");
  assert.equal(
    parse(readFileSync(resolve(f.root, "environments/uat.yaml"), "utf8"))
      .environment,
    "uat",
  );
  console.log("Installed environment preview and apply passed");
  for (const ownership of ["managed", "team"]) {
    run(f.root, "plan", "--out", "build/plan.json");
    run(
      f.root,
      "generate",
      "--plan",
      "build/plan.json",
      "--out",
      ownership,
      "--ownership",
      ownership,
    );
    run(f.root, "validate-output", ownership);
  }
  console.log(
    "Installed independent compiler: locked plugin, plan, managed/team exports passed",
  );
  const ecosystemProject = ecosystem({
    after: (fn: () => void) => cleanup.push(fn),
  });
  for (const name of ["loader", "sqlmodel", "pack"]) {
    const origin = resolve(ecosystemProject.root, name);
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: origin, stdio: "pipe" });
    git("init", "--quiet");
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "synthetic package",
    );
    git("tag", "1.0.0");
    const path = name === "pack" ? "pack.yaml" : "provider.yaml";
    const source = `community/${name}/${path}`;
    run(
      ecosystemProject.root,
      "plugin",
      "install",
      `${source}@1.0.0`,
      "--cache-only",
      "--from-git",
      origin,
    );
    if (name === "pack")
      ecosystemProject.project.providers.packs.sample.source = source;
    else ecosystemProject.project.providers.packages[name].source = source;
  }
  ecosystemProject.save();
  run(
    ecosystemProject.root,
    "build",
    "--delivery",
    "--out",
    "installed-delivery",
  );
  run(ecosystemProject.root, "check", "--output", "installed-delivery");
  const delivery = JSON.parse(
    readFileSync(
      resolve(
        ecosystemProject.root,
        "installed-delivery/ingestron-project.json",
      ),
      "utf8",
    ),
  );
  assert.equal(delivery.packages.length, 2);
  assert.equal(delivery.packages[1].imports[0].location.name, "raw.customers");
  console.log(
    "Installed CLI: independent locked SQL providers, source pack and coordinated relation handover passed",
  );
  console.log("Provider-free CLI archive passed");
} finally {
  for (const fn of cleanup) fn();
  rmSync(temporary, { recursive: true, force: true });
}
