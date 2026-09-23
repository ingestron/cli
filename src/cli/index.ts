#!/usr/bin/env node
import { Command } from "commander";
import * as prompts from "@clack/prompts";
import { resolve, basename, dirname } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { parseDocument } from "yaml";
import {
  execute,
  executeAsync,
  type OperationName,
  type Result,
  type Context,
} from "@ingestron/core";
import { fence } from "@ingestron/core/adapter";
import { Configuration } from "@ingestron/core/adapter";
import { check, Problem } from "@ingestron/core/adapter";
import { version } from "../version.js";
import { terminal, exitCode } from "./output.js";
import { decorate, banner, backgroundOperation } from "./presentation.js";
import { workflowCommands } from "./workflow-commands.js";
const app = new Command()
  .name("ingestron")
  .description(
    "Configure flows once. Generate reviewable native data engineering assets offline.",
  )
  .version(version)
  .option("--project <directory>", "Project root", ".")
  .option("-e, --environment <name>", "Selected environment", "dev")
  .option("--env <name>", "Alias for --environment")
  .option("--json", "Versioned JSON output; progress goes to stderr")
  .option("--plain", "Plain noninteractive output; no styling or animation")
  .option("--no-color", "Disable terminal colour and decoration")
  .option("--no-progress", "Disable progress animation")
  .option("--verbose", "Show full result details in human-readable output")
  .option("--no-input", "Never ask interactive questions")
  .option("--dry-run", "Preview local file changes without applying");
const opts = () => app.opts();
const presentation = () => ({
  tty: !!process.stdout.isTTY,
  plain: opts().plain,
  colour: opts().color,
  progress: opts().progress,
  json: !!opts().json,
});
const context = (root?: string): Context => ({
  root: root ?? resolve(opts().project),
  environment: opts().env ?? opts().environment,
  allowWrite: true,
  allowNetwork: true,
  allowExecute: true,
});
function print(result: Result, args?: any) {
  process.exitCode = exitCode(result);
  if (opts().json || process.argv.includes("--json"))
    process.stdout.write(JSON.stringify(result) + "\n");
  else
    (result.ok ? process.stdout : process.stderr).write(
      decorate(
        terminal(result, !!opts().verbose, args),
        result.ok,
        presentation(),
      ) + "\n",
    );
}
// Commander failures must obey the same JSON contract as operation failures.
// Help/version remain successful envelopes in JSON mode; no progress goes to stdout.
let helpText = "";
app.exitOverride();
app.configureOutput({
  writeOut: (text) => {
    if (process.argv.includes("--json")) helpText += text;
    else
      process.stdout.write(
        text.startsWith("Usage: ingestron [")
          ? banner(text, presentation())
          : text,
      );
  },
  writeErr: (text) => {
    if (text.startsWith("Usage:")) {
      if (process.argv.includes("--json")) helpText += text;
      else
        process.stdout.write(
          text.startsWith("Usage: ingestron [")
            ? banner(text, presentation())
            : text,
        );
    }
  },
  outputError: () => {},
});

const run = async (
  name: OperationName,
  args: unknown = {},
  ctx = context(),
) => {
  const result = ["build", "plan", "generate", "packages_install"].includes(
    name,
  )
    ? await backgroundOperation(
        ctx,
        name,
        args,
        `${name === "packages_install" ? "Installing plugin" : "Preparing native assets"}`,
        presentation(),
      )
    : await executeAsync(ctx, name, args);
  print(result, args);
};
function author(name: OperationName, args: unknown, ctx = context()) {
  const result = execute(ctx, name, args);
  return print(
    !result.ok || opts().dryRun
      ? result
      : execute(ctx, "apply", { proposal: result.result }),
  );
}
function readData(file: string) {
  const doc = parseDocument(new Configuration(context().root).text(file), {
    uniqueKeys: true,
  });
  check(!doc.errors.length, "YAML", doc.errors[0]?.message ?? "Invalid YAML");
  return doc.toJS();
}
function save(file: string, value: unknown) {
  const absolute = fence(resolve(opts().project), file);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, JSON.stringify(value, null, 2) + "\n");
}

const canPrompt = () =>
  !!process.stdin.isTTY &&
  opts().input !== false &&
  !opts().json &&
  !opts().plain &&
  process.env.TERM !== "dumb" &&
  !process.env.CI;
