import { test } from "node:test";
import assert from "node:assert/strict";
import { operationAccess } from "../../src/mcp/operation-access.js";
test("durable scheduling and discovery require both explicit MCP permissions", () => {
  for (const name of [
    "scheduler_register",
    "scheduler_tick",
    "scheduler_pause",
    "scheduler_cancel",
    "scheduler_retry",
    "scheduler_worker_start",
    "scheduler_worker_stop",
    "discover",
    "run",
    "execution_recover",
    "checkpoint_preview",
    "checkpoint_apply",
    "connection_sample",
  ])
    assert.deepEqual(
      operationAccess(name),
      { execution: true, write: true },
      name,
    );
  for (const name of [
    "scheduler_inspect",
    "scheduler_status",
    "scheduler_history",
    "scheduler_worker_status",
    "schedule_occurrences",
    "schedule_propose",
    "connection_access",
    "run_status",
  ])
    assert.deepEqual(
      operationAccess(name),
      { execution: false, write: false },
      name,
    );
  for (const name of [
    "apply",
    "build",
    "connection_contracts",
    "packages_install",
  ])
    assert.deepEqual(
      operationAccess(name),
      { execution: false, write: true },
      name,
    );
});
