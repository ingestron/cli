import test from "node:test";
import assert from "node:assert/strict";
import { Command } from "commander";
import { schedulerCommands } from "../../src/cli/scheduler-commands.js";
const digest = "a".repeat(64),
  occurrence = "b".repeat(64);
async function parse(args: string[]) {
  const calls: any[] = [],
    app = new Command()
      .exitOverride()
      .configureOutput({ writeErr() {}, writeOut() {} });
  schedulerCommands(app, {
    invoke: async (operation, request, permissions) => {
      calls.push({ operation, request, permissions });
    },
  });
  await app.parseAsync(["node", "ingestron", "schedule", ...args]);
  return calls;
}
test("normal schedule reads retain exact build/history scope without granting execution or writes", async () => {
  for (const [args, operation, request] of [
    [
      [
        "inspect",
        "bronze",
        "--from",
        "build/path with spaces",
        "--profile",
        "local",
      ],
      "scheduler_inspect",
      { flow: "bronze", from: "build/path with spaces", profile: "local" },
    ],
    [["status", "bronze"], "scheduler_status", { flow: "bronze" }],
    [
      [
        "history",
        "bronze",
        "--generation",
        "archive",
        "--status",
        "failed",
        "--query",
        "2026-10-05",
        "--page",
        "2",
        "--page-size",
        "10",
      ],
      "scheduler_history",
      {
        flow: "bronze",
        generation: "archive",
        status: "failed",
        query: "2026-10-05",
        page: 2,
        pageSize: 10,
      },
    ],
    [
      ["worker", "status", "--id", "exact-worker"],
      "scheduler_worker_status",
      { id: "exact-worker" },
    ],
  ] as const)
    assert.deepEqual(await parse([...args]), [
      { operation, request, permissions: { write: false, execute: false } },
    ]);
  assert.deepEqual((await parse(["history", "bronze"]))[0].request, {
    flow: "bronze",
    generation: "current",
    status: "all",
    query: "",
    page: 0,
    pageSize: 20,
  });
});
test("every scheduler mutation requires both explicit flags before invoking the shared operation", async () => {
  const commands = [
    ["register", "bronze", "--expected-digest", digest],
    ["tick", "bronze"],
    ["pause", "bronze", "--expected-digest", digest],
    ["cancel", "bronze", occurrence, "--expected-digest", digest],
    ["retry", "bronze", occurrence, "--expected-digest", digest],
    ["worker", "start", "bronze", "--expected-digest", digest],
    ["worker", "stop", "exact-worker"],
  ];
  for (const command of commands) {
    for (const flags of [[], ["--allow-write"], ["--allow-execute"]])
      await assert.rejects(
        parse([...command, ...flags]),
        /--allow-write and --allow-execute/,
      );
    assert.deepEqual(
      (await parse([...command, "--allow-write", "--allow-execute"]))[0]
        .permissions,
      { write: true, execute: true },
    );
  }
});
test("registration, retry and worker grammar preserve digests, original occurrence and stop mode", async () => {
  const authority = ["--allow-write", "--allow-execute"];
  assert.deepEqual(
    (
      await parse([
        "register",
        "bronze",
        "--expected-digest",
        digest,
        "--from",
        "build/reviewed",
        "--profile",
        "local",
        "--grace-seconds",
        "0",
        ...authority,
      ])
    )[0].request,
    {
      flow: "bronze",
      expectedDigest: digest,
      from: "build/reviewed",
      profile: "local",
      graceSeconds: 0,
    },
  );
  assert.deepEqual(
    (
      await parse([
        "retry",
        "bronze",
        occurrence,
        "--expected-digest",
        digest,
        "--env-file",
        ".local/source.env",
        ...authority,
      ])
    )[0].request,
    {
      flow: "bronze",
      occurrence,
      expectedDigest: digest,
      envFile: ".local/source.env",
    },
  );
  const expectedDigests = { bronze: digest, silver: occurrence };
  assert.deepEqual(
    (
      await parse([
        "worker",
        "start",
        "silver",
        "bronze",
        "--expected-digests",
        JSON.stringify(expectedDigests),
        "--poll-seconds",
        "1",
        "--limit",
        "20",
        "--env-file",
        ".local/source.env",
        ...authority,
      ])
    )[0].request,
    {
      flows: ["silver", "bronze"],
      expectedDigests,
      pollSeconds: 1,
      limit: 20,
      envFile: ".local/source.env",
    },
  );
  for (const drain of [false, true])
    assert.deepEqual(
      (
        await parse([
          "worker",
          "stop",
          "exact-worker",
          ...(drain ? ["--drain"] : []),
          ...authority,
        ])
      )[0].request,
      { id: "exact-worker", interrupt: !drain },
    );
});
test("invalid bounds, mixed digest selections and unsafe extra controls are rejected without disclosing their values", async () => {
  const authority = ["--allow-write", "--allow-execute"];
  for (const args of [
    ["history", "bronze", "--page", "-1"],
    ["history", "bronze", "--page-size", "101"],
    ["history", "bronze", "--page", "1e1"],
    ["tick", "bronze", "--limit", "0", ...authority],
    [
      "worker",
      "start",
      "bronze",
      "--expected-digest",
      digest,
      "--poll-seconds",
      "61",
      ...authority,
    ],
    ["worker", "start", "bronze", ...authority],
    [
      "worker",
      "start",
      "bronze",
      "silver",
      "--expected-digest",
      digest,
      ...authority,
    ],
    [
      "worker",
      "start",
      "bronze",
      "--expected-digest",
      digest,
      "--expected-digests",
      "{}",
      ...authority,
    ],
    [
      "worker",
      "start",
      "bronze",
      "--expected-digests",
      "PRIVATE_SECRET",
      ...authority,
    ],
    ["worker", "start", "bronze", "--expected-digests", "[]", ...authority],
    ["worker", "stop", "exact-worker", "--pid", "31337", ...authority],
    [
      "worker",
      "start",
      "bronze",
      "--expected-digest",
      digest,
      "--clock",
      "override",
      ...authority,
    ],
  ])
    await assert.rejects(parse(args), (error) => {
      assert.doesNotMatch((error as Error).message, /PRIVATE_SECRET/);
      return true;
    });
});
