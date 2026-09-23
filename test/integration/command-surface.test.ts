import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { parse, stringify } from "yaml";
import { installPackage } from "@ingestron/core/adapter";
import { fixture } from "../support/project.js";
const cli = resolve("build/cli/cli/index.js");
function run(root: string, ...args: string[]) {
  return spawnSync(
    process.execPath,
    [cli, "--project", root, "--no-input", ...args],
    { encoding: "utf8", timeout: 15000 },
  );
}
test("command help exposes implemented operations and rejects retired aliases", (t) => {
  const f = fixture(t);
  for (const [group, retired] of [
    ["activity", "preview"],
    ["flow", "explain"],
    ["environments", "inputs"],
  ]) {
    const help = run(f.root, group, "--help");
    assert.equal(help.status, 0);
    assert.doesNotMatch(help.stdout, new RegExp(`^  ${retired}\\b`, "m"));
    assert.notEqual(run(f.root, group, retired).status, 0);
  }
  const tables = run(f.root, "--json", "table", "list");
  assert.equal(tables.status, 0);
  assert.deepEqual(JSON.parse(tables.stdout).result, [
    { flow: "source", tables: ["customers", "orders"] },
  ]);
  const draft = run(
    f.root,
    "--json",
    "validate",
    "--mode",
    "draft",
    "--flow",
    "source",
  );
  assert.notEqual(draft.status, 0);
  assert.match(draft.stdout, /whole project/);
  const fill = run(f.root, "--json", "config", "fill");
  assert.notEqual(fill.status, 0);
  assert.match(fill.stdout, /requires an interactive terminal/);
});
test("unsupported dry-run commands fail before creating files or changing locks", (t) => {
  const f = fixture(t);
  const lock = readFileSync(resolve(f.root, "packages.lock.yaml"), "utf8");
  for (const args of [
    ["plan", "--out", "build/unexpected.json"],
    ["generate", "--plan", "missing.json", "--out", "unexpected"],
    ["providers", "install", "missing/provider@1.0.0"],
  ]) {
    const result = run(f.root, "--json", "--dry-run", ...args);
    assert.notEqual(result.status, 0);
    assert.equal(JSON.parse(result.stdout).diagnostics[0].code, "OPTION");
  }
  assert.equal(existsSync(resolve(f.root, "build/unexpected.json")), false);
  assert.equal(existsSync(resolve(f.root, "unexpected")), false);
  assert.equal(
    readFileSync(resolve(f.root, "packages.lock.yaml"), "utf8"),
    lock,
  );
  f.put("environments/dev.yaml", f.project.environments.dev);
  f.project.environments.dev = { $resolve: "./environments/dev.yaml" };
  f.put("project.yaml", f.project);
  const supported = run(
    f.root,
    "--json",
    "--dry-run",
    "environments",
    "add",
    "uat",
    "--from",
    "dev",
  );
  assert.equal(supported.status, 0);
  assert.equal(
    JSON.parse(supported.stdout).result.apiVersion,
    "ingestron.change/v1",
  );
  assert.equal(existsSync(resolve(f.root, "environments/uat.yaml")), false);
});