async function answer(value: unknown) {
  const result = await value;
  if (prompts.isCancel(result)) {
    process.exitCode = 130;
    throw new Problem("CANCELLED", "Cancelled");
  }
  return result;
}
app
  .command("init [directory]")
  .description("Create a project; install a provider when ready to build")
  .option("--id <id>", "Project identifier")
  .option(
    "--provider <reference>",
    "Installed repository or exact reference, e.g. owner/provider@1.0.0",
  )
  .option(
    "--environments <names>",
    "Comma-separated environments (default: dev,test,prod; --env selects one)",
  )
  .action(async (directory = ".", command) => {
    const root = resolve(opts().project, directory);
    const id =
      command.id ??
      (canPrompt()
        ? await answer(
            prompts.text({
              message: "Project identifier",
              initialValue: basename(root),
            }),
          )
        : basename(root));
    author(
      "initialise",
      {
        id,
        provider: command.provider,
        environments: (
          command.environments ??
          (opts().env !== undefined ||
          app.getOptionValueSource("environment") === "cli"
            ? context().environment!
            : "dev,test,prod")
        )
          .split(",")
          .map((name: string) => name.trim()),
      },
      context(root),
    );
  });
const flow = app
  .command("flow")
  .description("Create and inspect ingestion/transformation flows");
flow
  .command("add <id>")
  .option("--kind <kind>", "ingestion or transformation", "ingestion")
  .option("--contract <id>", "Contract ID or project-relative file")
  .option(
    "--source <id>",
    "Named source; otherwise inferred from contract provenance",
  )
  .option(
    "--standard <name>",
    "Provider ingestion standard, e.g. snapshot-with-history@v1",
  )
  .option("--provider <configuration>", "Provider configuration for this flow")
  .option("--source-kind <kind>", "Provider source kind")
  .option(
    "--format <format>",
    "Provider-supported file format (for example csv, json, parquet)",
  )
  .option("--source-binding <id>", "Existing or new environment source binding")
  .option(
    "--input-dataset <id>",
    "Published source dataset for a native SQL transformation",
  )
  .action(async (id, command) => {
    let standard = command.standard;
    if (command.kind === "ingestion" && !standard && canPrompt())
      standard = await answer(
        prompts.text({
          message: "Standard from the installed provider (name@version)",
          validate: (value) =>
            value?.trim() ? undefined : "Enter a provider standard",
        }),
      );
    author("flow_create", {
      ...(command.contract ? { contract: command.contract } : {}),
      ...(command.source ? { source: command.source } : {}),
      id,
      kind: command.kind,
      ...(standard ? { standard } : {}),
      ...(command.provider ? { provider: command.provider } : {}),
      ...(command.sourceKind ? { sourceKind: command.sourceKind } : {}),
      ...(command.format ? { format: command.format } : {}),
      ...(command.inputDataset ? { inputDataset: command.inputDataset } : {}),
      ...(command.sourceBinding
        ? { sourceBinding: command.sourceBinding }
        : {}),
    });
  });
flow
  .command("configure <id>")
  .requiredOption("--patch <file>")
  .action((id, command) =>
    author("flow_configure", { flow: id, patch: readData(command.patch) }),
  );
app
  .command("step")
  .command("add <id>")
  .requiredOption("--flow <id>")
  .requiredOption("--uses <activity>")
  .option("--after <id>")
  .option("--with <file>")
  .action((id, command) =>
    author("step_add", {
      flow: command.flow,
      step: {
        id,
        uses: command.uses,
        with: command.with ? readData(command.with) : {},
      },
      ...(command.after ? { after: command.after } : {}),
    }),
  );
flow
  .command("list")
  .description("List configured flows, table names and published outputs")
  .action(() => run("inspect"));

const table = app
  .command("table")
  .description("Declare ingestion tables once per flow");
table
  .command("add <id>")
  .requiredOption("--flow <id>", "Owning ingestion flow")
  .requiredOption("--contract <file>", "Source ODCS file inside the project")
  .action((id, command) =>
    author("table_add", {
      id,
      flow: command.flow,
      contract: command.contract,
    }),
  );
table
  .command("configure <id>")
  .requiredOption("--flow <id>", "Owning flow")
  .requiredOption("--patch <file>", "YAML/JSON override patch")
  .action((id, command) =>
    author("table_configure", {
      id,
      flow: command.flow,
      patch: readData(command.patch),
    }),
  );
table
  .command("list")
  .description("List configured table names grouped by flow")
  .action(() => run("tables"));
const dataset = app.command("dataset");
dataset.command("list").action(() => run("datasets"));
dataset
  .command("add <id>")
  .requiredOption("--flow <id>", "Transformation flow")
  .requiredOption("--contract <file>", "Output ODCS file")
  .requiredOption(
    "--from <port>",
    "Producing port, e.g. steps.ready.outputs.table",
  )
  .action((id, command) =>
    author("dataset_add", {
      id,
      flow: command.flow,
      contract: command.contract,
      from: command.from,
    }),
  );
