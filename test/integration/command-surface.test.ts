import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
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
  const governance = run(f.root, "governance", "check", "--help");
  assert.equal(governance.status, 0);
  assert.match(governance.stdout, /--flow/);
  const policy = run(f.root, "governance", "policy", "--help");
  assert.equal(policy.status, 0);
  assert.match(policy.stdout, /--file/);
  for (const group of ["flow", "contract"]) {
    const locate = run(f.root, group, "locate", "--help");
    assert.equal(locate.status, 0);
    assert.match(locate.stdout, /exact/i);
  }
  const grouped = run(f.root, "connection", "flow-review", "--help");
  assert.equal(grouped.status, 0);
  assert.match(grouped.stdout, /--grouped/);
  assert.match(grouped.stdout, /--group-fields/);
  const selected = run(f.root, "connection", "drafts", "--help");
  assert.equal(selected.status, 0);
  assert.match(selected.stdout, /500/);
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

test("contract scaffold previews without writing and then creates a draft", (t) => {
  const f = fixture(t);
  const contract = resolve(f.root, "contracts", "new_customers.odcs.yaml");
  const args = [
    "contract",
    "scaffold",
    "new_customers",
    "--table",
    "new_customers",
    "--field",
    "customer_id",
    "--type",
    "string",
  ];
  const preview = run(f.root, "--json", "--dry-run", ...args);
  assert.equal(preview.status, 0, preview.stdout + preview.stderr);
  assert.equal(
    JSON.parse(preview.stdout).result.apiVersion,
    "ingestron.change/v1",
  );
  assert.equal(existsSync(contract), false);
  const created = run(f.root, "--json", ...args);
  assert.equal(created.status, 0, created.stdout + created.stderr);
  assert.equal(existsSync(contract), true);
});

test("operation stdin boundary preserves proposals and requires write permission", (t) => {
  const f = fixture(t);
  const invoke = (name: string, request: unknown, ...permissions: string[]) => {
    const child = spawnSync(
      process.execPath,
      [
        cli,
        "--project",
        f.root,
        "--json",
        "--no-input",
        "operation",
        name,
        ...permissions,
      ],
      { input: JSON.stringify(request), encoding: "utf8", timeout: 15000 },
    );
    return JSON.parse(child.stdout);
  };
  const proposed = invoke("edit", {
    files: { "notes.md": "Reviewed change\n" },
  });
  assert.equal(proposed.ok, true);
  const denied = invoke("apply", { proposal: proposed.result });
  assert.equal(denied.ok, false);
  assert.equal(existsSync(resolve(f.root, "notes.md")), false);
  const applied = invoke(
    "apply",
    { proposal: proposed.result },
    "--allow-write",
  );
  assert.equal(applied.ok, true);
  assert.equal(
    readFileSync(resolve(f.root, "notes.md"), "utf8"),
    "Reviewed change\n",
  );
  assert.equal(invoke("not_an_operation", {}).ok, false);
  assert.equal(
    invoke("packages_install", { reference: "example/missing@1.0.0" }).ok,
    false,
  );
});

test("execution selection is explicit on compiler and runtime commands", (t) => {
  const f = fixture(t);
  for (const args of [
    ["check"],
    ["build"],
    ["validate"],
    ["plan"],
    ["resolve"],
    ["run"],
    ["runtime", "prepare"],
  ]) {
    const help = run(f.root, ...args, "--help");
    assert.equal(help.status, 0);
    assert.match(help.stdout, /--profile <name>/);
  }
});

test("installed core selects a named execution profile without changing logical tables", (t) => {
  const f = fixture(t);
  f.flow.executionProfiles = {
    alternate: {
      provider: "engineering",
      ingestion: f.flow.ingestion,
      source: f.flow.defaults.source,
    },
  };
  f.put("flows/source/flow.yaml", f.flow);
  const selected = run(
    f.root,
    "--json",
    "resolve",
    "--flow",
    "source",
    "--profile",
    "alternate",
  );
  assert.equal(selected.status, 0, selected.stdout);
  assert.deepEqual(
    Object.keys(JSON.parse(selected.stdout).result.flows[0].tables),
    ["customers", "orders"],
  );
  const planned = run(
    f.root,
    "--json",
    "plan",
    "--flow",
    "source",
    "--profile",
    "alternate",
  );
  assert.equal(planned.status, 0, planned.stdout);
  assert.equal(
    JSON.parse(planned.stdout).result.selection.profile,
    "alternate",
  );
  const invalid = run(
    f.root,
    "--json",
    "check",
    "--flow",
    "source",
    "--profile",
    "missing",
  );
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stdout, /PROFILE/);
});

test("malformed source JSON fails before execution without echoing values", (t) => {
  const f = fixture(t);
  const project = readFileSync(resolve(f.root, "project.yaml"), "utf8");
  for (const [command, flag] of [
    ["inventory", "--scope"],
    ["test", "--source"],
    ["metadata", "--tables"],
    ["metadata", "--options"],
    ["drafts", "--options"],
  ]) {
    const result = run(
      f.root,
      "--json",
      "connection",
      command,
      "sales",
      flag,
      '{"PRIVATE_OPTION_VALUE":',
    );
    assert.notEqual(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.match(output.diagnostics[0].message, /Invalid JSON option/);
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_OPTION_VALUE/);
    assert.equal(
      readFileSync(resolve(f.root, "project.yaml"), "utf8"),
      project,
    );
    assert.equal(
      existsSync(resolve(f.root, ".ingestron/source-access")),
      false,
    );
  }
});

test("an early-closing pipe preserves successful help and failed-command exit status without a stack trace", async (t) => {
  const f = fixture(t);
  for (const [args, output] of [
    [["--help"], "stdout"],
    [["--json", "--help"], "stdout"],
    [["unsupported-command"], "stderr"],
    [["--json", "unsupported-command"], "stdout"],
  ] as const) {
    const normal = run(f.root, ...args);
    assert.equal(normal.signal, null);
    const child = spawn(
      process.execPath,
      [cli, "--project", f.root, "--no-input", ...args],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let captured = "";
    const retained = output === "stdout" ? child.stderr : child.stdout;
    retained.on("data", (chunk) => {
      captured += chunk.toString();
    });
    child[output].destroy();
    const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
    try {
      const result = await new Promise<{
        code: number | null;
        signal: NodeJS.Signals | null;
      }>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => resolve({ code, signal }));
      });
      assert.equal(result.signal, null, args.join(" "));
      assert.equal(result.code, normal.status, args.join(" "));
      assert.doesNotMatch(
        captured,
        /EPIPE|Unhandled 'error' event|node:events/,
      );
    } finally {
      clearTimeout(timer);
    }
  }
});
