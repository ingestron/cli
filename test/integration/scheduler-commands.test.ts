import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
const cli = resolve("build/cli/cli/index.js"),
  digest = "a".repeat(64);
function fixture(t: any) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "schedule-grammar-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = (...args: string[]) =>
    spawnSync(
      process.execPath,
      [cli, "--project", root, "--json", "--no-input", ...args],
      { encoding: "utf8", timeout: 15000 },
    );
  return { root, run };
}
test("installed CLI command help exposes normal schedule and worker grammar without creating a journal", (t) => {
  const { root, run } = fixture(t);
  for (const [args, expected] of [
    [["schedule", "--help"], /history.*flow/s],
    [["schedule", "worker", "start", "--help"], /--expected-digests/],
    [["schedule", "worker", "stop", "--help"], /--drain/],
    [["schedule", "history", "--help"], /--generation/],
  ] as const) {
    const result = run(...args);
    assert.equal(result.status, 0);
    assert.match(JSON.parse(result.stdout).result.text, expected);
  }
  assert.equal(existsSync(join(root, ".ingestron/scheduler")), false);
});
test("terminal scheduler permission and dry-run failures precede mutation; a published core without scheduling fails explicitly", (t) => {
  const { root, run } = fixture(t);
  for (const flags of [[], ["--allow-write"], ["--allow-execute"]]) {
    const result = run(
      "schedule",
      "register",
      "bronze",
      "--expected-digest",
      digest,
      ...flags,
    );
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).diagnostics[0].code, "PERMISSION");
  }
  const dry = run(
    "--dry-run",
    "schedule",
    "worker",
    "start",
    "bronze",
    "--expected-digest",
    digest,
    "--allow-write",
    "--allow-execute",
  );
  assert.equal(dry.status, 3);
  assert.equal(JSON.parse(dry.stdout).diagnostics[0].code, "OPTION");
  const unavailable = run("schedule", "history", "bronze");
  assert.equal(unavailable.status, 2);
  assert.equal(JSON.parse(unavailable.stdout).diagnostics[0].code, "OPERATION");
  assert.match(
    JSON.parse(unavailable.stdout).diagnostics[0].message,
    /qualified core\/CLI pair/,
  );
  assert.equal(existsSync(join(root, ".ingestron/scheduler")), false);
});
