/** Installed CLI/core + locked source/provider acceptance. Only synthetic files. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  cpSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { parse, stringify } from "yaml";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const options = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, v, i, a) =>
        i % 2 === 0 ? [...pairs, [v.slice(2), a[i + 1]]] : pairs,
      [],
    ),
);
for (const key of ["cli", "connectors", "provider"])
  assert.ok(options[key], `Supply --${key}`);
const cli = realpathSync(options.cli);
assert.match(cli, /node_modules\/.*ingestron\/build\/cli\/cli\/index.js$/);
const base = realpathSync(
  mkdtempSync(
    join(
      options.out ? resolve(options.out) : tmpdir(),
      "ingestron-sample-acceptance-",
    ),
  ),
);
const project = join(base, "project");
mkdirSync(project);
function origin(id, source, folder, version) {
  const root = join(project, id);
  mkdirSync(root);
  cpSync(source, join(root, folder), { recursive: true });
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q");
  git("add", ".");
  git(
    "-c",
    "user.name=Synthetic acceptance",
    "-c",
    "user.email=acceptance@example.invalid",
    "commit",
    "-qm",
    "Synthetic installed acceptance",
  );
  git("tag", version);
  return id;
}
const connector = options.connector ?? "files";
assert.ok(
  ["files", "postgresql", "mysql", "oracle", "sql-server"].includes(connector),
  "Use a qualified synthetic connector fixture",
);
const fixture = options.fixture
  ? JSON.parse(readFileSync(options.fixture, "utf8"))
  : {};
if (connector !== "files")
  assert.equal(
    fixture.settings?.connection?.host ?? fixture.settings?.connection?.server,
    "127.0.0.1",
    "Database acceptance is loopback-only",
  );
if (fixture.secrets)
  writeFileSync(join(project, ".private.env"), fixture.secrets, {
    mode: 0o600,
  });
const sourceVersion = parse(
  readFileSync(
    resolve(options.connectors, `connectors/${connector}/connector.yaml`),
    "utf8",
  ),
).version;
const providerVersion = parse(
  readFileSync(resolve(options.provider, "plugin/provider.yaml"), "utf8"),
).version;
const source = origin(
  "source",
  resolve(options.connectors, `connectors/${connector}`),
  `connectors/${connector}`,
  sourceVersion,
);
const provider = origin(
  "provider",
  resolve(options.provider, "plugin"),
  "plugin",
  providerVersion,
);
const sourceRef = `example/source/connectors/${connector}/connector.yaml@${sourceVersion}`;
const providerRef = `example/local/plugin/provider.yaml@${providerVersion}`;
writeFileSync(
  join(project, "project.yaml"),
  stringify({
    apiVersion: "ingestron.project/v1",
    id: "sample_acceptance",
    packages: { files: sourceRef },
    providers: { configurations: {} },
    defaults: {},
    environments: {
      dev: {
        apiVersion: "ingestron.environment/v1",
        environment: "dev",
        bindings: {},
      },
    },
    connections: {
      files: {
        package: "files",
        sourceId: "synthetic",
        tenantId: "training",
        settings: fixture.settings ?? {},
      },
    },
    flows: [],
  }),
);
writeFileSync(
  join(project, "orders.csv"),
  "id,label\n1,business-preview-only\n2,second\n3,third\n",
);
const operation = (name, args = {}, permissions = []) => {
  let stdout;
  try {
    stdout = execFileSync(
      process.execPath,
      [
        cli,
        "--project",
        project,
        "--json",
        "--no-input",
        "operation",
        name,
        ...permissions,
      ],
      {
        input: JSON.stringify(args),
        encoding: "utf8",
        timeout: 900000,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  } catch (error) {
    stdout = error.stdout;
  }
  return JSON.parse(stdout);
};
for (const [reference, fromGit] of [
  [sourceRef, source],
  [providerRef, provider],
]) {
  const result = operation("packages_install", { reference, fromGit }, [
    "--allow-write",
  ]);
  assert.equal(result.ok, true, JSON.stringify(result));
}
if (options.cache) {
  mkdirSync(join(project, ".ingestron/runtime-cache"), { recursive: true });
  cpSync(
    realpathSync(options.cache),
    join(project, ".ingestron/runtime-cache"),
    { recursive: true },
  );
}
const permissions = ["--allow-write", "--allow-execute"];
const prepared = operation(
  "connection_runtime_prepare",
  {
    connection: "files",
    executor: providerRef,
    ...(options.python ? { python: options.python } : {}),
  },
  [...permissions, "--allow-network"],
);
assert.equal(prepared.ok, true, JSON.stringify(prepared));
const args = {
  connection: "files",
  executor: providerRef,
  source: fixture.source ?? {
    path: join(project, "orders.csv"),
    format: "csv",
  },
  ...(fixture.secrets ? { envFile: ".private.env" } : {}),
  columns: ["label"],
  limit: 2,
};
const denied = operation("connection_sample", args, ["--allow-write"]);
assert.equal(denied.ok, false);
const preview = operation("connection_sample", args, permissions);
assert.equal(preview.ok, true, JSON.stringify(preview));
assert.deepEqual(preview.result.sample.rows, [
  ["business-preview-only"],
  ["second"],
]);
assert.equal(preview.result.sample.truncated, true);
const invalid = operation(
  "connection_sample",
  { ...args, limit: 51 },
  permissions,
);
assert.equal(invalid.ok, false);
const command = JSON.parse(
  execFileSync(
    process.execPath,
    [
      cli,
      "--project",
      project,
      "--json",
      "--no-input",
      "connection",
      "sample",
      "files",
      "--executor",
      providerRef,
      "--source",
      JSON.stringify(args.source),
      ...(fixture.secrets ? ["--secrets-file", ".private.env"] : []),
      "--columns",
      '["label"]',
      "--limit",
      "2",
    ],
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ),
);
assert.equal(command.ok, true, JSON.stringify(command));
assert.deepEqual(command.result.sample, preview.result.sample);
async function mcp(allow) {
  const client = new Client({ name: "sample-acceptance", version: "1.0.0" });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [
          cli,
          "--project",
          project,
          "advanced",
          "mcp",
          "serve",
          ...(allow ? ["--allow-write", "--allow-execute"] : []),
        ],
        stderr: "pipe",
      }),
    );
    const tools = await client.listTools();
    assert.equal(
      tools.tools.some((t) => t.name === "ingestron_connection_sample"),
      allow,
    );
    if (allow) {
      const r = await client.callTool({
        name: "ingestron_connection_sample",
        arguments: args,
      });
      const value = JSON.parse(r.content[0].text);
      assert.equal(value.ok, true, JSON.stringify(value));
      assert.deepEqual(value.result.sample, preview.result.sample);
    }
  } finally {
    await client.close();
  }
}
await mcp(false);
await mcp(true);
const receipts = readdirSync(join(project, ".ingestron/source-access")).filter(
  (n) => n.endsWith(".json"),
);
for (const file of receipts)
  assert.doesNotMatch(
    readFileSync(join(project, ".ingestron/source-access", file), "utf8"),
    /business-preview-only|"rows"/,
  );
const result = {
  apiVersion: "ingestron.sample-acceptance/v1",
  status: "passed",
  project,
  cli,
  source: sourceRef,
  provider: providerRef,
  checks: [
    `installed ${connector} rows and field projection`,
    "bounded two-row preview",
    "execution denial",
    "invalid limit denial",
    "command-operation parity",
    "MCP opt-in and result parity",
    "no business rows in receipts",
  ],
  receipts: receipts.length,
  cacheReuse: prepared.result.reused,
};
writeFileSync(
  join(base, "acceptance.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
