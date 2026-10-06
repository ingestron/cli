/** Installed append ingestion; the companion fixture runner owns the loopback DB. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const options = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, value, i, args) =>
        i % 2 === 0 ? [...pairs, [value.slice(2), args[i + 1]]] : pairs,
      [],
    ),
);
const cli = realpathSync(options.cli);
assert.match(cli, /node_modules\/.*ingestron\/build\/cli\/cli\/index.js$/);
const phase = options.phase ?? "initial";
assert.ok(["initial", "quality-failure", "recovery"].includes(phase));
const connector = options.connector ?? "postgresql";
assert.ok(["postgresql", "mysql", "oracle"].includes(connector));
const base =
  phase === "initial"
    ? realpathSync(
        mkdtempSync(
          join(resolve(options.out), "ingestron-incremental-acceptance-"),
        ),
      )
    : realpathSync(options.base);
const project = join(base, "project");
let report;
if (phase === "initial") {
  mkdirSync(project);
  const fixture = JSON.parse(readFileSync(options.fixture, "utf8"));
  assert.equal(
    fixture.settings?.connection?.host,
    "127.0.0.1",
    "Synthetic database must be loopback only",
  );
  const origin = (id, source, folder, version) => {
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
      "Synthetic immutable acceptance",
    );
    git("tag", version);
    return id;
  };
  const sourceVersion = parse(
    readFileSync(
      resolve(options.connectors, `connectors/${connector}/connector.yaml`),
      "utf8",
    ),
  ).version;
  const providerVersion = parse(
    readFileSync(resolve(options.provider, "plugin/provider.yaml"), "utf8"),
  ).version;
  const sourceRef = `example/source/connectors/${connector}/connector.yaml@${sourceVersion}`;
  const providerRef = `example/local/plugin/provider.yaml@${providerVersion}`;
  origin(
    "source",
    resolve(options.connectors, `connectors/${connector}`),
    `connectors/${connector}`,
    sourceVersion,
  );
  origin(
    "provider",
    resolve(options.provider, "plugin"),
    "plugin",
    providerVersion,
  );
  writeFileSync(join(project, ".private.env"), fixture.secrets, {
    mode: 0o600,
  });
  writeFileSync(
    join(project, "project.yaml"),
    stringify({
      apiVersion: "ingestron.project/v1",
      id: "incremental_acceptance",
      packages: { source: sourceRef, local: providerRef },
      providers: {
        configurations: { local: { package: "local", binding: "runtime" } },
      },
      defaults: { provider: "local" },
      environments: {
        dev: {
          apiVersion: "ingestron.environment/v1",
          environment: "dev",
          bindings: { runtime: { kind: "local" } },
        },
      },
      connections: {
        sales: {
          package: "source",
          sourceId: "synthetic",
          tenantId: "training",
          settings: fixture.settings,
        },
      },
      flows: [
        {
          apiVersion: "ingestron.flow/v1",
          kind: "ingestion",
          id: "orders_append",
          provider: "local",
          ingestion: {
            connection: "sales",
            execution: { mode: "local" },
          },
          tables: {
            orders: {
              source: {
                ...fixture.source,
              },
              contract: {
                apiVersion: "v3.1.0",
                kind: "DataContract",
                id: "orders",
                name: "Orders",
                version: "1.0.0",
                status: "draft",
                schema: [
                  {
                    name: "orders",
                    logicalType: "object",
                    physicalType: "table",
                    properties: [
                      {
                        name: "id",
                        logicalType: "integer",
                        physicalType: "BIGINT",
                        required: true,
                        primaryKey: true,
                      },
                      {
                        name: "label",
                        logicalType: "string",
                        physicalType: "STRING",
                        required: true,
                        quality: [
                          {
                            id: "allowed-label",
                            metric: "invalidValues",
                            arguments: {
                              validValues: [
                                "business-preview-only",
                                "second",
                                "third",
                              ],
                            },
                            mustBe: 0,
                            severity: "error",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      ],
    }),
  );
  report = {
    apiVersion: "ingestron.incremental-acceptance/v1",
    status: "initialising",
    project,
    cli,
    connector,
    source: sourceRef,
    provider: providerRef,
    checks: [],
  };
  writeFileSync(
    join(base, "synthetic-fixture.json"),
    JSON.stringify({ project, cli, connector }),
  );
} else {
  const marker = JSON.parse(
    readFileSync(join(base, "synthetic-fixture.json"), "utf8"),
  );
  assert.deepEqual(marker, { project, cli, connector });
  report = JSON.parse(readFileSync(join(base, "acceptance.json"), "utf8"));
}
const permissions = ["--allow-write", "--allow-execute", "--allow-network"];
const operation = (name, args = {}, expected = true) => {
  let stdout;
  try {
    stdout = execFileSync(
      process.execPath,
      [
        "--",
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
        cwd: project,
        input: JSON.stringify(args),
        encoding: "utf8",
        timeout: 900000,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  } catch (error) {
    stdout = error.stdout;
  }
  const result = JSON.parse(stdout);
  assert.equal(result.ok, expected, JSON.stringify(result));
  return result;
};
const run = (args, expected = true) =>
  operation(
    "run",
    {
      ...(args.retry ? {} : { flow: "orders_append" }),
      envFile: ".private.env",
      ...args,
    },
    expected,
  );
const output = (result, rows, cursor, sequence, more) => {
  const [flow] = result.result.result.flows;
  assert.equal(flow.tables[0].rows, rows);
  assert.deepEqual(flow.checkpoint, {
    sequence,
    bookmarks: { orders: String(cursor) },
    hasMore: more,
  });
  assert.ok(flow.quality.every((rule) => rule.passed));
  return flow;
};
if (phase === "initial") {
  operation("packages_install", {
    reference: report.source,
    fromGit: "source",
  });
  operation("packages_install", {
    reference: report.provider,
    fromGit: "provider",
  });
  const before = readFileSync(join(project, "project.yaml"), "utf8");
  const configured = {
    flow: "orders_append",
    execution: { mode: "local", ingestion: "incremental" },
    sources: {
      orders: {
        ...parse(before).flows[0].tables.orders.source,
        incremental: {
          watermark: "id",
          initial: 0,
          batchSize: 2,
          consistency: "ordered-committed-append",
        },
      },
    },
  };
  writeFileSync(join(project, "sources.yaml"), stringify(configured.sources));
  const preview = operation("ingestion_configure", configured);
  assert.equal(readFileSync(join(project, "project.yaml"), "utf8"), before);
  const command = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--",
        cli,
        "--project",
        project,
        "--json",
        "--no-input",
        "--dry-run",
        "flow",
        "ingestion",
        configured.flow,
        "--execution",
        JSON.stringify(configured.execution),
        "--sources",
        "sources.yaml",
      ],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ),
  );
  assert.equal(command.ok, true, JSON.stringify(command));
  assert.deepEqual(command.result.changes, preview.result.changes);
  const client = new Client({
    name: "incremental-authoring-acceptance",
    version: "1.0.0",
  });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ["--", cli, "--project", project, "advanced", "mcp", "serve"],
        stderr: "pipe",
      }),
    );
    const listed = await client.listTools();
    assert.ok(
      listed.tools.some(
        (t) =>
          t.name === "ingestron_ingestion_configure" &&
          t.annotations.readOnlyHint,
      ),
    );
    assert.ok(!listed.tools.some((t) => t.name === "ingestron_apply"));
    const answer = await client.callTool({
      name: "ingestron_ingestion_configure",
      arguments: configured,
    });
    const mcp = JSON.parse(answer.content[0].text);
    assert.equal(mcp.ok, true, JSON.stringify(mcp));
    assert.deepEqual(mcp.result.changes, preview.result.changes);
  } finally {
    await client.close();
  }
  assert.equal(readFileSync(join(project, "project.yaml"), "utf8"), before);
  operation("apply", { proposal: preview.result });
  assert.deepEqual(
    parse(readFileSync(join(project, "project.yaml"), "utf8")).flows[0]
      .ingestion.execution,
    configured.execution,
  );
  report.checks.push(
    "atomic execution and table source authoring",
    "CLI dry-run and read-only MCP preview parity",
  );
  operation("validate");
  operation("build");
  operation("runtime_prepare", {
    flow: "orders_append",
    python: options.python,
  });
  for (const action of ["discover", "review", "approve"]) run({ action });
  const first = output(run({ runId: "batch_001" }), 2, 2, 1, true);
  const retry = output(run({ retry: "batch_001" }), 2, 2, 1, true);
  assert.deepEqual(retry.tables, first.tables);
  output(run({ runId: "batch_002" }), 1, 3, 2, false);
  output(run({ runId: "empty_003" }), 0, 3, 3, false);
  report.checks.push(
    "clean installed preparation and review",
    "bounded first batch and cursor commit",
    "retry preserves output hashes and cursor",
    "next batch reads only the remaining row",
    "empty batch retains cursor",
  );
  report.status = "initial_passed";
} else if (phase === "quality-failure") {
  assert.equal(report.status, "initial_passed");
  const failure = run({ runId: "bad_004" }, false);
  assert.match(
    JSON.stringify(failure),
    /QUALITY_FAILED|allowed-label|quality/i,
  );
  assert.doesNotMatch(
    JSON.stringify(failure),
    /unexpected-business-value|Synthetic-Pass/,
  );
  report.checks.push(
    "blocking quality failure reports counts without row payload",
  );
  report.status = "failure_verified";
} else {
  assert.equal(report.status, "failure_verified");
  output(run({ retry: "bad_004" }), 1, 4, 4, false);
  output(run({ runId: "empty_005" }), 0, 4, 5, false);
  report.checks.push(
    "failed batch retry restores the prior committed cursor",
    "recovered cursor prevents duplicate delivery",
  );
  report.status = "passed";
}
writeFileSync(
  join(base, "acceptance.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify({ base, ...report }, null, 2));
