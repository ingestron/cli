/** Installed durable schedule authoring, permission/stale boundaries and legacy-provider rejection. */
import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
for (const name of [
  "CLI_PACKAGE",
  "FIXTURE",
  "OUTPUT",
  "PROOF",
  "CORE_ARCHIVE",
  "CLI_ARCHIVE",
])
  assert.ok(
    process.env["INGESTRON_ACCEPTANCE_" + name],
    "Set acceptance " + name,
  );
const packageRoot = realpathSync(process.env.INGESTRON_ACCEPTANCE_CLI_PACKAGE);
const core = realpathSync(resolve(packageRoot, "../@ingestron/core"));
const require = createRequire(resolve(packageRoot, "package.json"));
const { parse, stringify } = require("yaml");
const { execute } = await import(
  pathToFileURL(resolve(core, "dist/sdk/index.js")).href
);
const { createServer } = await import(
  pathToFileURL(resolve(packageRoot, "build/cli/mcp/index.js")).href
);
const { Client } = await import(
  pathToFileURL(require.resolve("@modelcontextprotocol/sdk/client/index.js"))
    .href
);
const { InMemoryTransport } = await import(
  pathToFileURL(require.resolve("@modelcontextprotocol/sdk/inMemory.js")).href
);
const seed = JSON.parse(
  readFileSync(process.env.INGESTRON_ACCEPTANCE_FIXTURE, "utf8"),
);
assert.equal(seed.result, "passed");
const output = resolve(process.env.INGESTRON_ACCEPTANCE_OUTPUT);
mkdirSync(output, { recursive: true });
const root = mkdtempSync(resolve(output, "schedule-"));
cpSync(seed.root, root, {
  recursive: true,
  filter: (path) =>
    ![
      "fixture",
      "build",
      ".ingestron/runtime-cache",
      ".ingestron/runtimes",
      ".ingestron/runs",
      ".ingestron/source-access",
    ].some(
      (p) =>
        path === resolve(seed.root, p) ||
        path.startsWith(resolve(seed.root, p) + "/"),
    ),
});
const file = resolve(root, "project.yaml"),
  project = parse(readFileSync(file, "utf8"));
