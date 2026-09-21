import { version as cliVersion } from "../../src/version.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { parse } from "yaml";
import { fixture } from "../support/project.js";
import { execute, type OperationName } from "@ingestron/core";
import { checkPluginCompatibility } from "@ingestron/core/adapter";
import { terminal } from "../../src/cli/output.js";
const cli = resolve("build/cli/cli/index.js");
function command(root: string, ...args: string[]) {
  return spawnSync(
    process.execPath,
    [cli, "--project", root, "--no-input", ...args],
    { encoding: "utf8", timeout: 15000 },
  );
}
function json(root: string, ...args: string[]) {
  const child = command(root, "--json", ...args);
  assert.equal(child.stderr, "", child.stderr);
  assert.equal(child.stdout.trim().split("\n").length, 1, child.stdout);
  return { ...child, response: JSON.parse(child.stdout) };
}
function apply(root: string, operation: OperationName, args: any) {
  const proposal = execute({ root }, operation, args);
  assert.equal(proposal.ok, true, JSON.stringify(proposal));
  const result = execute({ root, allowWrite: true }, "apply", {
    proposal: proposal.result,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}
test("root help exposes a bounded workflow and JSON parser/help failures remain machine readable", (t) => {
  const f = fixture(t);
  const help = json(f.root, "--help");
  assert.equal(help.status, 0);
  for (const name of [
    "source",
    "contract",
    "flow",
    "check",
    "build",
    "plugin",
    "advanced",
  ])
    assert.match(help.response.result.text, new RegExp(`^  ${name}\\b`, "m"));
  for (const name of [
    "deploy",
    "providers",
    "packages",
    "table",
    "dataset",
    "step",
    "generate",
  ])
    assert.doesNotMatch(
      help.response.result.text,
      new RegExp(`^  ${name}\\b`, "m"),
    );
  for (const args of [
    ["unknown"],
    ["source", "add"],
    ["build", "--unsupported"],
    ["deploy", "apply"],
    ["source", "add", "unsafe", "--type", "adls", "--execution", "surprise"],
  ]) {
    const result = json(f.root, ...args);
    assert.notEqual(result.status, 0, args.join(" "));
    assert.equal(result.response.ok, false);
  }
  const group = json(f.root, "source", "--help");
  assert.doesNotMatch(
    group.response.result.text,
    /Planned:|^  (discover|remove)\b/m,
  );
  assert.doesNotMatch(
    json(f.root, "contract", "draft", "--help").response.result.text,
    /--assist|--sample|--requirements/,
  );
  assert.doesNotMatch(
    json(f.root, "contract", "--help").response.result.text,
    /^  validate\b/m,
  );
  const version = json(f.root, "--version");
  assert.equal(version.status, 0);
  assert.equal(version.response.result.text.trim(), cliVersion);
});
test("unimplemented commands are absent and fail without writes", (t) => {
  const f = fixture(t),
    before = readFileSync(resolve(f.root, "project.yaml"), "utf8");
  for (const args of [
    ["source", "discover", "private", "--via", "adf", "--wait"],
    ["source", "status", "private"],
    ["deploy", "plan", "--out", "unexpected.json"],
    ["deploy", "apply", "--plan", "missing.json"],
    ["deploy", "status", "--run", "one"],
    ["flow", "run", "one"],
    ["flow", "status", "one"],
    ["plugin", "remove", "adf@2.2.0"],
  ]) {
    const result = json(f.root, ...args);
    assert.equal(result.status, 3, JSON.stringify(result));
    assert.equal(result.response.diagnostics[0].code, "COMMAND");
  }
  assert.equal(readFileSync(resolve(f.root, "project.yaml"), "utf8"), before);
  assert.equal(existsSync(resolve(f.root, "unexpected.json")), false);
  const dry = json(f.root, "--dry-run", "build");
  assert.equal(dry.response.diagnostics[0].code, "OPTION");
  assert.equal(existsSync(resolve(f.root, "build/generated")), false);
});
test("source import to contract to flow build is shared, non-destructive and preserves provenance", (t) => {
  const f = fixture(t);
  f.put("environments/dev.yaml", f.project.environments.dev);
  f.project.environments.dev = { $resolve: "./environments/dev.yaml" };
  f.put("project.yaml", f.project);
  f.put("metadata.json", {
    table: "dbo.Customers",
    columns: [
      {
        name: "id",
        logicalType: "integer",
        physicalType: "BIGINT",
        required: true,
      },
      { name: "name", logicalType: "string" },
    ],
  });
  const preview = json(
    f.root,
    "--dry-run",
    "source",
    "add",
    "northwind",
    "--type",
    "azure-sql",
  );
  assert.equal(preview.status, 0, preview.stdout);
  assert.equal(existsSync(resolve(f.root, "sources/northwind.yaml")), false);
  apply(f.root, "source_add", { id: "northwind", type: "azure-sql" });
  assert.equal(
    json(f.root, "source", "import", "northwind", "--metadata", "metadata.json")
      .status,
    0,
  );
  assert.notEqual(json(f.root, "contract", "show", "metadata.json").status, 0);
  const draft = json(
    f.root,
    "contract",
    "draft",
    "clients",
    "--source",
    "northwind",
    "--entity",
    "dbo.Customers",
  );
  assert.equal(draft.status, 0, draft.stdout);
  assert.equal(
    parse(readFileSync(resolve(f.root, "contracts/clients.odcs.yaml"), "utf8"))
      .status,
    "draft",
  );
  assert.equal(
    JSON.parse(
      readFileSync(
        resolve(f.root, "contracts/clients.provenance.json"),
        "utf8",
      ),
    ).sourceId,
    "northwind",
  );
  assert.equal(json(f.root, "contract", "check", "clients").status, 0);
  assert.equal(
    json(f.root, "contract", "draft", "clients", "--source", "northwind")
      .status,
    5,
  );
  const created = json(
    f.root,
    "flow",
    "add",
    "new_clients",
    "--contract",
    "clients",
    "--standard",
    "snapshot-with-history@v1",
  );
  assert.equal(created.status, 0, created.stdout);
  const built = json(f.root, "build");
  assert.equal(built.status, 0, built.stdout);
  assert.equal(json(f.root, "check", "--output", "build/generated").status, 0);
  assert.equal(
    execute({ root: f.root }, "build").diagnostics[0].code,
    "PERMISSION",
  );
  f.put("patch.yaml", { execution: "local" });
  assert.equal(
    json(f.root, "source", "configure", "northwind", "--patch", "patch.yaml")
      .status,
    0,
  );
  assert.equal(
    json(f.root, "contract", "draft", "stale", "--source", "northwind").response
      .diagnostics[0].code,
    "STALE",
  );
});
test("source and contract boundaries reject identity mismatch, unsupported fields and ambiguous inputs", (t) => {
  const f = fixture(t);
  apply(f.root, "source_add", { id: "files", type: "adls", format: "csv" });
  f.put("wrong.json", {
    sourceId: "another",
    columns: [{ name: "id", logicalType: "integer" }],
  });
  assert.equal(
    execute({ root: f.root }, "source_import", {
      id: "files",
      metadata: "wrong.json",
    }).diagnostics[0].code,
    "SOURCE",
  );
  assert.equal(
    execute({ root: f.root }, "source_add", { id: "../outside", type: "adls" })
      .ok,
    false,
  );
  assert.equal(
    execute({ root: f.root }, "source_configure", {
      id: "files",
      patch: { password: "do-not-store" },
    }).ok,
    false,
  );
  assert.equal(
    execute({ root: f.root }, "source_configure", {
      id: "files",
      patch: { id: "changed" },
    }).ok,
    false,
  );
  assert.equal(
    execute({ root: f.root }, "contract_create", {
      id: "x",
      source: "files",
      metadata: "wrong.json",
    }).diagnostics[0].code,
    "INPUT",
  );
  for (const args of [
    ["check", "--setup", "--flow", "source"],
    ["check", "--draft", "--output", "out"],
    ["contract", "draft", "one", "--id", "two"],
  ])
    assert.notEqual(json(f.root, ...args).status, 0);
});
test("provider-neutral init then plugin registration is idempotent and protects bindings", (t) => {
  const f = fixture(t);
  const fresh = mkdtempSync(resolve(tmpdir(), "ingestron-app-"));
  t.after(() => rmSync(fresh, { recursive: true, force: true }));
  assert.equal(
    json(fresh, "init", "--id", "demo", "--environments", "dev").status,
    0,
  );
  const installed = json(
    fresh,
    "plugin",
    "install",
    "example/fixture@1.0.0",
    "--from-git",
    resolve(f.root, "fixture-origin"),
  );
  assert.equal(installed.status, 0, installed.stdout);
  const project = parse(readFileSync(resolve(fresh, "project.yaml"), "utf8"));
  assert.equal(project.defaults.provider, "databricks");
  assert.equal(
    project.providers.configurations.databricks.binding,
    "databricks_platform",
  );
  assert.equal(
    json(fresh, "plugin", "configure", "example/fixture@1.0.0").status,
    0,
  );
  assert.equal(
    json(
      fresh,
      "plugin",
      "configure",
      "example/fixture@1.0.0",
      "--name",
      "second",
    ).status,
    0,
  );
  const env = parse(
    readFileSync(resolve(fresh, "environments/dev.yaml"), "utf8"),
  );
  assert.deepEqual(Object.keys(env.bindings).sort(), [
    "databricks_platform",
    "second_platform",
  ]);
});
test("terminal output is concise, escapes control characters and leaves JSON payload intact", () => {
  const result: any = {
    apiVersion: "ingestron.operation/v1",
    operation: "source_list",
    ok: true,
    diagnostics: [],
    result: [],
  };
  assert.match(terminal(result), /No sources configured/);
  assert.doesNotMatch(terminal(result), /◆|\[\]|apiVersion/);
  const secret = {
    ...result,
    operation: "provider_command",
    result: { arbitrary: "large-sensitive-payload" },
  };
  assert.doesNotMatch(terminal(secret), /large-sensitive-payload/);
  assert.match(terminal(secret, true), /large-sensitive-payload/);
  const error: any = {
    ...result,
    ok: false,
    diagnostics: [{ code: "INPUT", message: "bad\u001b[31mvalue" }],
  };
  assert.doesNotMatch(terminal(error), /\u001b/);
});

test("provider manifest ABI remains independent of the CLI package version", () => {
  for (const minimum of [undefined, "0.1.0", "2.4.0", "4.2.0"])
    assert.doesNotThrow(() => checkPluginCompatibility(minimum));
  for (const minimum of ["4.2.1", "4.3.0", "5.0.0"])
    assert.throws(
      () => checkPluginCompatibility(minimum),
      /requires plugin compatibility/,
    );
});
