import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { ecosystem } from "../support/ecosystem.js";
import { planProject } from "@ingestron/core/adapter";
import { renderProject, writeOutput } from "@ingestron/core/adapter";
import { extensionPackSchema, installPackage } from "@ingestron/core/adapter";
import { execute } from "@ingestron/core";
import { checkPluginCompatibility } from "@ingestron/core/adapter";

test("data-only pack and independent SQL generators compose through an explicit relation handover", (t) => {
  const f = ecosystem(t);
  assert.throws(() => planProject(f.root), /one provider renderer/);
  const plan = planProject(f.root, "dev", { delivery: true });
  assert.equal(plan.nodes[0].uses, "query@v1");
  const files = renderProject(f.root, plan);
  const manifest = JSON.parse(files["ingestron-delivery.json"]);
  assert.deepEqual(
    manifest.exports.map((e: any) => e.id),
    ["landing/load", "models/model"],
  );
  assert.deepEqual(manifest.exports[1].needs, ["landing/load"]);
  assert.equal(manifest.execution, "not-run");
  assert.deepEqual(
    JSON.parse(files["exports/landing/load/context.json"]).labels,
    ["from-pack"],
  );
  assert.ok(
    JSON.parse(files["exports/landing/load/context.json"]).bindings.includes(
      "warehouse",
    ),
  );
  const consumer = JSON.parse(files["exports/models/model/context.json"]);
  assert.equal(consumer.imports[0].location.name, "raw.customers");
  assert.ok(!consumer.bindings.includes("loader"));
  assert.deepEqual(renderProject(f.root, plan), files);
  writeOutput(resolve(f.root, "out"), plan, files);
  f.put("out/exports/models/model/model.sql", "-- user edit\n");
  assert.throws(
    () => writeOutput(resolve(f.root, "out"), plan, files),
    /edited or removed/,
  );
  f.pack.activities.customers.with.label = "changed";
  f.save();
  assert.throws(() => renderProject(f.root, plan), /changed since planning/);
});

test("pack compatibility, namespace, options and capabilities fail closed", (t) => {
  const f = ecosystem(t);
  f.pack.extends.version = "2.0.0";
  f.save();
  assert.throws(
    () => planProject(f.root, "dev", { delivery: true }),
    /requires loader@2.0.0/,
  );
  f.pack.extends.version = "1.0.0";
  f.pack.extends.contractVersion = "2.0.0";
  f.save();
  assert.throws(
    () => planProject(f.root, "dev", { delivery: true }),
    /unsupported extension contract/,
  );
  f.pack.extends.contractVersion = "1.0.0";
  f.manifests.loader.capabilities.packContracts["source-presets"].activities = [
    "other",
  ];
  f.save();
  assert.throws(
    () => planProject(f.root, "dev", { delivery: true }),
    /outside extension contract/,
  );
  f.manifests.loader.capabilities.packContracts["source-presets"].activities = [
    "query",
  ];
  f.pack.activities.customers.with.unsupported = true;
  f.save();
  assert.throws(
    () => planProject(f.root, "dev", { delivery: true }),
    /additional properties/,
  );
  delete f.pack.activities.customers.with.unsupported;
  f.pack.activities.customers.with.token = "forbidden-inline";
  f.save();
  assert.throws(
    () => planProject(f.root, "dev", { delivery: true }),
    /runtime \$secret reference/,
  );
  delete f.pack.activities.customers.with.token;
  f.project.flows[0].steps[0].uses = "missing:customers";
  f.save();
  assert.throws(
    () => planProject(f.root, "dev", { delivery: true }),
    /Unknown pack activity/,
  );
  f.project.flows[0].steps[0].uses = "sample:customers";
  f.manifests.loader.capabilities.artifactKinds = ["python-project"];
  f.save();
  assert.throws(
    () => planProject(f.root, "dev", { delivery: true }),
    /artifactKind/,
  );
  assert.equal(
    extensionPackSchema.safeParse({
      ...f.pack,
      renderer: { module: "evil.mjs" },
    }).success,
    false,
  );
  assert.throws(
    () => checkPluginCompatibility("4.2.0", ["future-feature"]),
    /Unsupported provider host feature/,
  );
});

test("delivery rejects missing handovers, locations, provider opt-in and stream claims", (t) => {
  const f = ecosystem(t);
  delete f.project.flows[1].requires.raw.handover;
  f.save();
  assert.throws(
    () => planProject(f.root, "dev", { delivery: true }),
    /explicit file export\/import boundary/,
  );
  f.project.flows[1].requires.raw.handover = "relation";
  delete f.project.flows[0].publishes.customers.location;
  f.save();
  assert.throws(
    () => planProject(f.root, "dev", { delivery: true }),
    /requires a relation location/,
  );
  f.project.flows[0].publishes.customers.location = {
    kind: "relation",
    binding: "warehouse",
    name: "raw.customers",
  };
  f.manifests.sqlmodel.capabilities.delivery = false;
  f.save();
  assert.throws(
    () => planProject(f.root, "dev", { delivery: true }),
    /must opt in/,
  );
  f.manifests.sqlmodel.capabilities.delivery = true;
  f.manifests.sqlmodel.capabilities.handovers = [];
  f.save();
  assert.throws(
    () => planProject(f.root, "dev", { delivery: true }),
    /Both providers/,
  );
  f.project.flows[1].requires.raw.handover = "stream";
  f.save();
  assert.throws(
    () => planProject(f.root, "dev", { delivery: true }),
    /Invalid|option/,
  );
});

