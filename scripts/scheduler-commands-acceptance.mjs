/** Normal CLI scheduler grammar against exact installed core and actual local/files ingestion. */
import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  realpathSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const required = (key) => {
  const value = process.env["INGESTRON_ACCEPTANCE_" + key];
  assert.ok(value, key);
  return resolve(value);
};
const fixture = JSON.parse(readFileSync(required("FIXTURE"), "utf8"));
assert.equal(fixture.result, "passed");
const output = required("OUTPUT");
mkdirSync(output, { recursive: true });
const root = mkdtempSync(resolve(output, "normal-schedule-"));
cpSync(fixture.root, root, {
  recursive: true,
  filter: (path) =>
    !["build", "runs", "scheduler", "studio-jobs"].includes(
      path.split("/").at(-1),
    ),
});
const cliRoot = realpathSync(required("CLI_PACKAGE")),
  coreRoot = realpathSync(resolve(cliRoot, "../@ingestron/core"));
const require = createRequire(resolve(cliRoot, "package.json")),
  { parse, stringify } = require("yaml");
const { execute, executeAsync } = await import(
  pathToFileURL(resolve(coreRoot, "dist/sdk/index.js")).href
);
const context = {
  root,
  environment: "dev",
  allowWrite: true,
  allowExecute: true,
  allowNetwork: true,
};
const passed = (value) => {
  assert.equal(value.ok, true, JSON.stringify(value));
  return value.result;
};
const call = (operation, args = {}) => executeAsync(context, operation, args);
const projectFile = resolve(root, "project.yaml"),
  project = parse(readFileSync(projectFile, "utf8")),
  second = structuredClone(project.flows[0]);
second.id = "bronze_other";
for (const [name, table] of Object.entries(project.flows[0].tables)) {
  table.source.path = table.source.path.replace(fixture.root, root);
  const content =
    name === "orders"
      ? "id,amount\n1,12.50\n2,2.75\n3,30.00\n"
      : readFileSync(table.source.path, "utf8");
  writeFileSync(table.source.path, content);
  second.tables[name].source.path = resolve(root, "other-data", name + ".csv");
  mkdirSync(dirname(second.tables[name].source.path), { recursive: true });
  writeFileSync(second.tables[name].source.path, content);
}
const start = new Date(Math.floor(Date.now() / 1000) * 1000)
  .toISOString()
  .replace(".000Z", "Z");
project.flows[0].schedule.start = start;
second.schedule.start = start;
project.flows.push(second);
writeFileSync(projectFile, stringify(project));
const from = "build/generated",
  cli = resolve(cliRoot, "build/cli/cli/index.js");
passed(execute(context, "build", { out: from }));
passed(await call("runtime_prepare", { from }));
for (const action of ["discover", "review", "approve"])
  passed(await call("run", { from, action }));
const authority = ["--allow-write", "--allow-execute"];
function terminal(args, { status = 0, json = true } = {}) {
  const value = spawnSync(
    process.execPath,
    [
      cli,
      "--project",
      root,
      ...(json ? ["--json"] : []),
      "--no-input",
      ...args,
    ],
    { cwd: root, encoding: "utf8", timeout: 30000 },
  );
  assert.equal(value.status, status, value.stderr + value.stdout);
  return json ? JSON.parse(value.stdout) : value.stdout;
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(fn, timeout = 90000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await sleep(200);
  }
  throw new Error("Normal CLI scheduler observation timed out");
}
function commits(folder) {
  return existsSync(folder)
    ? readdirSync(folder, { withFileTypes: true }).flatMap((item) =>
        item.isDirectory()
          ? commits(resolve(folder, item.name))
          : item.name === "commit.json"
            ? [resolve(folder, item.name)]
            : [],
      )
    : [];
}
const sha = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
let result = "failed",
  workerId;
