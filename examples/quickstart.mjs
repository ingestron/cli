/** Executable quickstart; also run against the installed CLI archive. */
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const cli =
  process.argv[2] ??
  fileURLToPath(new URL("../build/cli/cli/index.js", import.meta.url));
const root = mkdtempSync(resolve(tmpdir(), "ingestron-quickstart-"));
function run(...args) {
  const result = spawnSync(
    process.execPath,
    [cli, "--project", root, "--json", "--no-input", ...args],
    { encoding: "utf8", timeout: 15000 },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.ok, true, JSON.stringify(response));
  return response.result;
}
try {
  run("init", "--id", "retail");
  run("--dry-run", "source", "add", "customers", "--type", "csv");
  assert.equal(existsSync(resolve(root, "sources/customers.yaml")), false);
  run("source", "add", "customers", "--type", "csv");
  writeFileSync(
    resolve(root, "metadata.json"),
    JSON.stringify({
      table: "customers",
      columns: [
        {
          name: "id",
          logicalType: "integer",
          physicalType: "BIGINT",
          required: true,
        },
        { name: "name", logicalType: "string", physicalType: "STRING" },
      ],
    }),
  );
  run("source", "import", "customers", "--metadata", "metadata.json");
  run("contract", "draft", "customers", "--source", "customers");
  run("contract", "check", "customers");
  run("check", "--draft");
  assert.equal(
    existsSync(resolve(root, "contracts/customers.odcs.yaml")),
    true,
  );
  const before = readFileSync(
    resolve(root, "contracts/customers.odcs.yaml"),
    "utf8",
  );
  const rejected = spawnSync(
    process.execPath,
    [
      cli,
      "--project",
      root,
      "--json",
      "--no-input",
      "contract",
      "draft",
      "customers",
      "--source",
      "customers",
    ],
    { encoding: "utf8", timeout: 15000 },
  );
  assert.notEqual(rejected.status, 0);
  assert.equal(JSON.parse(rejected.stdout).ok, false);
  assert.equal(
    readFileSync(resolve(root, "contracts/customers.odcs.yaml"), "utf8"),
    before,
  );
  // A core-owned synthetic starter demonstrates build semantics without private plugins.
  run("plugin", "scaffold", "example-sql", "--out", "provider");
  const pluginRoot = resolve(root, "provider");
  for (const args of [
    ["plugin", "check", "--delivery"],
    ["build"],
    ["check", "--output", "build/generated"],
  ]) {
    const r = spawnSync(
      process.execPath,
      [cli, "--project", pluginRoot, "--json", "--no-input", ...args],
      { encoding: "utf8", timeout: 15000 },
    );
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(JSON.parse(r.stdout).ok, true);
  }
  assert.match(
    readFileSync(resolve(pluginRoot, "build/generated/model.sql"), "utf8"),
    /CREATE VIEW example_view/,
  );
  console.log(
    "Quickstart passed: metadata, contract, dry run, overwrite protection and synthetic SQL build.",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
