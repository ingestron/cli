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
    "ingestion_definition_read",
    "ingestion_definition_review",
    "ingestion_contract_check",
    "scheduler_inspect",
    "scheduler_status",
    "scheduler_history",
    "scheduler_worker_status",
    "schedule_occurrences",
    "schedule_propose",
    "connector_library",
    "connector_change_review",
    "connection_access",
    "run_status",
    "build_review",
    "programme_flow_review",
    "programme_delivery_review",
    "programme_delivery_baseline_review",
  ])
    assert.deepEqual(
      operationAccess(name),
      { execution: false, write: false },
      name,
    );
  for (const name of [
    "ingestion_definition_apply",
    "apply",
    "build",
    "build_apply",
    "platform_binding_apply",
    "programme_flow_apply",
    "programme_delivery_apply",
    "programme_secret_set",
    "workspace_initialisation_apply",
    "target_setup_apply",
    "shared_connection_apply",
    "platform_reuse_apply",
    "presentation_snapshot_apply",
    "package_install_apply",
    "connector_change_apply",
    "provider_install_apply",
    "programme_save",
    "programme_migration_apply",
    "platform_secret_set",
    "connection_contracts",
    "packages_install",
  ])
    assert.deepEqual(
      operationAccess(name),
      { execution: false, write: true },
      name,
    );
});
