import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/mcp/index.js";
import { execute } from "@ingestron/core";
import { fixture } from "../support/project.js";
test("MCP exposes the same operation results and omits write tools by default", async (t) => {
  const f = fixture(t),
    { root } = f;
  f.put("environments/dev.yaml", f.project.environments.dev);
  f.project.environments.dev = { $resolve: "./environments/dev.yaml" };
  f.put("project.yaml", f.project);
  const server = createServer(root);
  const client = new Client({ name: "synthetic-test", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  const tools = await client.listTools();
  assert.ok(!tools.tools.some((tool) => tool.name === "ingestron_unavailable"));
  const namespaceCatalogue: any = await client.callTool({
    name: "ingestron_plugin_commands",
    arguments: {},
  });
  assert.deepEqual(
    JSON.parse(namespaceCatalogue.content[0].text),
    execute({ root }, "plugin_commands"),
  );
  assert.ok(tools.tools.some((t) => t.name === "ingestron_plan"));
  assert.ok(tools.tools.some((t) => t.name === "ingestron_environment_add"));
  assert.ok(!tools.tools.some((t) => t.name === "ingestron_apply"));
  assert.ok(!tools.tools.some((t) => t.name === "ingestron_generate"));
  assert.ok(!tools.tools.some((t) => t.name === "ingestron_build"));
  assert.ok(tools.tools.some((t) => t.name === "ingestron_source_import"));
  const catalogue: any = await client.callTool({
    name: "ingestron_plugin_browse",
    arguments: {},
  });
  assert.deepEqual(
    JSON.parse(catalogue.content[0].text),
    execute({ root }, "plugin_browse"),
  );
  const offlineVersions: any = await client.callTool({
    name: "ingestron_plugin_versions",
    arguments: { provider: "adf" },
  });
  assert.equal(
    JSON.parse(offlineVersions.content[0].text).diagnostics[0].code,
    "PERMISSION",
  );
  const sources: any = await client.callTool({
    name: "ingestron_source_list",
    arguments: {},
  });
  assert.deepEqual(
    JSON.parse(sources.content[0].text),
    execute({ root }, "source_list"),
  );
  const result: any = await client.callTool({
    name: "ingestron_inspect",
    arguments: {},
  });
  assert.deepEqual(
    JSON.parse(result.content[0].text),
    execute({ root }, "inspect"),
  );
  const environment: any = await client.callTool({
    name: "ingestron_environment_add",
    arguments: { name: "uat", from: "dev" },
  });
  assert.deepEqual(
    JSON.parse(environment.content[0].text),
    execute({ root }, "environment_add", { name: "uat", from: "dev" }),
  );
  const schema: any = await client.readResource({
    uri: "ingestron://schemas/flow",
  });
  assert.equal(JSON.parse(schema.contents[0].text).type, "object");
  const blocked: any = await client.callTool({
    name: "ingestron_read",
    arguments: { path: "../outside.yaml" },
  });
  assert.equal(blocked.isError, true);
});
