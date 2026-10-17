/** Installed terminal and read-only MCP parity for provider-owned resource identities. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
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
  coreRoot = realpathSync(resolve(cliRoot, "../@ingestron/core")),
  require = createRequire(resolve(cliRoot, "package.json"));
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
    name: "execution-resource-readonly-acceptance",
    version: "1.0.0",
  }),
  checks = [];
const context = {
  root: fixture.root,
  environment: "dev",
  allowWrite: false,
  allowExecute: false,
  allowNetwork: false,
};
const passed = (value) => {
  assert.equal(value.ok, true, JSON.stringify(value));
  return value.result;
};
const selection = { from: "build/resources", provider: "local" };
const before = readFileSync(
  resolve(fixture.root, selection.from, "ingestron-manifest.json"),
);
const expected = passed(
  await executeAsync(context, "execution_resources", selection),
);
const terminal = JSON.parse(
  execFileSync(
    process.execPath,
    [
      resolve(cliRoot, "build/cli/cli/index.js"),
      "--project",
      fixture.root,
      "--json",
      "--no-input",
      "operation",
      "execution_resources",
    ],
    { input: JSON.stringify(selection), encoding: "utf8" },
  ),
);
assert.deepEqual(passed(terminal), expected);
checks.push(
  "installed terminal operation with no permission flags returns exactly the read-only SDK resource inspection",
);
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
  const tools = (await client.listTools()).tools,
    tool = tools.find((v) => v.name === "ingestron_execution_resources");
  assert.ok(tool);
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.openWorldHint, false);
  assert.ok(!tools.some((v) => v.name === "ingestron_run"));
  const response = await client.callTool({
    name: tool.name,
    arguments: selection,
  });
  assert.deepEqual(passed(JSON.parse(response.content[0].text)), expected);
  checks.push(
    "installed read-only MCP exposes bounded resource inspection with read-only/closed-world annotations and no run tool; results match SDK and terminal",
  );
  for (const args of [
    { ...selection, flow: "bronze" },
    { ...selection, envFile: "private.env" },
  ]) {
    const refusal = await client.callTool({ name: tool.name, arguments: args });
    assert.ok(
      refusal.isError || JSON.parse(refusal.content[0].text).ok === false,
    );
  }
  assert.deepEqual(
    readFileSync(
      resolve(fixture.root, selection.from, "ingestron-manifest.json"),
    ),
    before,
  );
  assert.equal(JSON.stringify(expected).includes(fixture.root), false);
  checks.push(
    "MCP refuses ambiguous scope and credential overrides; inspection preserves managed build bytes and never exposes raw destination identities",
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
          "Immutable installed SDK/terminal/read-only MCP provider resource inspection; no normal command, Studio/editor interaction, cross-build/project broker or native execution claim.",
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(JSON.stringify({ result, groups: checks.length }));
