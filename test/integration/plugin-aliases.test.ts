import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { coreVersion } from "../../src/version.js";
import { fixture } from "../support/project.js";
import { packageLock } from "@ingestron/core/adapter";
import {
  catalogueReleases,
  officialName,
  officialPlugins,
  resolvePluginArgs,
  executePluginOperation,
} from "../../src/cli/plugin-resolution.js";
const catalogue = {
  apiVersion: "ingestron.catalogue/v1",
  plugins: {
    local: {
      ...officialPlugins.local,
      releases: [
        { version: "0.4.0", coreVersions: [coreVersion] },
        { version: "0.10.0", coreVersions: [coreVersion] },
        { version: "1.0.0", coreVersions: ["9.0.0"] },
      ],
    },
  },
};
const cli = resolve("build/cli/cli/index.js");
test("catalogue selects qualified compatible stable versions and rejects changed identity", () => {
  assert.deepEqual(catalogueReleases(catalogue, "local"), ["0.10.0", "0.4.0"]);
  assert.deepEqual(catalogueReleases(catalogue, "local", "8.0.0"), []);
  for (const change of [
    { repository: "other/repo" },
    { path: "another.yaml" },
    { releases: [{ version: "1.0.0-beta", coreVersions: [coreVersion] }] },
    {
      releases: [
        catalogue.plugins.local.releases[0],
        catalogue.plugins.local.releases[0],
      ],
    },
  ])
    assert.throws(() =>
      catalogueReleases(
        {
          ...catalogue,
          plugins: { local: { ...catalogue.plugins.local, ...change } },
        },
        "local",
      ),
    );
  assert.throws(() => officialName("typo"), /Unknown official/);
  assert.throws(() => officialName("local@latest@other"));
  assert.equal(officialName("third/party/path.yaml@1.0.0"), undefined);
});
test("latest resolution observes permissions, compatibility and frozen boundaries before fetching", async (t) => {
  const f = fixture(t);
  let calls = 0;
  const fetch = async () => {
    calls++;
    return catalogue;
  };
  const context = { root: f.root, allowWrite: true, allowNetwork: true };
  const args = await resolvePluginArgs(
    context,
    "packages_install",
    { reference: "local" },
    fetch,
  );
  assert.equal(
    args.reference,
    "ingestron/provider-local/plugin/provider.yaml@0.10.0",
  );
  assert.equal(args.update, false);
  assert.equal(calls, 1);
  for (const [ctx, options] of [
    [{ ...context, allowWrite: false }, {}],
    [{ ...context, allowNetwork: false }, {}],
    [context, { frozen: true }],
    [context, { fromGit: "origin" }],
  ] as const)
    await assert.rejects(
      resolvePluginArgs(
        ctx,
        "packages_install",
        { reference: "local@latest", ...options },
        fetch,
      ),
    );
  assert.equal(calls, 1);
  await assert.rejects(
    resolvePluginArgs(
      context,
      "packages_install",
      { reference: "local" },
      async () => ({
        ...catalogue,
        plugins: { local: { ...catalogue.plugins.local, releases: [] } },
      }),
    ),
    /No qualified/,
  );
  const explicit = await resolvePluginArgs(
    context,
    "packages_install",
    { reference: "github@1.32.1" },
    fetch,
  );
  assert.equal(
    explicit.reference,
    "ingestron/connectors/connectors/github/connector.yaml@1.32.1",
  );
  assert.equal(explicit.tagPrefix, "github-");
  assert.equal(calls, 1);
  const custom = {
    reference: "custom/repo/special.yaml@1.2.3",
    tagPrefix: "special-",
  };
  assert.deepEqual(
    await resolvePluginArgs(context, "packages_install", custom, fetch),
    custom,
  );
});
test("CLI cache-only default and shared MCP resolver preserve configuration and immutable locks", async (t) => {
  const f = fixture(t),
    project = resolve(f.root, "project.yaml"),
    before = readFileSync(project, "utf8");
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [cli, "--project", f.root, "--json", ...args], {
      encoding: "utf8",
      timeout: 20000,
    });
  const rejected = run(
    "plugin",
    "install",
    "local@1.0.0",
    "--name",
    "new",
    "--from-git",
    resolve(f.root, "fixture-origin"),
  );
  assert.notEqual(rejected.status, 0);
  assert.ok(
    !Object.keys(packageLock(f.root).packages).some((r) =>
      r.startsWith("ingestron/"),
    ),
  );
  const install = run(
    "plugin",
    "install",
    "local@1.0.0",
    "--from-git",
    resolve(f.root, "fixture-origin"),
  );
  assert.equal(install.status, 0, install.stdout + install.stderr);
  assert.equal(readFileSync(project, "utf8"), before);
  const lock = readFileSync(resolve(f.root, "packages.lock.yaml"), "utf8");
  const second = run("plugin", "install", "local", "--frozen");
  assert.equal(second.status, 0, second.stdout + second.stderr);
  assert.equal(JSON.parse(second.stdout).result.cached, true);
  assert.equal(
    readFileSync(resolve(f.root, "packages.lock.yaml"), "utf8"),
    lock,
  );
  const ctx = { root: f.root, allowNetwork: true, allowWrite: true };
  const mcp = await executePluginOperation(ctx, "packages_install", {
    reference: "local@latest",
    frozen: true,
  });
  assert.equal(mcp.ok, true, JSON.stringify(mcp));
  assert.equal(
    mcp.result.reference,
    JSON.parse(install.stdout).result.reference,
  );
  const noFetch = async () => {
    throw new Error("Must stay offline");
  };
  const reused = await resolvePluginArgs(
    { ...ctx, allowNetwork: false },
    "packages_install",
    { reference: "local" },
    noFetch,
  );
  assert.equal(reused.reference, mcp.result.reference);
  const update = await resolvePluginArgs(
    ctx,
    "packages_install",
    { reference: "local", update: true },
    async () => catalogue,
  );
  assert.equal(
    update.reference,
    reused.reference,
    "Do not downgrade a newer installed version",
  );
  // Updating an alias never changes the commit behind an existing version.
  assert.equal(update.update, false);
  const bad = await executePluginOperation(ctx, "packages_install", {
    reference: "local",
    surprise: true,
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.diagnostics[0].code, "SCHEMA");
});

test("files alias resolves only its qualified source identity", () => {
  assert.deepEqual(officialName("files"), {
    name: "files",
    version: undefined,
  });
  const entry = {
    repository: "ingestron/connectors",
    path: "connectors/files/connector.yaml",
    tagPrefix: "files-",
    releases: [{ version: "1.0.0", coreVersions: ["0.12.1"] }],
  };
  assert.deepEqual(
    catalogueReleases(
      { apiVersion: "ingestron.catalogue/v1", plugins: { files: entry } },
      "files",
    ),
    ["1.0.0"],
  );
  assert.throws(() =>
    catalogueReleases(
      {
        apiVersion: "ingestron.catalogue/v1",
        plugins: { files: { ...entry, path: "other.yaml" } },
      },
      "files",
    ),
  );
});