const config = app
  .command("config")
  .description("Configure existing resources and non-secret values");
config
  .command("set <path>")
  .requiredOption("--value <value>", "YAML scalar or mapping")
  .action((path, command) =>
    author("config_set", { path, value: parseDocument(command.value).toJS() }),
  );
config
  .command("explain <path>")
  .action((path) => run("config_explain", { path }));
config.command("fill").action(async () => {
  const result = execute(context(), "resolve", {});
  if (!result.ok) {
    print(result);
    return;
  }
  check(
    canPrompt(),
    "INPUT",
    "config fill requires an interactive terminal; use config set or doctor with --no-input/--json",
  );
  const profile = result.result.project.environments[context().environment!];
  const fields: { path: string; variable: string }[] = [];
  const walk = (value: any, path: string) => {
    if (value && typeof value === "object" && value.$env)
      fields.push({ path, variable: value.$env });
    else if (value && typeof value === "object")
      for (const [k, child] of Object.entries(value))
        walk(child, path ? path + "." + k : k);
  };
  walk(profile.bindings, "bindings");
  walk(profile.values, "values");
  for (const field of fields) {
    const value = await answer(
      prompts.text({
        message: `${field.path} (${field.variable})`,
        placeholder: "Existing resource value; leave blank to keep pending",
      }),
    );
    if (value) author("config_set", { path: field.path, value });
  }
});
const environments = app.command("environments");
environments.command("list").action(() => run("environments"));
environments
  .command("add <name>")
  .description("Copy an existing environment for review and configuration")
  .requiredOption("--from <environment>", "Existing environment to copy")
  .action((name, command) =>
    author("environment_add", { name, from: command.from }),
  );

for (const kind of ["activities", "standards", "providers"] as const) {
  const group = app
    .command(kind)
    .description(`Inspect current ${kind} and their supported capabilities`);
  group.command("list").action(() => run("catalogue", { kind }));
  group.command("explain <id>").action((id) => run("catalogue", { kind, id }));
}
const connections = app
  .command("connections")
  .description(
    "Validate and prepare project-defined connector flows without source access",
  );
connections
  .command("validate <flow>")
  .action((flow) => run("connection_prepare", { flow, validateOnly: true }));
connections
  .command("prepare <flow>")
  .requiredOption("--out <file>", "New provider result JSON file")
  .action((flow, command) => {
    const result = execute(context(), "connection_prepare", { flow });
    if (result.ok) {
      const file = fence(context().root, command.out);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(result.result, null, 2) + "\n", {
        flag: "wx",
      });
    }
    print(result);
  });
connections
  .command("contracts <flow>")
  .requiredOption("--review <file>", "Approved generated review")
  .requiredOption("--out <file>", "New provider result file")
  .action((flow, command) => {
    const result = execute(context(), "connection_prepare", {
      flow,
      review: command.review,
    });
    if (result.ok) {
      const file = fence(context().root, command.out);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(result.result, null, 2) + "\n", {
        flag: "wx",
      });
    }
    print(result);
  });
const providerCommands = app.commands.find(
  (command) => command.name() === "providers",
)!;
providerCommands.configureHelp({
  visibleCommands: (command) =>
    command.commands.filter(
      (child) => !["install", "update"].includes(child.name()),
    ),
});
for (const update of [false, true])
  providerCommands
    .command(`${update ? "update" : "install"} <reference>`)
    .description(
      "Install a provider version into the project cache; select it in project.yaml",
    )
    .option("--from-git <directory>", "Local Git repository")
    .option("--frozen", "Require an existing immutable lock")
    .action((reference, command) =>
      run("packages_install", {
        reference,
        update,
        frozen: !!command.frozen,
        ...(command.fromGit ? { fromGit: command.fromGit } : {}),
      }),
    );
providerCommands
  .command("commands <configuration>")
  .description(
    "List provider-owned commands and input schemas without executing plugin code",
  )
  .action((configuration) => run("provider_commands", { configuration }));
const provider = app
  .command("provider")
  .description("Install an execution provider or run its offline commands")
  .arguments("<configuration> <command...>")
  .option("--input <file>", "Project-relative JSON input file")
  .option("--out <file>", "Save the provider result JSON to a new project file")
  .action((configuration, words, command) =>
    providerAction(
      "provider_command",
      { configuration, command: words.join(" ") },
      command,
    ),
  );
