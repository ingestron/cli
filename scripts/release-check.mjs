import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const pkg = JSON.parse(read("../package.json"));
assert.equal(pkg.name, "ingestron");
assert.ok(!pkg.private);
assert.equal(pkg.license, "Apache-2.0");
assert.equal(pkg.publishConfig.access, "public");
assert.equal(pkg.repository.url, "git+https://github.com/ingestron/cli.git");
assert.match(pkg.dependencies["@ingestron/core"], /^\d+\.\d+\.\d+$/);
assert.match(read("../LICENSE"), /Apache License[\s\S]*Version 2.0/);
assert.match(read("../NOTICE"), /Licensor: Otrera Limited/);
execFileSync(process.execPath, ["scripts/licence-inventory.mjs", "--check"], {
  stdio: "inherit",
});
const lock = read("../pnpm-lock.yaml");
assert.ok(
  !/git\+|github\.com\/ingestron|\bfile:/.test(lock),
  "Use registry dependencies only",
);
if (process.env.RELEASE_TAG)
  assert.equal(process.env.RELEASE_TAG, `v${pkg.version}`);
console.log(
  `${pkg.name}@${pkg.version}: public release metadata and registry core dependency checked`,
);
