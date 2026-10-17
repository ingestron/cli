import test from "node:test";
import assert from "node:assert/strict";
import { Command } from "commander";
import { checkpointMaintenanceCommands } from "../../src/cli/workflow-commands.js";
import { operationAccess } from "../../src/mcp/operation-access.js";
import { terminal } from "../../src/cli/output.js";
function command() {
  const app = new Command().option("--dry-run").exitOverride();
  const calls: any[] = [];
  checkpointMaintenanceCommands(app, {
    context: () => ({
      root: "/synthetic",
      environment: "dev",
      allowNetwork: true,
    }),
    run: (name, args, context) => {
      calls.push({ name, args, context });
    },
  });
  return { app, calls };
}
test("checkpoint commands retain reviewed selection and digest with no source credentials or dependency authority", async () => {
  for (const action of ["preview", "apply"]) {
    const { app, calls } = command();
    await app.parseAsync(
      [
        "checkpoint",
        action,
        "--flow",
        "orders",
        "--previous",
        "build/previous",
        "--from",
        "build/current",
        "--profile",
        "landing",
        "--run-id",
        "upgrade",
        ...(action === "apply" ? ["--digest", "a".repeat(64)] : []),
      ],
      { from: "user" },
    );
    assert.deepEqual(calls, [
      {
        name: "checkpoint_" + action,
        args: {
          flow: "orders",
          previous: "build/previous",
          from: "build/current",
          profile: "landing",
          runId: "upgrade",
          ...(action === "apply" ? { expectedDigest: "a".repeat(64) } : {}),
        },
        context: {
          root: "/synthetic",
          environment: "dev",
          allowWrite: true,
          allowExecute: true,
          allowNetwork: false,
        },
      },
    ]);
  }
  const { app, calls } = command();
  await app.parseAsync(
    [
      "--dry-run",
      "checkpoint",
      "preview",
      "--flow",
      "orders",
      "--previous",
      "build/previous",
    ],
    { from: "user" },
  );
  assert.equal(calls[0].context.allowWrite, false);
  assert.equal(calls[0].context.allowExecute, false);
});
test("checkpoint summaries show the review digest and cursor without presenting migration as data or quality execution", () => {
  const value: any = {
    ok: true,
    operation: "checkpoint_preview",
    result: {
      id: "upgrade",
      status: "succeeded",
      flows: ["orders"],
      result: {
        flows: [
          {
            migration: {
              applied: false,
              digest: "a".repeat(64),
              head: { sequence: 1, bookmarks: { orders: "9007199254740993" } },
              internal: { rows: [{ secret: "PRIVATE" }] },
            },
          },
        ],
      },
    },
    diagnostics: [],
  };
  const text = terminal(value);
  assert.match(text, /migration reviewed/);
  assert.match(text, /9007199254740993/);
  assert.match(text, /Apply this exact digest/);
  assert.doesNotMatch(text, /PRIVATE|quality|rows/);
  value.result.recoveryRequired = true;
  assert.match(terminal(value), /run recover upgrade/);
});

test("retaining a baseline requires write access but grants no execution or network authority", async () => {
  for (const dry of [false, true]) {
    const { app, calls } = command();
    await app.parseAsync(
      [
        ...(dry ? ["--dry-run"] : []),
        "checkpoint",
        "retain",
        "--from",
        "build/current",
        "--to",
        "build/previous",
        "--profile",
        "landing",
      ],
      { from: "user" },
    );
    assert.deepEqual(calls[0], {
      name: "build_retain",
      args: { from: "build/current", to: "build/previous", profile: "landing" },
      context: {
        root: "/synthetic",
        environment: "dev",
        allowWrite: !dry,
        allowExecute: false,
        allowNetwork: false,
      },
    });
  }
  assert.deepEqual(operationAccess("build_retain"), {
    write: true,
    execution: false,
  });
  const text = terminal({
    ok: true,
    operation: "build_retain",
    result: {
      directory: "build/previous",
      files: 12,
      bytes: 1000,
      contentDigest: "a".repeat(64),
      rows: [{ secret: "PRIVATE" }],
    },
    diagnostics: [],
  } as any);
  assert.match(text, /Retained build: build\/previous/);
  assert.doesNotMatch(text, /PRIVATE|rows/);
});