provider
  .command("exec <configuration> <command...>")
  .description(
    "Run a configured provider command; inspect providers commands first",
  )
  .option("--input <file>", "Project-relative JSON input file")
  .option("--out <file>", "Save the provider result JSON to a new project file")
  .action((configuration, words, command) =>
    providerAction(
      "provider_command",
      { configuration, command: words.join(" ") },
      command,
    ),
  );
function providerAction(
  operation: "provider_command" | "plugin_command",
  args: Record<string, unknown>,
  command: any,
) {
  const input = command.input
    ? JSON.parse(
        readFileSync(
          new Configuration(context().root).path(command.input),
          "utf8",
        ),
      )
    : {};
  const result = execute(context(), operation, { ...args, input });
  if (result.ok && command.out) {
    const file = fence(context().root, command.out);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(result.result, null, 2) + "\n", {
      flag: "wx",
    });
    if (!opts().json && !opts().verbose) {
      process.stdout.write(`Saved provider result to ${command.out}\n`);
      return;
    }
  }
  print(result);
}

providerCommands
  .command("export")
  .description(
    "Review/export files returned by an offline provider; no script execution",
  )
  .requiredOption("--result <file>", "Saved provider result JSON")
  .requiredOption("--out <directory>", "New artifact directory")
  .action((command) =>
    author("provider_export", { result: command.result, out: command.out }),
  );
providerCommands
  .command("migrate")
  .requiredOption("--from <package>", "Project package key")
  .requiredOption("--to <reference>", "Installed exact provider reference")
  .action((command) =>
    author("provider_migrate", { package: command.from, to: command.to }),
  );
const packages = app.command("packages");
packages.command("list").action(() => run("packages_list"));
for (const update of [false, true])
  packages
    .command(`${update ? "update" : "install"} <reference>`)
    .option(
      "--from-git <directory>",
      "Explicit local Git source for offline installation",
    )
    .option("--frozen", "Require existing immutable lock entry")
    .action((reference, command) =>
      run("packages_install", {
        reference,
        update,
        ...(command.fromGit ? { fromGit: command.fromGit } : {}),
        frozen: !!command.frozen,
      }),
    );
app
  .command("validate")
  .option("--mode <mode>", "draft or strict", "strict")
  .option("--flow <id>")
  .option("--table <id>")
  .option("--step <id>")
  .action((command) =>
    run("validate", {
      mode: command.mode,
      ...(command.flow ? { flow: command.flow } : {}),
      ...(command.table ? { table: command.table } : {}),
      ...(command.step ? { step: command.step } : {}),
    }),
  );
app
  .command("doctor")
  .description(
    "Check local configuration and missing inputs; no platform connection",
  )
  .action(() => run("doctor"));
app.command("resolve").action(() => run("resolve"));
app
  .command("plan")
  .option("--flow <id>")
  .option("--table <id>")
  .option("--step <id>")
  .option("--out <file>", "Save a digest-bound JSON plan")
  .action((command) => {
    const result = execute(context(), "plan", {
      ...(command.flow ? { flow: command.flow } : {}),
      ...(command.table ? { table: command.table } : {}),
      ...(command.step ? { step: command.step } : {}),
    });
    if (result.ok && command.out) save(command.out, result.result);
    print(result);
  });
app
  .command("diff")
  .description("Compare local plans; no remote deployment drift lookup")
  .requiredOption("--plan <file>", "Previously reviewed plan")
  .action((command) => run("diff", { plan: command.plan }));
app
  .command("generate")
  .requiredOption("--plan <file>", "Saved plan JSON")
  .requiredOption("--out <directory>", "Owned output directory inside project")
  .option(
    "--ownership <mode>",
    "managed (regenerate safely) or team (manual handover)",
    "managed",
  )
  .action((command) =>
    run("generate", {
      plan: command.plan,
      out: command.out,
      ownership: command.ownership,
    }),
  );
app
  .command("validate-output <directory>")
  .description("Check local output ownership and syntax; no target validation")
  .action((directory) => run("validate_output", { directory }));
app.command("schema <name>").action((name) => run("schema", { name }));
const contract = app.command("contract");
const activity = app.command("activity");
activity
  .command("validate <file>")
  .description(
    "Validate an activity manifest and inventory source files; no rendering or execution",
  )
  .action((file) => run("activity_inspect", { path: file }));
contract
  .command("validate <file>")
  .action((file) => run("contract_validate", { path: file }));
