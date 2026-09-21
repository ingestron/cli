import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parse } from "yaml";
import { fixture } from "../support/project.js";
import { execute } from "@ingestron/core";
import {
  canonicalPackageReference,
  installPackage,
  packageLock,
} from "@ingestron/core/adapter";
import {
  browseProviders,
  friendlyReference,
  taggedVersions,
  providerVersions,
} from "@ingestron/core/adapter";
import { richTerminal, decorate } from "../../src/cli/presentation.js";
const cli = resolve("build/cli/cli/index.js");
function command(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [cli, "--project", root, ...args], {
    encoding: "utf8",
    timeout: 20000,
  });
}
test("installed catalogue is offline and shared with JSON operations", (t) => {
  const f = fixture(t);
  const result = execute(
    { root: f.root, allowNetwork: false },
    "plugin_browse",
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.result, browseProviders(f.root));
  assert.deepEqual(
    result.result.map((p: any) => p.id),
    ["fixture"],
  );
  assert.deepEqual(browseProviders("/missing"), []);
  assert.equal(
    execute({ root: f.root }, "plugin_versions", {
      provider: "example/fixture",
    }).diagnostics[0].code,
    "PERMISSION",
  );
});
test("explicit references retain canonical locks and custom paths", () => {
  for (const ref of [
    "example/provider@1.2.3",
    "example/provider@v1.2.3",
    "example/provider/plugin/provider.yaml@1.2.3",
  ]) {
    assert.equal(
      canonicalPackageReference(ref),
      "example/provider/plugin/provider.yaml@1.2.3",
    );
    assert.equal(friendlyReference(ref), "example/provider@1.2.3");
  }
  assert.equal(
    friendlyReference("example/provider/alternate.yaml@1.2.3"),
    "example/provider/alternate.yaml@1.2.3",
  );
  assert.throws(() => canonicalPackageReference("adf@1.2.3"), /explicit owner/);
});
test("version parsing peels annotated tags, sorts numerically and flags conflicting aliases", () => {
  const a = "a".repeat(40),
    b = "b".repeat(40);
  const versions = taggedVersions(
    `${b}\trefs/tags/v2.2.0\n${a}\trefs/tags/v2.2.0^{}\n${a}\trefs/tags/2.2.0\n${a}\trefs/tags/v2.10.0\n${a}\trefs/tags/v3.0.0-beta\n${b}\trefs/heads/v4.0.0`,
  );
  assert.deepEqual(
    versions.map((v) => v.version),
    ["2.10.0", "2.2.0"],
  );
  assert.equal(versions[1].ambiguous, false);
  assert.equal(versions[1].commit, a);
  assert.equal(
    taggedVersions(`${a}\trefs/tags/v1.0.0\n${b}\trefs/tags/1.0.0`)[0]
      .ambiguous,
    true,
  );
});
test("prefixed-only Git tags install, frozen aliases reuse pins and conflicting tags cannot install", (t) => {
  const f = fixture(t),
    origin = resolve(f.root, "fixture-origin");
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: origin, encoding: "utf8", stdio: "pipe" });
  git("tag", "v1.0.0");
  git("tag", "-d", "1.0.0");
  const installed = installPackage(f.root, "example/community@v1.0.0", {
    fromGit: origin,
  });
  const reused = installPackage(f.root, "example/community@1.0.0", {
    frozen: true,
  });
  assert.equal(installed.commit, reused.commit);
  assert.equal(reused.cached, true);
  assert.equal(
    Object.keys(packageLock(f.root).packages).filter((r) =>
      r.includes("community"),
    ).length,
    1,
  );
  const before = readFileSync(resolve(f.root, "packages.lock.yaml"), "utf8");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--allow-empty",
    "-qm",
    "other",
  );
  git("tag", "1.0.0");
  assert.throws(
    () =>
      installPackage(f.root, "example/community@v1.0.0", {
        update: true,
        fromGit: origin,
      }),
    /different commits/,
  );
  assert.equal(
    readFileSync(resolve(f.root, "packages.lock.yaml"), "utf8"),
    before,
  );
  assert.equal(
    installPackage(f.root, "example/community@v1.0.0", { frozen: true }).commit,
    installed.commit,
  );
});
test("catalogue CLI keeps machine output clean and uses short names in normal output", (t) => {
  const f = fixture(t);
  const plain = command(f.root, "plugin", "list");
  assert.match(plain.stdout, /example\/fixture@1\.0\.0/);
  assert.doesNotMatch(plain.stdout, /plugin\/provider\.yaml|\x1b/);
  const browse = command(f.root, "--json", "plugin", "browse");
  assert.equal(browse.status, 0);
  assert.equal(browse.stderr, "");
  assert.equal(browse.stdout.trim().split("\n").length, 1);
  assert.equal(JSON.parse(browse.stdout).operation, "plugin_browse");
  const models = command(f.root, "plugin", "browse", "model pack");
  assert.equal(models.status, 0);
  assert.doesNotMatch(models.stdout, /northwind|xero/);
  assert.doesNotMatch(models.stdout, /provider\.yaml|pack\.yaml|\x1b/);
  const versions = command(
    f.root,
    "--json",
    "plugin",
    "versions",
    "example/fixture",
    "--from-git",
    resolve(f.root, "fixture-origin"),
  );
  assert.equal(versions.status, 0, versions.stdout);
  assert.equal(versions.stderr, "");
  assert.equal(JSON.parse(versions.stdout).result.source, "local-git");
  const missing = command(f.root, "--json", "plugin", "install");
  assert.notEqual(missing.status, 0);
  assert.equal(missing.stderr, "");
  assert.equal(JSON.parse(missing.stdout).diagnostics[0].code, "INPUT");
  const registered = command(
    f.root,
    "--json",
    "plugin",
    "configure",
    "example/fixture@v1.0.0",
  );
  assert.equal(registered.status, 0, registered.stdout);
  const project = parse(readFileSync(resolve(f.root, "project.yaml"), "utf8"));
  assert.equal(project.providers.packages.databricks, "example/fixture@1.0.0");
});
test("terminal decoration respects machine, accessibility and automation modes", () => {
  assert.equal(richTerminal({ tty: true }, {}), true);
  for (const options of [
    { tty: false },
    { tty: true, json: true },
    { tty: true, plain: true },
    { tty: true, colour: false },
  ]) {
    assert.equal(richTerminal(options, {}), false);
    assert.equal(decorate("Ready", true, options), "Ready");
  }
  for (const env of [{ NO_COLOR: "" }, { CI: "true" }, { TERM: "dumb" }])
    assert.equal(richTerminal({ tty: true }, env), false);
});