test("installed pack is independently locked, works through build operation and rejects cache edits", (t) => {
  const f = ecosystem(t);
  const origin = resolve(f.root, "pack");
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: origin, stdio: "pipe" });
  git("init", "--quiet");
  git("add", ".");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "pack",
  );
  git("tag", "1.0.0");
  installPackage(f.root, "community/sample/pack.yaml@1.0.0", {
    fromGit: origin,
  });
  f.project.providers.packs.sample = {
    source: "community/sample/pack.yaml",
    version: "1.0.0",
  };
  f.save();
  const attach = execute({ root: f.root }, "pack_configure", {
    reference: "community/sample/pack.yaml@1.0.0",
    name: "second",
    provider: "load",
  });
  assert.equal(attach.ok, true, JSON.stringify(attach));
  const attached = execute({ root: f.root, allowWrite: true }, "apply", {
    proposal: attach.result,
  });
  assert.equal(attached.ok, true, JSON.stringify(attached));
  const outcome = execute({ root: f.root, allowWrite: true }, "build", {
    delivery: true,
    out: "delivery",
  });
  assert.equal(outcome.ok, true, JSON.stringify(outcome));
  assert.ok(existsSync(resolve(f.root, "delivery/ingestron-project.json")));
  assert.equal(
    execute({ root: f.root }, "schema", { name: "extension-pack" }).ok,
    true,
  );
  const plan = planProject(f.root, "dev", { delivery: true });
  const cached = Object.keys(plan.files).find(
    (k) => k.startsWith(".ingestron/packages/") && k.endsWith("/pack.yaml"),
  )!;
  f.put(cached, { ...f.pack, description: "tampered" });
  assert.throws(
    () => planProject(f.root, "dev", { delivery: true }),
    /integrity/,
  );
});

test("CLI and MCP build the same delivery and expose the extension-pack schema", async (t) => {
  const f = ecosystem(t);
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } =
    await import("@modelcontextprotocol/sdk/inMemory.js");
  const { createServer } = await import("../../src/mcp/index.js");
  const { readFileSync } = await import("node:fs");
  const cliResult = JSON.parse(
    execFileSync(
      process.execPath,
      [
        resolve("build/cli/cli/index.js"),
        "--project",
        f.root,
        "--json",
        "--no-input",
        "build",
        "--delivery",
        "--out",
        "cli-out",
      ],
      { encoding: "utf8" },
    ),
  );
  assert.equal(cliResult.ok, true);
  const server = createServer(f.root, true);
  const client = new Client({ name: "ecosystem-fixture", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  const result: any = await client.callTool({
    name: "ingestron_build",
    arguments: { delivery: true, out: "mcp-out" },
  });
  assert.equal(
    JSON.parse(result.content[0].text).ok,
    true,
    result.content[0].text,
  );
  const manifest = JSON.parse(
    readFileSync(resolve(f.root, "cli-out/ingestron-manifest.json"), "utf8"),
  );
  for (const name of Object.keys(manifest.files))
    assert.equal(
      readFileSync(resolve(f.root, "cli-out", name), "utf8"),
      readFileSync(resolve(f.root, "mcp-out", name), "utf8"),
    );
  const schema = await client.readResource({
    uri: "ingestron://schemas/extension-pack",
  });
  assert.match(String(schema.contents[0].text), /ingestron.extension-pack\/v1/);
});

test("pack defaults can be reviewed and overridden; undeclared host features and pack code are rejected", (t) => {
  const f = ecosystem(t);
  f.project.flows[0].steps[0].with = { label: "reviewed-override" };
  f.save();
  const plan = planProject(f.root, "dev", { flow: "landing" });
  assert.equal(plan.nodes[0].with.label, "reviewed-override");
  f.manifests.loader.compatibility.requiredFeatures = [];
  f.save();
  assert.throws(
    () => planProject(f.root, "dev", { delivery: true }),
    /must declare requiredFeatures/,
  );
});

test("delivery output budget fails before any output is written", (t) => {
  const f = ecosystem(t);
  for (const platform of ["loader", "sqlmodel"])
    f.put(
      `${platform}/index.mjs`,
      "export function validate() {} export function render() { return {'large.txt': {format:'text',value:'x'.repeat(6*1024*1024)}}; }",
    );
  const outcome = execute({ root: f.root, allowWrite: true }, "build", {
    delivery: true,
    out: "too-large",
  });
  assert.equal(outcome.ok, false);
  assert.match(
    JSON.stringify(outcome.diagnostics),
    /Project output exceeds 10000 files or 10 MiB/,
  );
  assert.equal(existsSync(resolve(f.root, "too-large")), false);
});

test("provider subsets reject cross-target handovers with incomplete producer packages", (t) => {
  const f = ecosystem(t);
  const unrelated = structuredClone(f.project.flows[0]);
  unrelated.id = "unrelated";
  unrelated.publishes.customers.location.name = "raw.other_customers";
  f.project.flows.push(unrelated);
  f.save();
  for (const selection of [{ provider: "model" }, { flow: "models" }]) {
    const result = execute({ root: f.root, allowWrite: true }, "build", {
      ...selection,
      out: "partial",
    });
    assert.equal(result.ok, false);
    assert.match(
      JSON.stringify(result.diagnostics),
      /Partial cross-target native handovers require path rebinding/,
    );
    assert.equal(existsSync(resolve(f.root, "partial")), false);
  }
});