test("init honours environment selectors and writes editable provider YAML", async (t) => {
  for (const flags of [
    [],
    ["--env", "dev"],
    ["--environment", "uat"],
    ["-e", "qa"],
    ["--environments", "dev, prod"],
    ["--env", "uat", "--environments", "dev,prod"],
  ]) {
    await t.test(flags.join(" ") || "default environments", (t) => {
      const f = fixture(t);
      rmSync(resolve(f.root, "project.yaml"));
      const result = run(
        f.root,
        "init",
        "--id",
        "demo",
        "--provider",
        "example/fixture",
        ...flags,
      );
      assert.equal(result.status, 0, result.stderr);
      const expected = flags.includes("--environments")
        ? ["dev", "prod"]
        : flags.length
          ? [flags[1]]
          : ["dev", "test", "prod"];
      const text = readFileSync(resolve(f.root, "project.yaml"), "utf8");
      assert.match(text, /^apiVersion: ingestron.project\/v1/m);
      const project = parse(text);
      assert.deepEqual(Object.keys(project.environments), expected);
      assert.equal(project.packages.native, "fixture@1.0.0");
      assert.equal(project.providers.packages, undefined);
      for (const name of expected) {
        const env = readFileSync(
          resolve(f.root, `environments/${name}.yaml`),
          "utf8",
        );
        assert.match(env, /^apiVersion: ingestron.environment\/v1/m);
        assert.equal(parse(env).environment, name);
      }
      for (const name of ["dev", "test", "prod", "uat", "qa"].filter(
        (name) => !expected.includes(name),
      ))
        assert.equal(
          existsSync(resolve(f.root, `environments/${name}.yaml`)),
          false,
        );
      const repeated = run(
        f.root,
        "init",
        "--id",
        "demo",
        "--provider",
        "example/fixture@1.0.0",
      );
      assert.notEqual(repeated.status, 0);
      assert.equal(readFileSync(resolve(f.root, "project.yaml"), "utf8"), text);
    });
  }
});

test("init reports missing installed providers and install explains latest policy", (t) => {
  const f = fixture(t);
  rmSync(resolve(f.root, "project.yaml"));
  const missing = run(
    f.root,
    "init",
    "--id",
    "demo",
    "--provider",
    "example/missing@1.0.0",
  );
  assert.notEqual(missing.status, 0);
  assert.match(
    missing.stderr,
    /Install locked package example\/missing\/plugin\/provider\.yaml@1\.0\.0 using packages_install/,
  );
  assert.equal(existsSync(resolve(f.root, "project.yaml")), false);
  const latest = run(
    f.root,
    "plugin",
    "install",
    "example/missing@latest",
    "--cache-only",
  );
  assert.notEqual(latest.status, 0);
  assert.match(latest.stderr, /@latest is not supported.*plugin_versions/);
});

test("init refuses ambiguous installed versions but accepts an exact selection", (t) => {
  const f = fixture(t);
  rmSync(resolve(f.root, "project.yaml"));
  const origin = resolve(f.root, "fixture-origin");
  const manifestPath = resolve(origin, "plugin/provider.yaml");
  const manifest = parse(readFileSync(manifestPath, "utf8"));
  manifest.version = "1.0.1";
  writeFileSync(manifestPath, stringify(manifest));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: origin, stdio: "pipe" });
  git("add", ".");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "second version",
  );
  git("tag", "1.0.1");
  installPackage(f.root, "example/fixture@1.0.1", { fromGit: origin });
  const ambiguous = run(
    f.root,
    "init",
    "--id",
    "demo",
    "--provider",
    "example/fixture",
  );
  assert.notEqual(ambiguous.status, 0);
  assert.match(ambiguous.stderr, /Multiple installed versions/);
  assert.equal(existsSync(resolve(f.root, "project.yaml")), false);
  const exact = run(
    f.root,
    "init",
    "--id",
    "demo",
    "--provider",
    "example/fixture@1.0.1",
    "--env",
    "dev",
  );
  assert.equal(exact.status, 0, exact.stderr);
  assert.equal(
    parse(readFileSync(resolve(f.root, "project.yaml"), "utf8")).packages
      .native,
    "fixture@1.0.1",
  );
});

test("plugin scaffolding honours dry-run and installed browsing makes no marketplace claims", (t) => {
  const f = fixture(t);
  const preview = run(
    f.root,
    "--json",
    "--dry-run",
    "plugin",
    "scaffold",
    "example-sql",
    "--out",
    "new-provider",
  );
  assert.equal(preview.status, 0, preview.stdout + preview.stderr);
  assert.equal(
    JSON.parse(preview.stdout).result.apiVersion,
    "ingestron.change/v1",
  );
  assert.equal(existsSync(resolve(f.root, "new-provider")), false);
  const browsed = run(f.root, "plugin", "browse");
  assert.equal(browsed.status, 0, browsed.stderr);
  assert.match(browsed.stdout, /Installed plugins/);
  assert.doesNotMatch(
    browsed.stdout,
    /private previews|upstream catalogue|official plugins/i,
  );
});