test("community preview versions can start at zero without weakening manifest matching", (t) => {
  const f = fixture(t),
    origin = resolve(f.root, "fixture-origin"),
    manifestPath = resolve(origin, "plugin/provider.yaml");
  const manifest = parse(readFileSync(manifestPath, "utf8"));
  manifest.version = "0.1.0";
  writeFileSync(manifestPath, JSON.stringify(manifest));
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
    "preview",
  );
  git("tag", "v0.1.0");
  assert.equal(
    installPackage(f.root, "example/preview@v0.1.0", { fromGit: origin })
      .reference,
    "example/preview/plugin/provider.yaml@0.1.0",
  );
  git("tag", "v0.2.0");
  assert.throws(
    () => installPackage(f.root, "example/preview@v0.2.0", { fromGit: origin }),
    /version differs/,
  );
});

test("browsed model identity survives version selection, install and frozen restore", (t) => {
  const f = fixture(t),
    origin = resolve(f.root, "fixture-origin");
  mkdirSync(resolve(origin, "packs/northwind"), { recursive: true });
  const contract = parse(
    readFileSync(
      resolve(f.root, "flows/source/contracts/customers.yaml"),
      "utf8",
    ),
  );
  writeFileSync(
    resolve(origin, "packs/northwind/pack.yaml"),
    JSON.stringify({
      apiVersion: "ingestron.extension-pack/v2",
      kind: "model",
      id: "northwind",
      version: "0.1.0",
      description: "Synthetic model catalogue fixture",
      contracts: { customers: contract },
      provenance: {
        sources: ["synthetic"],
        retrieved: "2026-09-14",
        status: "recorded-schema",
        notes: "No real data",
      },
    }),
  );
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
    "model fixture",
  );
  git("tag", "v0.1.0");
  const id = "example/models";
  const versions = command(
    f.root,
    "--json",
    "plugin",
    "versions",
    id,
    "--from-git",
    origin,
  );
  assert.equal(versions.status, 0, versions.stdout);
  const result = JSON.parse(versions.stdout).result;
  assert.equal(result.provider, "example/models");
  assert.equal(result.source, "local-git");
  assert.ok(result.versions.some((v: any) => v.version === "0.1.0"));
  const reference = "example/models/packs/northwind/pack.yaml@0.1.0";
  const before = readFileSync(resolve(f.root, "project.yaml"), "utf8");
  for (const extra of [[], ["--frozen"]]) {
    const installed = command(
      f.root,
      "--json",
      "plugin",
      "install",
      reference,
      "--from-git",
      origin,
      ...extra,
    );
    assert.equal(installed.status, 0, installed.stdout);
  }
  assert.equal(readFileSync(resolve(f.root, "project.yaml"), "utf8"), before);
  assert(
    packageLock(f.root).packages[
      "example/models/packs/northwind/pack.yaml@0.1.0"
    ],
  );
  const presets = command(
    f.root,
    "--json",
    "plugin",
    "versions",
    "example/models",
    "--tag-prefix",
    "missing-",
    "--from-git",
    origin,
  );
  assert.equal(presets.status, 0);
  assert.deepEqual(JSON.parse(presets.stdout).result.versions, []);
});

