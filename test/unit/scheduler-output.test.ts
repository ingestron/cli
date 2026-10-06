import { test } from "node:test";
import assert from "node:assert/strict";
import { terminal, exitCode } from "../../src/cli/output.js";
const result = (operation: string, value: any) =>
  ({ ok: true, operation, result: value, diagnostics: [] }) as any;
test("failed scheduled work reports failure and retained identity without pretending dispatch succeeded", () => {
  const r = result("scheduler_tick", {
    outcomes: [
      { runId: "schedule-original", status: "failed", errorCode: "SOURCE" },
    ],
    state: {
      enabled: true,
      binding: {
        flow: "orders",
        from: "/private/build",
        fingerprint: "PRIVATE",
      },
      work: [{ status: "failed", token: "SECRET" }],
    },
  });
  assert.equal(exitCode(r), 2);
  const summary = terminal(r);
  assert.match(summary, /1 failed/);
  assert.match(summary, /schedule-original.*failed.*SOURCE/);
  assert.match(summary, /retry the same occurrence/);
  assert.doesNotMatch(summary, /PRIVATE|SECRET|private\/build|tick completed/);
  assert.equal(
    exitCode(
      result("scheduler_retry", { outcomes: [{ status: "interrupted" }] }),
    ),
    130,
  );
  assert.equal(exitCode(result("scheduler_tick", { outcomes: [] })), 0);
});
test("worker status is bounded and distinguishes lost worker recovery without serialising internal payloads", () => {
  const workers = Array.from({ length: 30 }, (_, i) => ({
    id: `worker-${i}`,
    status: "running",
    flows: ["orders"],
    recoveryRequired: i === 0,
    token: "SECRET",
    port: 31337,
  }));
  const summary = terminal(result("scheduler_worker_status", { workers }));
  assert.match(summary, /worker-0.*recovery required/);
  assert.match(summary, /Stop the lost driver/);
  assert.match(summary, /More results/);
  assert.doesNotMatch(summary, /worker-29|SECRET|31337/);
});

test("paged current and archived history retain run identity without disclosing execution bindings", () => {
  for (const generation of ["current", "archive-private-id"]) {
    const r = result("scheduler_history", {
      flow: "orders",
      generation,
      page: 2,
      pages: 5,
      total: 48,
      binding: { from: "PRIVATE_PATH", secret: "PRIVATE_SECRET" },
      entries: [
        {
          at: "2026-10-05T00:00:00Z",
          runId: "schedule-original",
          status: "failed",
          attempt: 2,
          errorCode: "SOURCE",
          token: "PRIVATE_TOKEN",
        },
      ],
    });
    const summary = terminal(r);
    assert.match(summary, /48 matching occurrences/);
    assert.match(summary, /Page 3 of 5/);
    assert.match(summary, /schedule-original.*failed.*attempt 2.*SOURCE/);
    assert.match(
      summary,
      generation === "current"
        ? /current registration/
        : /archived registration/,
    );
    assert.doesNotMatch(
      summary,
      /PRIVATE_|No registered schedule|archive-private-id/,
    );
    assert.equal(exitCode(r), 0);
  }
});

test("worker terminal output exposes bounded per-flow health and safe counts without private payload", () => {
  const summary = terminal(
    result("scheduler_worker_status", {
      workers: [
        {
          id: "worker-original",
          status: "running",
          alive: false,
          recoveryRequired: true,
          flows: ["orders", "customers"],
          token: "PRIVATE_TOKEN",
          health: Array.from({ length: 6 }, (_, i) => ({
            flow: "flow-" + i,
            status: "attention",
            errorCode: "SOURCE",
            counts: { failed: 1, succeeded: 2, private: "PRIVATE_COUNT" },
            message: "PRIVATE_ROW",
          })),
        },
      ],
    }),
  );
  assert.match(summary, /worker-original.*process absent.*recovery required/);
  assert.match(summary, /flow-0: attention.*SOURCE.*2 succeeded, 1 failed/);
  assert.match(summary, /1 more flows; use --json/);
  assert.doesNotMatch(summary, /flow-5:|PRIVATE_/);
});
