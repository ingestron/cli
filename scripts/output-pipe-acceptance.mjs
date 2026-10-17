/** Real installed CLI pipes; no providers, source reads or network requests. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
for (const key of [
  "INGESTRON_ACCEPTANCE_CLI_PACKAGE",
  "INGESTRON_ACCEPTANCE_PROOF",
])
  assert.ok(process.env[key], "Set " + key);
const cliRoot = realpathSync(process.env.INGESTRON_ACCEPTANCE_CLI_PACKAGE),
  cli = resolve(cliRoot, "build/cli/cli/index.js"),
  coreRoot = realpathSync(resolve(cliRoot, "../@ingestron/core")),
  root = mkdtempSync(resolve(tmpdir(), "ingestron-cli-pipes-")),
  records = [];
let result = "failed";
try {
  for (const [args, output] of [
    [["--help"], "stdout"],
    [["--json", "--help"], "stdout"],
    [["unsupported-command"], "stderr"],
    [["--json", "unsupported-command"], "stdout"],
  ]) {
    const argv = [cli, "--project", root, "--no-input", ...args],
      normal = spawnSync(process.execPath, argv, {
        encoding: "utf8",
        timeout: 15000,
      });
    assert.equal(normal.error, undefined);
    assert.equal(normal.signal, null);
    assert.equal(normal.status, args.includes("unsupported-command") ? 3 : 0);
    const child = spawn(process.execPath, argv, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let captured = "";
    (output === "stdout" ? child.stderr : child.stdout).on("data", (bytes) => {
      captured += bytes.toString();
    });
    child[output].destroy();
    const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
    try {
      const closed = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => resolve({ code, signal }));
      });
      assert.equal(closed.signal, null);
      assert.equal(closed.code, normal.status);
      assert.doesNotMatch(
        captured,
        /EPIPE|Unhandled 'error' event|node:events/,
      );
      records.push({
        args,
        output,
        normalExit: normal.status,
        closedPipeExit: closed.code,
        noCrashTrace: true,
      });
    } finally {
      clearTimeout(timer);
    }
  }
  result = "passed";
} finally {
  rmSync(root, { recursive: true, force: true });
  writeFileSync(
    resolve(process.env.INGESTRON_ACCEPTANCE_PROOF),
    JSON.stringify(
      {
        apiVersion: "ingestron.cli-output-pipe-acceptance/v1",
        result,
        cli,
        core: coreRoot,
        cliVersion: JSON.parse(
          readFileSync(resolve(cliRoot, "package.json"), "utf8"),
        ).version,
        coreVersion: JSON.parse(
          readFileSync(resolve(coreRoot, "package.json"), "utf8"),
        ).version,
        cliEntrySha256: createHash("sha256")
          .update(readFileSync(cli))
          .digest("hex"),
        records,
        limits:
          "Installed CLI output lifecycle only; no source, provider, account, cloud or network activity.",
      },
      null,
      2,
    ) + "\n",
  );
}
assert.equal(result, "passed");
console.log(
  "Installed CLI output pipes passed: " + records.length + " scenarios",
);