app
  .command("mcp")
  .command("serve")
  .option("--allow-write", "Allow explicit reviewed local changes")
  .option(
    "--allow-execute",
    "Allow explicit customer-side source execution; requires --allow-write",
  )
  .option(
    "--allow-network",
    "Allow GitHub package version lookup and fetching; no platform access",
  )
  .action(async (command) => {
    const { serve } = await import("../mcp/index.js");
    await serve(
      resolve(opts().project),
      !!command.allowWrite,
      context().environment,
      !!command.allowNetwork,
      !!command.allowExecute,
    );
  });
workflowCommands(app, {
  context,
  run,
  author,
  print,
  readData,
  canPrompt,
  answer,
  perform: (operation, args, label) =>
    backgroundOperation(context(), operation, args, label, presentation()),
});
app.hook("preAction", (_root, command) => {
  if (!opts().dryRun) return;
  const parts: string[] = [];
  for (
    let current: Command | null = command;
    current && current !== app;
    current = current.parent
  )
    parts.unshift(current.name());
  check(
    new Set([
      "init",
      "source add",
      "source configure",
      "source prepare",
      "source import",
      "plugin configure",
      "plugin migrate",
      "config environment add",
      "flow table add",
      "flow table configure",
      "flow step add",
      "flow output add",
      "advanced export",
      "flow add",
      "flow configure",
      "step add",
      "table add",
      "table configure",
      "dataset add",
      "config set",
      "config fill",
      "environments add",
      "providers migrate",
      "providers export",
      "contract draft",
      "plugin scaffold",
      "plugin pack-add",
    ]).has(parts.join(" ")),
    "OPTION",
    "--dry-run is supported only by project authoring commands; this command has not run",
  );
});
async function parseCommands() {
  const parsed = app.parseOptions(process.argv.slice(2));
  const requested = [...parsed.operands, ...parsed.unknown].find(
    (arg) => !arg.startsWith("-"),
  );
  const known = new Set(
    app.commands.flatMap((command) => [command.name(), ...command.aliases()]),
  );
  if (existsSync(resolve(context().root, "project.yaml"))) {
    const catalogue = execute(context(), "plugin_commands", {});
    if (!catalogue.ok) {
      if (requested && !known.has(requested)) {
        print(catalogue);
        return;
      }
    } else {
      for (const binding of catalogue.result.bindings) {
        check(
          !known.has(binding.namespace),
          "COMMAND_NAMESPACE",
          `Plugin namespace conflicts with core command ${binding.namespace}`,
        );
        let namespace = app.commands.find(
          (command) => command.name() === binding.namespace,
        );
        if (namespace) continue; // Same locked package, multiple selectable configurations.
        namespace = app
          .command(binding.namespace)
          .description(`Installed ${binding.provider} offline operations`);
        for (const definition of binding.commands) {
          const words = definition.name.split(" ");
          let parent = namespace;
          for (const word of words.slice(0, -1)) {
            let group = parent.commands.find(
              (command) => command.name() === word,
            );
            if (!group)
              group = parent.command(word).description(`${word} operations`);
            parent = group;
          }
          parent
            .command(words.at(-1)!)
            .description(definition.description)
            .option(
              "--target <configuration>",
              "Provider configuration; required when multiple bindings match",
            )
            .option("--input <file>", "Project-relative JSON input file")
            .option("--out <file>", "Save result JSON to a new project file")
            .addHelpText(
              "after",
              `\nInput schema:\n${JSON.stringify(definition.inputSchema, null, 2)}\n${(definition.examples ?? []).join("\n")}`,
            )
            .action((options) =>
              providerAction(
                "plugin_command",
                {
                  namespace: binding.namespace,
                  command: definition.name,
                  ...(options.target ? { target: options.target } : {}),
                },
                options,
              ),
            );
        }
      }
    }
  }
  await app.parseAsync();
}
await parseCommands().catch((error) => {
  if (
    error.code === "commander.helpDisplayed" ||
    error.code === "commander.version" ||
    error.code === "commander.help"
  ) {
    process.exitCode = 0;
    if (process.argv.includes("--json"))
      print({
        apiVersion: "ingestron.operation/v1",
        operation: error.code === "commander.version" ? "version" : "help",
        ok: true,
        result: { text: helpText },
        diagnostics: [],
      });
    return;
  }
  print({
    apiVersion: "ingestron.operation/v1",
    operation: "command",
    ok: false,
    diagnostics: [
      {
        code: error instanceof Problem ? error.code : "COMMAND",
        message:
          error instanceof Error
            ? error.message.replace(/^error: /, "")
            : "Command failed",
        ...(error instanceof Problem && error.hint ? { hint: error.hint } : {}),
      },
    ],
  });
});