const flow = project.flows[0].id;
writeFileSync(file, "# Keep project engineering notes\n" + stringify(project));
const schedule = {
  apiVersion: "ingestron.schedule/v1",
  enabled: false,
  timeZone: "Pacific/Auckland",
  start: "2026-10-05T00:00:00Z",
  end: "2027-10-05T00:00:00Z",
  recurrence: {
    kind: "weekly",
    weekDays: ["Monday", "Friday"],
    times: ["09:15", "17:45"],
  },
  overlap: "skip",
  missed: "skip",
};
const cli = resolve(packageRoot, "build/cli/cli/index.js");
function command(args) {
  const child = spawnSync(
    process.execPath,
    [cli, "--project", root, "--json", "--no-input", ...args],
    { encoding: "utf8", timeout: 30000 },
  );
  assert.ok(child.stdout, child.stderr);
  return JSON.parse(child.stdout);
}
const operation = (name, args = {}, flags = []) => {
  const child = spawnSync(
    process.execPath,
    [
      cli,
      "--project",
      root,
      "--json",
      "--no-input",
      "operation",
      name,
      ...flags,
    ],
    { input: JSON.stringify(args), encoding: "utf8", timeout: 30000 },
  );
  assert.ok(child.stdout, child.stderr);
  return JSON.parse(child.stdout);
};
const passed = (r) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.result;
};
let result = "failed";
const checks = [];
try {
  const sdk = passed(execute({ root }, "schedule_check", { schedule }));
  assert.deepEqual(passed(operation("schedule_check", { schedule })), sdk);
  const schema = passed(command(["schema", "schedule"]));
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.properties.recurrence);
  const server = createServer(root, false),
    client = new Client({ name: "schedule-foundation", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    const tools = (await client.listTools()).tools.map((t) => t.name);
    assert.ok(tools.includes("ingestron_schedule_check"));
    assert.ok(tools.includes("ingestron_schedule_propose"));
    assert.ok(!tools.includes("ingestron_apply"));
    const response = await client.callTool({
      name: "ingestron_schedule_check",
      arguments: { schedule },
    });
    assert.deepEqual(passed(JSON.parse(response.content[0].text)), sdk);
    const invalid = await client.callTool({
      name: "ingestron_schedule_check",
      arguments: { schedule: { ...schedule, end: schedule.start } },
    });
    assert.ok(
      invalid.isError || JSON.parse(invalid.content[0].text).ok === false,
    );
  } finally {
    await client.close();
    await server.close();
  }
  checks.push("SDK, CLI and read-only MCP definition validation parity");
  const definition = resolve(root, "schedule.yaml");
  writeFileSync(definition, stringify(schedule));
  const proposal = passed(
    command([
      "--dry-run",
      "flow",
      "schedule",
      "edit",
      flow,
      "--file",
      definition,
    ]),
  );
  assert.equal(parse(readFileSync(file, "utf8")).flows[0].schedule, undefined);
  assert.equal(
    operation("apply", { proposal }).diagnostics[0].code,
    "PERMISSION",
  );
  passed(operation("apply", { proposal }, ["--allow-write"]));
  const reopened = passed(command(["flow", "schedule", "show", flow]));
  assert.deepEqual(reopened.schedule, sdk.schedule);
  assert.match(readFileSync(file, "utf8"), /^# Keep project engineering notes/);
  checks.push(
    "Reviewed inline schedule persists and reopens with comments; read-only apply denied",
  );
  const pending = passed(
    operation("schedule_propose", {
      flow,
      schedule: { ...schedule, enabled: true },
    }),
  );
  writeFileSync(
    file,
    readFileSync(file, "utf8") + "# External definition edit\n",
  );
  assert.equal(
    operation("apply", { proposal: pending }, ["--allow-write"]).diagnostics[0]
      .code,
    "STALE",
  );
  const blocked = operation("connection_prepare", { flow, validateOnly: true });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.diagnostics.some((d) => d.code === "SCHEDULE_UNSUPPORTED"));
  checks.push(
    "Stale proposal and older provider schedule generation fail closed",
  );
  passed(command(["flow", "schedule", "clear", flow]));
  assert.equal(
    passed(command(["flow", "schedule", "show", flow])).schedule,
    null,
  );
  checks.push("Explicit schedule removal preserves flow and project");
  result = "passed";
} finally {
  const hash = (p) =>
    createHash("sha256").update(readFileSync(p)).digest("hex");
  writeFileSync(
    process.env.INGESTRON_ACCEPTANCE_PROOF,
    JSON.stringify(
      {
        apiVersion: "ingestron.schedules-foundation/v1",
        result,
        root,
        flow,
        checks,
        cliVersion: JSON.parse(
          readFileSync(resolve(packageRoot, "package.json")),
        ).version,
        coreVersion: JSON.parse(readFileSync(resolve(core, "package.json")))
          .version,
        archives: {
          core: {
            path: resolve(process.env.INGESTRON_ACCEPTANCE_CORE_ARCHIVE),
            sha256: hash(process.env.INGESTRON_ACCEPTANCE_CORE_ARCHIVE),
          },
          cli: {
            path: resolve(process.env.INGESTRON_ACCEPTANCE_CLI_ARCHIVE),
            sha256: hash(process.env.INGESTRON_ACCEPTANCE_CLI_ARCHIVE),
          },
        },
        limits:
          "Durable schedule definition authoring through immutable installed SDK/CLI/MCP. Native generation, actual Studio workflow, local scheduling execution and vendor activation remain unverified; no source requests or deployment.",
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(JSON.stringify({ result, checks: checks.length, root }));
