import test from "node:test";
import assert from "node:assert/strict";
import { Command } from "commander";
import { operationRecoveryCommand } from "../../src/cli/workflow-commands.js";
function command(dryRun = false) {
  const app = new Command().option("--dry-run").exitOverride();
  const calls: any[] = [];
  const execution = app
    .command("run")
    .option("--flow <id>")
    .option("--from <directory>")
    .option("--profile <name>")
    .option("--action <action>", "action", "run")
    .option("--run-id <id>");
  operationRecoveryCommand(app, execution, {
    context: () => ({
      root: "/synthetic",
      environment: "test",
      allowWrite: true,
      allowExecute: true,
      allowNetwork: true,
    }),
    run: (name: any, args: any, ctx: any) => {
      calls.push({ name, args, ctx });
    },
    author() {},
    print() {},
    readData() {},
    canPrompt: () => false,
    answer: async () => undefined,
    perform: async () => undefined,
  } as any);
  return { app, calls, prefix: dryRun ? ["--dry-run"] : [] };
}
test("recovery command passes only original ID and explicitly prevents dependency-network work", async () => {
  const { app, calls } = command();
  await app.parseAsync(["run", "recover", "9-original"], { from: "user" });
  assert.deepEqual(calls, [
    {
      name: "execution_recover",
      args: { id: "9-original" },
      ctx: {
        root: "/synthetic",
        environment: "test",
        allowWrite: true,
        allowExecute: true,
        allowNetwork: false,
      },
    },
  ]);
});
test("dry-run recovery denies execution and writes", async () => {
  const { app, calls, prefix } = command(true);
  await app.parseAsync([...prefix, "run", "recover", "original"], {
    from: "user",
  });
  assert.equal(calls[0].ctx.allowWrite, false);
  assert.equal(calls[0].ctx.allowExecute, false);
  assert.equal(calls[0].ctx.allowNetwork, false);
});
test("recovery rejects replacement selection instead of silently discarding it", async () => {
  for (const [option, value] of [
    ["--flow", "foreign"],
    ["--from", "elsewhere"],
    ["--profile", "other"],
    ["--action", "approve"],
    ["--run-id", "new"],
  ]) {
    const { app, calls } = command();
    await assert.rejects(
      app.parseAsync(["run", option, value, "recover", "original"], {
        from: "user",
      }),
      /recorded build, action, identity and selection/,
    );
    assert.equal(calls.length, 0);
  }
});