test("category filters match CLI and shared operations without prompting", (t) => {
  const f = fixture(t);
  const result = command(
    f.root,
    "--json",
    "plugin",
    "browse",
    "--kind",
    "model-pack",
  );
  assert.equal(result.status, 0, result.stdout);
  assert.deepEqual(
    JSON.parse(result.stdout).result,
    browseProviders(f.root, "", "model-pack"),
  );
  assert.equal(browseProviders(f.root, "", "connector").length, 0);
  assert.equal(
    command(f.root, "--json", "plugin", "browse", "--kind", "invalid").status,
    3,
  );
});

test("installation retains exact upstream licence evidence and regenerates cached information", (t) => {
  const f = fixture(t),
    origin = resolve(f.root, "fixture-origin");
  writeFileSync(resolve(origin, "LICENSE"), "Synthetic licence text\n");
  writeFileSync(
    resolve(origin, "package.json"),
    JSON.stringify({ license: "LicenseRef-Synthetic" }),
  );
  mkdirSync(resolve(origin, "third-party"));
  writeFileSync(
    resolve(origin, "third-party/NOTICE.txt"),
    "Synthetic dependency notice\n",
  );
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
    "licence evidence",
  );
  const commit = git("rev-parse", "HEAD").toString().trim();
  const reference = `example/licensed@${commit}`;
  const result = installPackage(f.root, reference, { fromGit: origin });
  const file = resolve(f.root, result.informationFile);
  const text = readFileSync(file, "utf8"),
    info = JSON.parse(text);
  assert.equal(info.commit, commit);
  assert.equal(info.declaredLicence, "LicenseRef-Synthetic");
  assert.equal(
    info.licenceDocuments.find((d: any) => d.path === "LICENSE").text,
    "Synthetic licence text\n",
  );
  assert.equal(
    info.licenceDocuments.find((d: any) => d.path === "third-party/NOTICE.txt")
      .text,
    "Synthetic dependency notice\n",
  );
  assert.match(info.licenceReview, /Not assessed/);
  assert.match(
    info.sourceDocumentation,
    /github.com\/example\/licensed\/tree\//,
  );
  writeFileSync(file, "obsolete");
  assert.equal(
    installPackage(f.root, reference, { frozen: true }).cached,
    true,
  );
  assert.equal(readFileSync(file, "utf8"), text);
});

test("component version selection uses an explicit prefix without a bundled registry", (t) => {
  const f = fixture(t),
    origin = resolve(f.root, "fixture-origin");
  execFileSync("git", ["tag", "source-1.0.0"], { cwd: origin });
  const found = providerVersions("example/sources", origin, "source-");
  assert.equal(found.versions.length, 1);
  assert.equal(found.versions[0].tag, "source-1.0.0");
});