const checks = [];
try {
  const expectedDigests = {};
  for (const flow of ["bronze", "bronze_other"]) {
    const inspected = passed(terminal(["schedule", "inspect", flow]));
    assert.deepEqual(
      inspected,
      passed(await call("scheduler_inspect", { flow, from })),
    );
    expectedDigests[flow] = inspected.digest;
  }
  for (const flags of [[], ["--allow-write"], ["--allow-execute"]]) {
    const denied = terminal(
      [
        "schedule",
        "register",
        "bronze",
        "--expected-digest",
        expectedDigests.bronze,
        ...flags,
      ],
      { status: 2 },
    );
    assert.equal(denied.ok, false);
    assert.equal(denied.diagnostics[0].code, "PERMISSION");
  }
  assert.equal(existsSync(resolve(root, ".ingestron/scheduler")), false);
  const dry = terminal(
    [
      "--dry-run",
      "schedule",
      "worker",
      "start",
      "bronze",
      "--expected-digest",
      expectedDigests.bronze,
      ...authority,
    ],
    { status: 3 },
  );
  assert.equal(dry.diagnostics[0].code, "OPTION");
  for (const flow of ["bronze", "bronze_other"])
    passed(
      terminal([
        "schedule",
        "register",
        flow,
        "--expected-digest",
        expectedDigests[flow],
        "--grace-seconds",
        "3600",
        ...authority,
      ]),
    );
  const initial = passed(terminal(["schedule", "status", "bronze"]));
  assert.deepEqual(
    initial,
    passed(await call("scheduler_status", { flow: "bronze" })),
  );
  checks.push(
    "exact installed normal inspect/status/register match SDK, both permission flags are required and denied or dry-run commands create no journal",
  );
  const orders = project.flows[0].tables.orders.source.path,
    original = readFileSync(orders);
  writeFileSync(orders, "id,amount\nPRIVATE_BAD_SOURCE_VALUE,not-a-decimal\n");
  const due =
    Date.parse(start) +
    Math.ceil((Date.parse(initial.state.cursor) - Date.parse(start)) / 60000) *
      60000;
  console.log(
    "Waiting for actual normal CLI occurrence",
    new Date(due).toISOString(),
  );
  while (Date.now() < due + 1500)
    await sleep(Math.min(1000, due + 1500 - Date.now()));
  const failed = terminal(
    ["schedule", "tick", "bronze", "--limit", "1", ...authority],
    { status: 2 },
  );
  assert.equal(failed.ok, true);
  const outcome = failed.result.outcomes[0];
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.errorCode, "RUNTIME");
  assert.doesNotMatch(
    JSON.stringify(failed.result),
    /PRIVATE_BAD_SOURCE_VALUE|not-a-decimal/,
  );
  const history = passed(
    terminal([
      "schedule",
      "history",
      "bronze",
      "--status",
      "failed",
      "--query",
      "RUNTIME",
    ]),
  );
  assert.equal(history.entries[0].runId, outcome.runId);
  assert.equal(history.entries[0].attempt, 1);
  writeFileSync(orders, original);
  const retry = passed(
    terminal([
      "schedule",
      "retry",
      "bronze",
      outcome.occurrence,
      "--expected-digest",
      expectedDigests.bronze,
      ...authority,
    ]),
  );
  assert.equal(retry.outcomes[0].runId, outcome.runId);
  assert.equal(retry.outcomes[0].status, "succeeded");
  const firstCommit = commits(resolve(root, from, "data/bronze"))[0];
  assert.ok(firstCommit);
  const committed = JSON.parse(readFileSync(firstCommit, "utf8"));
  assert.equal(committed.identity.run_id, outcome.runId);
  assert.ok(committed.tables.every((t) => t.rows === 3));
  const firstBytes = sha(firstCommit);
  assert.equal(
    passed(
      terminal(["schedule", "history", "bronze", "--query", outcome.runId]),
    ).entries[0].attempt,
    2,
  );
  assert.match(
    terminal(["schedule", "history", "bronze"], { json: false }),
    new RegExp(outcome.runId),
  );
  checks.push(
    "normal tick reports actual malformed CSV failure with exit2; history and retry preserve original occurrence/run identity and commit actual three-row Parquet tables once",
  );
  for (const flow of ["bronze", "bronze_other"])
    passed(
      terminal([
        "schedule",
        "pause",
        flow,
        "--expected-digest",
        expectedDigests[flow],
        ...authority,
      ]),
    );
  const before = sha(resolve(root, ".ingestron/scheduler/state.sqlite"));
  for (const flags of [[], ["--allow-write"], ["--allow-execute"]]) {
    const denied = terminal(
      [
        "schedule",
        "worker",
        "start",
        "bronze",
        "--expected-digest",
        expectedDigests.bronze,
        ...flags,
      ],
      { status: 2 },
    );
    assert.equal(denied.diagnostics[0].code, "PERMISSION");
  }
  assert.equal(sha(resolve(root, ".ingestron/scheduler/state.sqlite")), before);
  const started = passed(
    terminal([
      "schedule",
      "worker",
      "start",
      "bronze_other",
      "bronze",
      "--expected-digests",
      JSON.stringify(expectedDigests),
      "--poll-seconds",
      "1",
      ...authority,
    ]),
  );
  workerId = started.worker.id;
  const view = await until(async () => {
    const w = passed(
      terminal(["schedule", "worker", "status", "--id", workerId]),
    ).workers[0];
    return w.alive &&
      w.health.length === 2 &&
      w.health.every((h) => h.status === "paused")
      ? w
      : undefined;
  });
  assert.deepEqual(new Set(view.flows), new Set(["bronze", "bronze_other"]));
  const human = terminal(["schedule", "worker", "status", "--id", workerId], {
    json: false,
  });
  assert.match(human, /bronze: paused/);
  assert.match(human, /bronze_other: paused/);
  assert.doesNotMatch(human, /"pid"|"token"|PRIVATE_/);
  const foreign = terminal(
    [
      "--environment",
      "foreign",
      "schedule",
      "worker",
      "stop",
      workerId,
      ...authority,
    ],
    { status: 2 },
  );
  assert.equal(foreign.diagnostics[0].code, "SCHEDULE_UNKNOWN");
  passed(
    terminal([
      "schedule",
      "register",
      "bronze_other",
      "--expected-digest",
      expectedDigests.bronze_other,
      ...authority,
    ]),
  );
  await until(
    async () =>
      passed(
        terminal([
          "schedule",
          "history",
          "bronze_other",
          "--status",
          "succeeded",
        ]),
      ).total >= 1,
  );
  assert.equal(sha(firstCommit), firstBytes);
  assert.equal(commits(resolve(root, from, "data/bronze")).length, 1);
  const otherCommit = JSON.parse(
    readFileSync(commits(resolve(root, from, "data/bronze_other"))[0], "utf8"),
  );
  assert.ok(otherCommit.tables.every((t) => t.rows === 3));
  passed(
    terminal([
      "schedule",
      "pause",
      "bronze_other",
      "--expected-digest",
      expectedDigests.bronze_other,
      ...authority,
    ]),
  );
  await until(async () =>
    passed(
      terminal(["schedule", "worker", "status", "--id", workerId]),
    ).workers[0].health.every((h) => h.status === "paused"),
  );
  const stopped = passed(
    terminal(["schedule", "worker", "stop", workerId, "--drain", ...authority]),
  );
  assert.equal(stopped.controlAccepted, true);
  await until(async () => {
    const w = passed(
      terminal(["schedule", "worker", "status", "--id", workerId]),
    ).workers[0];
    return w.status === "stopped" && !w.alive;
  });
  workerId = undefined;
  checks.push(
    "normal multi-flow start passes the exact reviewed digest map, persists after CLI exit, refuses foreign-environment control, resumes one flow without replaying the paused other and authenticates drain/stop",
  );
  const saved = readFileSync(projectFile);
  writeFileSync(projectFile, "invalid: [");
  const broken = passed(
    terminal(["schedule", "history", "bronze", "--query", outcome.runId]),
  );
  assert.equal(broken.entries[0].runId, outcome.runId);
  assert.ok(
    passed(terminal(["schedule", "worker", "status"])).workers.every(
      (w) => !w.alive,
    ),
  );
  writeFileSync(projectFile, saved);
  project.flows[0].schedule.start = new Date(Date.parse(start) + 1000)
    .toISOString()
    .replace(".000Z", "Z");
  writeFileSync(projectFile, stringify(project));
  passed(execute(context, "build", { out: from }));
  passed(await call("runtime_prepare", { flow: "bronze", from }));
  for (const action of ["discover", "review", "approve"])
    passed(await call("run", { flow: "bronze", from, action }));
  const current = passed(terminal(["schedule", "inspect", "bronze"]));
  passed(
    terminal([
      "schedule",
      "register",
      "bronze",
      "--expected-digest",
      current.digest,
      ...authority,
    ]),
  );
  const generations = passed(terminal(["schedule", "history", "bronze"]));
  assert.equal(generations.total, 0);
  assert.equal(generations.generations.length, 2);
  const archived = passed(
    terminal([
      "schedule",
      "history",
      "bronze",
      "--generation",
      generations.generations[1].id,
      "--status",
      "succeeded",
      "--query",
      outcome.runId,
      "--page-size",
      "10",
    ]),
  );
  assert.equal(archived.entries[0].runId, outcome.runId);
  assert.equal(archived.entries[0].attempt, 2);
  assert.equal(sha(firstCommit), firstBytes);
  checks.push(
    "normal history and worker inspection survive broken YAML; rebuilt registration retains the actual recovered run as read-only archived history without changing its committed bytes",
  );
  result = "passed";
} finally {
  if (workerId) {
    try {
      passed(
        await call("scheduler_worker_stop", { id: workerId, interrupt: true }),
      );
      await until(
        async () =>
          !passed(await call("scheduler_worker_status", { id: workerId }))
            .workers[0].alive,
        30000,
      );
    } catch (error) {
      console.error("Owned worker cleanup failed", error.message);
    }
  }
  const all = passed(await call("scheduler_worker_status", {})).workers;
  assert.ok(
    all.every((w) => !w.alive && ["stopped", "failed"].includes(w.status)),
  );
  writeFileSync(
    required("PROOF"),
    JSON.stringify(
      {
        result,
        checkedAt: new Date().toISOString(),
        root,
        checks,
        coreVersion: JSON.parse(readFileSync(resolve(coreRoot, "package.json")))
          .version,
        cliVersion: JSON.parse(readFileSync(resolve(cliRoot, "package.json")))
          .version,
        providerVersion: fixture.providerVersion,
        filesVersion: fixture.filesVersion,
        scope:
          "Actual normal terminal schedule/worker commands over immutable installed core/CLI and locked local/files synthetic CSV ingestion; no source network, cloud/native activation, browser or active worker-source death qualification",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ result, groups: checks.length, root }));
}
