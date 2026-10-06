/** Exact installed read-only MCP history parity against a qualified source fixture. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const required = (key) => {
  const value = process.env["INGESTRON_ACCEPTANCE_" + key];
  assert.ok(value, key);
  return resolve(value);
};
const fixture = JSON.parse(readFileSync(required("FIXTURE"), "utf8"));
assert.equal(fixture.result, "passed");
const cliRoot = realpathSync(required("CLI_PACKAGE")),
  coreRoot = realpathSync(resolve(cliRoot, "../@ingestron/core"));
const require = createRequire(resolve(cliRoot, "package.json"));
const { executeAsync } = await import(
  pathToFileURL(resolve(coreRoot, "dist/sdk/index.js")).href
);
const { Client } = await import(
  pathToFileURL(require.resolve("@modelcontextprotocol/sdk/client/index.js"))
    .href
);
const { StdioClientTransport } = await import(
  pathToFileURL(require.resolve("@modelcontextprotocol/sdk/client/stdio.js"))
    .href
);
const client = new Client({
  name: "history-readonly-acceptance",
  version: "1.0.0",
});
const context = {
  root: fixture.root,
  environment: "dev",
  allowWrite: false,
  allowExecute: false,
  allowNetwork: false,
};
const passed = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.result;
};
const mcp = async (args) =>
  JSON.parse(
    (
      await client.callTool({
        name: "ingestron_scheduler_history",
        arguments: args,
      })
    ).content[0].text,
  );
const checks = [];
let result = "failed";
try {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [
        resolve(cliRoot, "build/cli/cli/index.js"),
        "--project",
        fixture.root,
        "advanced",
        "mcp",
        "serve",
      ],
      stderr: "pipe",
    }),
  );
  const names = (await client.listTools()).tools.map((t) => t.name);
  assert.ok(names.includes("ingestron_scheduler_history"));
  assert.ok(!names.includes("ingestron_scheduler_worker_start"));
  assert.ok(!names.includes("ingestron_scheduler_worker_stop"));
  checks.push(
    "installed MCP exposes history with no write or execute permission while omitting worker mutations",
  );
  const current = passed(
    await executeAsync(context, "scheduler_history", { flow: "bronze" }),
  );
  assert.deepEqual(passed(await mcp({ flow: "bronze" })), current);
  assert.ok(current.generations.length >= 2);
  const selection = {
    flow: "bronze",
    generation: current.generations[1].id,
    status: "succeeded",
    page: 0,
    pageSize: 10,
  };
  const sdk = passed(
    await executeAsync(context, "scheduler_history", selection),
  );
  assert.ok(sdk.entries.length);
  assert.deepEqual(passed(await mcp(selection)), sdk);
  assert.deepEqual(
    passed(await mcp({ ...selection, query: sdk.entries[0].runId })).entries,
    sdk.entries,
  );
  assert.equal(passed(await mcp({ ...selection, page: 1 })).entries.length, 0);
  assert.doesNotMatch(
    JSON.stringify(sdk),
    /"token"|"binding"|"from"|"pid"|"port"/,
  );
  checks.push(
    "actual archived source run, stable identity, status/search and page selection match installed SDK and read-only MCP without execution payload",
  );
  for (const args of [
    { ...selection, flow: "foreign" },
    { ...selection, page: -1 },
    { ...selection, pageSize: 1001 },
    { ...selection, query: "x".repeat(101) },
    { ...selection, from: "/outside" },
    { ...selection, envFile: "private.env" },
  ]) {
    const refusal = await client.callTool({
      name: "ingestron_scheduler_history",
      arguments: args,
    });
    if (refusal.isError)
      assert.match(
        refusal.content[0].text,
        /Input validation|SCHEDULE_HISTORY|Unrecognized/,
      );
    else assert.equal(JSON.parse(refusal.content[0].text).ok, false);
  }
  checks.push(
    "read-only MCP refuses foreign generation ownership, unbounded selections and build or credential overrides",
  );
  result = "passed";
} finally {
  await client.close();
  writeFileSync(
    required("PROOF"),
    JSON.stringify(
      {
        result,
        checkedAt: new Date().toISOString(),
        root: fixture.root,
        checks,
        coreVersion: JSON.parse(readFileSync(resolve(coreRoot, "package.json")))
          .version,
        cliVersion: JSON.parse(readFileSync(resolve(cliRoot, "package.json")))
          .version,
        scope:
          "Immutable installed SDK/read-only MCP history over the actual qualified local/files source occurrence; no native execution or browser qualification",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ result, groups: checks.length }));
}
