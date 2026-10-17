import { officialName, officialPlugins } from "./plugin-resolution.js";
import { browsePlugins } from "./plugin-browser.js";
import * as prompts from "@clack/prompts";
import { friendlyReference } from "@ingestron/core/adapter";
import { Command } from "commander";
import { type Context, type OperationName, type Result } from "@ingestron/core";
import { check } from "@ingestron/core/adapter";
interface Host {
  context: () => Context;
  run: (name: OperationName, args?: any, ctx?: Context) => void;
  author: (name: OperationName, args: any) => void;
  print: (result: Result, args?: any) => void;
  readData: (file: string) => any;
  canPrompt: () => boolean;
  answer: (value: unknown) => Promise<any>;
  perform: (
    operation: OperationName,
    args: any,
    label: string,
  ) => Promise<Result>;
}
/** Parsing failures never include source selection or connection values. */
function reviewedJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(
      "Invalid JSON option; provide a complete reviewed JSON value",
    );
  }
}
/** Recovery accepts the original identity and cannot inherit fresh-run options. */
export function operationRecoveryCommand(
  app: Command,
  execution: Command,
  host: Pick<Host, "run" | "context">,
) {
  const { run, context } = host;
  execution
    .command("recover <id>")
    .description(
      "Acknowledge the original setup or checkpoint operation without repeating source work",
    )
    .action((id: string, _options: any, command: Command) => {
      check(
        ![
          "from",
          "provider",
          "flow",
          "profile",
          "action",
          "runId",
          "retry",
          "secretsFile",
        ].some((key) => command.parent?.getOptionValueSource(key) === "cli"),
        "SELECT",
        "Original operation recovery uses its recorded build, action, identity and selection",
      );
      run(
        "execution_recover" as OperationName,
        { id },
        {
          ...context(),
          allowWrite: !app.opts().dryRun,
          allowExecute: !app.opts().dryRun,
          allowNetwork: false,
        },
      );
    });
}
/** Explicit review/apply operations never forward a secrets file or dependency authority. */
export function checkpointMaintenanceCommands(
  app: Command,
  host: Pick<Host, "run" | "context">,
) {
  const checkpoint = app
    .command("checkpoint")
    .description(
      "Review and apply an installed source's compatible runtime upgrade",
    );
  checkpoint
    .command("retain")
    .description(
      "Retain a private copy of the managed build, review and output before upgrading",
    )
    .option("--from <directory>", "Original managed build", "build/generated")
    .requiredOption("--to <directory>", "New separate baseline directory")
    .option("--profile <id>", "Original build profile")
    .action((options: any) =>
      host.run(
        "build_retain" as OperationName,
        {
          from: options.from,
          to: options.to,
          ...(options.profile ? { profile: options.profile } : {}),
        },
        {
          ...host.context(),
          allowWrite: !app.opts().dryRun,
          allowExecute: false,
          allowNetwork: false,
        },
      ),
    );
  for (const action of ["preview", "apply"] as const) {
    const command = checkpoint
      .command(action)
      .requiredOption("--flow <id>", "One incremental flow")
      .requiredOption(
        "--previous <directory>",
        "Retained unchanged previous managed build",
      )
      .option("--from <directory>", "Current managed build", "build/generated")
      .option("--profile <id>", "Matching build profile")
      .option("--run-id <id>", "Stable maintenance operation identity");
    if (action === "apply")
      command.requiredOption(
        "--digest <sha256>",
        "Digest returned by the reviewed checkpoint preview",
      );
    command.action((options: any) =>
      host.run(
        ("checkpoint_" + action) as OperationName,
        {
          flow: options.flow,
          previous: options.previous,
          from: options.from,
          ...(options.profile ? { profile: options.profile } : {}),
          ...(options.runId ? { runId: options.runId } : {}),
          ...(action === "apply" ? { expectedDigest: options.digest } : {}),
        },
        {
          ...host.context(),
          allowWrite: !app.opts().dryRun,
          allowExecute: !app.opts().dryRun,
          allowNetwork: false,
        },
      ),
    );
  }
}
/** Implemented CLI workflows over the versioned core operation API. */
export function workflowCommands(app: Command, host: Host) {
  checkpointMaintenanceCommands(app, host);
  const { run, author, print, readData, context, canPrompt, answer, perform } =
    host;
  const governance = app
    .command("governance")
    .description("Review contract ownership and project policy gaps");
  governance
    .command("check")
    .option(
      "--flow <id>",
      "Check contracts for one flow; delivery definitions remain project-wide",
    )
    .action((options) => run("governance_check" as OperationName, options));
  governance
    .command("policy")
    .requiredOption("--file <file>", "Reviewed project policy YAML or JSON")
    .action((options) =>
      author("policy_propose" as OperationName, {
        policy: readData(options.file),
      }),
    );
  const delivery = app
    .command("delivery-plan")
    .description("Review project requirements and work definitions");
  delivery
    .command("check")
    .option(
      "--path <file>",
      "Plan YAML within this project",
      "delivery-plan.yaml",
    )
    .option("--baseline <file>", "Previously reviewed plan YAML")
    .action((options) => run("delivery_plan_check" as OperationName, options));
  delivery
    .command("edit")
    .requiredOption("--file <file>", "Reviewed plan YAML or JSON")
    .action((options) =>
      author("delivery_plan_propose" as OperationName, {
        plan: readData(options.file),
      }),
    );
  delivery
    .command("baseline")
    .option("--path <file>", "Current plan", "delivery-plan.yaml")
    .option(
      "--baseline <file>",
      "Baseline destination",
      "delivery-plan.baseline.yaml",
    )
    .action((options) =>
      author("delivery_plan_baseline" as OperationName, options),
    );
  const source = app
    .command("source")
    .description(
      "Describe sources, prepare readers and import discovered metadata",
    );
  source
    .command("add <id>")
    .description(
      "Add a named source; connection references contain no credentials",
    )
    .requiredOption(
      "--type <type>",
      "Source kind supported by a provider, e.g. azure-sql or adls",
    )
    .option(
      "--format <format>",
      "File representation, e.g. csv, json or parquet",
    )
    .option(
      "--provider <configuration>",
      "Provider configuration; otherwise use project default",
    )
    .option(
      "--execution <context>",
      "manual or local metadata reader preparation",
      "manual",
    )
    .option("--binding <name>", "Environment connection binding")
    .action((id, options) => author("source_add", { id, ...options }));
  source
    .command("list")
    .description("List sources and their execution contexts")
    .action(() => run("source_list"));
  source
    .command("show <id>")
    .description("Show the source in the selected environment")
    .action((id) => run("source_show", { id }));
  source
    .command("configure <id>")
    .description(
      "Apply a source patch; environment bindings may override execution references",
    )
    .requiredOption("--patch <file>", "YAML/JSON source patch")
    .action((id, options) =>
      author("source_configure", { id, patch: readData(options.patch) }),
    );
  source
    .command("prepare <id>")
    .description(
      "Export a provider's local metadata reader; does not execute it",
    )
    .requiredOption(
      "--input <file>",
      "Provider reader selection: schemas/tables or explicit dataset paths",
    )
    .option(
      "--out <directory>",
      "Reader directory (default: discovery/<id>/reader)",
    )
    .action((id, options) => author("source_prepare", { id, ...options }));
  source
    .command("import <id>")
    .description(
      "Validate supplied metadata and save a snapshot for contract drafting",
    )
    .requiredOption(
      "--metadata <file>",
      "Metadata or ODCS file inside the project",
    )
    .action((id, options) => author("source_import", { id, ...options }));
  const connection = (
    app.commands.find((c) => c.name() === "connection") ??
    app.command("connection")
  ).description("Test access and discover metadata before defining flows");
  const command = (name: string, operation: string, description: string) =>
    connection
      .command(name + " <id>")
      .description(description)
      .option(
        "--executor <reference>",
        "Exact installed source-access provider reference",
      )
      .option("--python <executable>", "Python 3.12 bootstrap executable")
      .option(
        "--secrets-file <file>",
        "Private project-relative runtime secret file",
      )
      .action((id, { secretsFile, ...options }) =>
        run(operation as OperationName, {
          connection: id,
          ...options,
          ...(secretsFile ? { envFile: secretsFile } : {}),
        }),
      );
  connection
    .command("access <id>")
    .description("Inspect locked source access methods")
    .option("--executor <reference>", "Exact installed source-access provider")
    .action((id, options) =>
      run("connection_access" as OperationName, { connection: id, ...options }),
    );
  command(
    "prepare",
    "connection_runtime_prepare",
    "Prepare hash-locked dependencies; does not contact the source",
  );
  command(
    "test",
    "connection_test",
    "Test the configured connection without reading business records",
  ).option("--source <json>", "Explicit file or object scope", reviewedJson);
  command(
    "inventory",
    "connection_inventory",
    "Browse table or declared object names without reading records",
  )
    .option("--query <text>", "Literal object name search")
    .option("--schema <name>", "Exact database schema")
    .option(
      "--scope <json>",
      "Inventory scope declared by the installed source, e.g. {directory,format}",
      reviewedJson,
    )
    .option("--cursor <cursor>", "Opaque continuation from previous page")
    .option("--limit <count>", "Page size, 1–200", Number);
  command(
    "metadata",
    "connection_metadata",
    "Read selected schemas; record sampling requires explicit source-declared options",
  )
    .requiredOption(
      "--tables <json>",
      "Array of reviewed source objects",
      reviewedJson,
    )
    .option(
      "--options <json>",
      "Metadata options declared by the installed source; inspect connection access before enabling record sampling",
      reviewedJson,
    );
  command(
    "drafts",
    "connection_drafts",
    "Discover up to 500 explicit schemas in bounded batches and save one complete draft selection",
  )
    .requiredOption(
      "--tables <json>",
      "Array of {source,name} selections",
      reviewedJson,
    )
    .option("--accept-keys", "Explicitly accept discovered keys in drafts")
    .option(
      "--options <json>",
      "Metadata options declared by the installed source, applied to every batch",
      reviewedJson,
    );
  command(
    "sample",
    "connection_sample",
    "Read a bounded business-data preview; rows are not saved in receipts",
  )
    .requiredOption(
      "--source <json>",
      "One explicit reviewed source object",
      reviewedJson,
    )
    .option("--limit <count>", "Maximum rows, 1–50 (default 20)", Number)
    .option(
      "--columns <json>",
      "Array of selected source field names",
      reviewedJson,
    );
  connection
    .command("contracts <id>")
    .description(
      "Write isolated ODCS drafts from a current metadata receipt; does not bind or publish",
    )
    .requiredOption("--receipt <id>", "Source metadata receipt identity")
    .requiredOption(
      "--tables <json>",
      "Array of {id,name} draft selections",
      reviewedJson,
    )
    .option(
      "--executor <reference>",
      "Exact installed source-access provider reference",
    )
    .option("--accept-keys", "Explicitly accept discovered keys in drafts")
    .action((id, options) =>
      run("connection_contracts" as OperationName, {
        connection: id,
        ...options,
      }),
    );
  connection
    .command("flow-review <id>")
    .option(
      "--group-fields <json>",
      "Native ingestion resource-name fields to suffix per group",
      reviewedJson,
    )
    .option(
      "--grouped",
      "Review up to 500 tables as deterministic flow groups of at most 100",
    )
    .description(
      "Preview native ingestion with shared contracts and optional local testing",
    )
    .requiredOption("--flow <id>", "New ingestion flow ID")
    .requiredOption("--receipt <id>", "Current metadata receipt")
    .option(
      "--executor <reference>",
      "Source-access provider used by the metadata receipt",
    )
    .option(
      "--provider <name>",
      "Explicit local provider for optional local testing",
    )
    .option(
      "--runtime <reference>",
      "Installed local provider to configure if needed",
    )
    .option(
      "--target <json>",
      "Target {provider,source,ingestion} binding for the same flow",
      reviewedJson,
    )
    .requiredOption(
      "--tables <json>",
      "Array of {id,table,contract,receipt?} selections",
      reviewedJson,
    )
    .action((id, options) => {
      check(
        !options.groupFields || options.grouped,
        "OPTION",
        "--group-fields requires --grouped",
      );
      run(
        (options.grouped
          ? "connection_flows_review"
          : "connection_flow_review") as OperationName,
        {
          connection: id,
          id: options.flow,
          receipt: options.receipt,
          ...(options.grouped && options.groupFields
            ? { groupFields: options.groupFields }
            : {}),
          ...(options.executor ? { executor: options.executor } : {}),
          ...(options.provider ? { provider: options.provider } : {}),
          tables: options.tables,
          ...(options.runtime ? { runtime: options.runtime } : {}),
          ...(options.target ? { target: options.target } : {}),
        },
      );
    });
  const contract = app.commands.find((c) => c.name() === "contract")!;
  contract.description(
    "Draft and review data contracts from supplied evidence",
  );
  contract.configureHelp({
    visibleCommands: (command) =>
      command.commands.filter((c) => c.name() !== "validate"),
  });
  contract
    .command("locate <flow> <table>")
    .description(
      "Show the exact file and JSON pointer of a workflow table contract",
    )
    .action((flow, table) =>
      run("contract_location" as OperationName, { flow, table }),
    );
  // The previous flag-only draft invocation remains accepted during migration.
  contract
    .command("draft [id]")
    .description("Create a draft from imported discovery or a metadata file")
    .option("--id <id>", "Compatibility spelling for the contract identifier")
    .option("--source <id>", "Named source with imported metadata")
    .option("--entity <name>", "Discovered contract ID or physical entity name")
    .option("--metadata <file>", "Reviewed metadata or ODCS file")
    .option(
      "--provider <configuration>",
      "Provider to interpret supplied metadata",
    )
    .option("--out <file>", "Contract file (default: contracts/<id>.odcs.yaml)")
    .action((id, options) => {
      check(
        !id || !options.id || id === options.id,
        "INPUT",
        "Provide one contract identifier",
      );
      author("contract_create", { ...options, id: id ?? options.id });
    });
  contract
    .command("scaffold <id>")
    .description("Create an editable draft contract from one known field")
    .requiredOption("--table <name>", "Dataset/table name")
    .requiredOption("--field <name>", "First known source field")
    .requiredOption(
      "--type <type>",
      "Field type: string, integer, number or boolean",
    )
    .action((id, options) => author("contract_scaffold", { id, ...options }));
  contract
    .command("list")
    .description("List authored contracts")
    .action(() => run("contract_list"));
  contract
    .command("show <id>")
    .description("Inspect a contract ID or project-relative path")
    .action((id) => run("contract_show", { id }));
  contract
    .command("check <id>")
    .description("Validate full ODCS, including nested schemas")
    .option(
      "--native",
      "Also check eligibility for flat native table authoring",
    )
    .action((id, options) => run("contract_check", { id, ...options }));
  contract
    .command("map <file>")
    .description(
      "Preview or apply a versioned source-to-contract field mapping draft",
    )
    .action((file) => author("contract_map_fields", readData(file)));
  const flow = app.commands.find((c) => c.name() === "flow")!;
  flow
    .command("locate <id>")
    .description("Show exact editable flow, table and contract locations")
    .action((id) => run("authoring_locations" as OperationName, { flow: id }));
  flow
    .command("ingestion <id>")
    .description(
      "Preview or apply execution and table source settings together",
    )
    .requiredOption(
      "--execution <json>",
      "Installed provider execution settings",
      reviewedJson,
    )
    .option("--sources <file>", "YAML/JSON table-to-source settings map")
    .action((id, options) =>
      author("ingestion_configure" as OperationName, {
        flow: id,
        execution: options.execution,
        sources: options.sources ? readData(options.sources) : {},
      }),
    );
  flow
    .command("connect <id>")
    .description("Review an explicit dataset handover")
    .requiredOption("--input <alias>", "Input alias")
    .requiredOption("--dataset <dataset>", "Published dataset identifier")
    .requiredOption("--handover <kind>", "files or relation")
    .option("--table <id>", "Bind an ingestion table to this file input")
    .action((id, options) => author("flow_connect", { id, ...options }));
  flow
    .command("export <id>")
    .description("Review a shared native export group")
    .requiredOption("--group <id>", "Group owning the native resources")
    .action((id, options) => author("flow_export", { id, ...options }));
  const schedule = flow
    .command("schedule")
    .description("Review durable flow schedules");
  schedule
    .command("show <id>")
    .description("Inspect the saved schedule definition")
    .action((id) => run("schedule_inspect" as OperationName, { flow: id }));
  schedule
    .command("edit <id>")
    .description("Review a schedule from YAML or JSON")
    .requiredOption("--file <file>", "Reviewed schedule definition")
    .action((id, options) =>
      author("schedule_propose" as OperationName, {
        flow: id,
        schedule: readData(options.file),
      }),
    );
  schedule
    .command("clear <id>")
    .description("Review removal of a saved schedule")
    .action((id) =>
      author("schedule_propose" as OperationName, { flow: id, schedule: null }),
    );
  flow
    .command("show <id>")
    .description("Inspect a configured flow")
    .action((id) => run("flow_show", { id }));
  // Existing editing primitives become contextual flow operations. Hidden root
  // spellings stay executable for existing scripts during the preview transition.
  for (const [old, name, description] of [
    ["table", "table", "Configure ingestion tables"],
    ["step", "step", "Compose transformation steps"],
    ["dataset", "output", "Declare published flow outputs"],
  ]) {
    const group = app.commands.find((c) => c.name() === old)!;
    const nested = flow.command(name).description(description);
    for (const command of group.commands) nested.addCommand(command);
  }
  const standards = flow
    .command("standard")
    .description("Find installed standards and supported source kinds");
  standards
    .command("list")
    .action(() => run("catalogue", { kind: "standards" }));
  standards
    .command("show <id>")
    .action((id) => run("catalogue", { kind: "standards", id }));
  app
    .command("check")
    .description(
      "Check project build readiness, configuration or generated output",
    )
    .option(
      "--draft",
      "Check incomplete configuration without claiming build readiness",
    )
    .option(
      "--setup",
      "Diagnose missing local configuration; no platform access",
    )
    .option(
      "--output <directory>",
      "Check generated output ownership and syntax",
    )
    .option("--flow <id>", "Check one flow")
    .option("--profile <name>", "Execution profile within the selected flow")
    .option("--table <id>", "Check one table within a selected flow")
    .option("--step <id>", "Check one step within a selected flow")
    .action((options) => {
      check(
        [options.draft, options.setup, options.output].filter(Boolean).length <=
          1,
        "OPTION",
        "Choose only one check scope: --draft, --setup or --output",
      );
      check(
        !(options.setup || options.output) ||
          !(options.flow || options.table || options.step || options.profile),
        "OPTION",
        "Flow/table/step selection applies only to project checks",
      );
      if (options.output) run("validate_output", { directory: options.output });
      else if (options.setup) run("doctor");
      else
        run("validate", {
          mode: options.draft ? "draft" : "strict",
          ...(options.flow ? { flow: options.flow } : {}),
          ...(options.profile ? { profile: options.profile } : {}),
          ...(options.table ? { table: options.table } : {}),
          ...(options.step ? { step: options.step } : {}),
        });
    });
  app
    .command("build")
    .option(
      "--delivery",
      "Build coordinated provider exports with declared handovers",
    )
    .description(
      "Build project assets, or a provider/flow subset, without deployment",
    )
    .option(
      "--provider <configuration>",
      "Build a configured target and required dependencies",
    )
    .option("--flow <id>", "Build one flow")
    .option("--profile <name>", "Execution profile within the selected flow")
    .option(
      "--out <directory>",
      "Generated output directory",
      "build/generated",
    )
    .option("--ownership <mode>", "managed or team", "managed")
    .action((options) => run("build", options));
  const executionOptions = (command: Command) =>
    command
      .option(
        "--from <directory>",
        "Managed project build (default build/generated)",
      )
      .option(
        "--provider <configuration>",
        "Execute flows in one configured target",
      )
      .option("--flow <id>", "Execute one flow from the build")
      .option("--profile <name>", "Execution profile recorded in the build");
  executionOptions(
    app
      .command("runtime")
      .description("Prepare locked execution dependencies")
      .command("prepare")
      .description(
        "Install/reuse locked local Python environments; explicitly downloads dependencies",
      ),
  )
    .option("--python <path>", "Optional Python 3.12 bootstrap override")
    .action((options) => run("runtime_prepare", options));
  const execution = executionOptions(
    app
      .command("run")
      .description(
        "Execute reviewed local work through its provider; cloud execution is unavailable",
      ),
  )
    .option("--action <action>", "discover, review, approve or run", "run")
    .option("--run-id <id>", "Stable identity; generated when omitted")
    .option(
      "--retry <id>",
      "Retry using a recorded run's unchanged build and selection",
    )
    .option(
      "--secrets-file <file>",
      "Project-relative dotenv file; only declared secret names are passed",
    )
    .action(({ secretsFile, ...options }) =>
      run("run", {
        ...options,
        ...(secretsFile ? { envFile: secretsFile } : {}),
      }),
    );
  app
    .command("discover")
    .description(
      "List every field a flow's source offers and write draft contracts for review",
    )
    .requiredOption("--flow <id>", "Ingestion flow to discover")
    .option(
      "--from <file>",
      "Use a source catalogue or exported metadata rows instead of reading the source",
    )
    .option("--out <directory>", "Directory for draft contracts", "contracts")
    .option(
      "--local <configuration>",
      "Local provider configuration used for native or bridge connections",
    )
    .option("--accept-keys", "Mark the source's primary keys in the drafts")
    .option("--python <path>", "Optional Python 3.12 bootstrap override")
    .option(
      "--secrets-file <file>",
      "Project-relative dotenv file; only declared secret names are passed",
    )
    .action(({ secretsFile, acceptKeys, ...options }) =>
      run("discover", {
        ...options,
        acceptKeys: !!acceptKeys,
        ...(secretsFile ? { envFile: secretsFile } : {}),
      }),
    );
  execution
    .command("status <id>")
    .description("Read the durable local run receipt")
    .action((id) => run("run_status", { id }));
  operationRecoveryCommand(app, execution, host);
  // Installation is explicit; browsing only inspects installed packages.
  const installPlugin = async (
    reference: string | undefined,
    options: any,
    update = false,
    kind?: "provider" | "connector",
  ) => {
    const names = Object.entries(officialPlugins)
      .filter(([, plugin]) => !kind || plugin.kind === kind)
      .map(([name]) => name);
    if (!reference) {
      check(
        canPrompt(),
        "INPUT",
        `Choose an official ${kind ?? "plugin"}: ${names.join(", ")}; explicit owner/repository@version references also work.`,
      );
      reference = await answer(
        prompts.text({
          message: `Official ${kind ?? "plugin"} name or owner/repository`,
          validate: (value) =>
            names.includes(value ?? "") ||
            /^[\w.-]+\/[\w.-]+$/.test(value ?? "")
              ? undefined
              : `Use ${names.join(", ")} or owner/repository`,
        }),
      );
    }
    check(typeof reference === "string", "INPUT", "Choose a plugin reference");
    if (reference.includes("/") && !reference.includes("@")) {
      check(
        canPrompt(),
        "INPUT",
        "Explicit repositories require an exact version: owner/repository@1.2.3. Official names github and local can omit the version.",
      );
      check(
        !options.frozen,
        "OPTION",
        "Frozen installation requires an exact locked reference",
      );
      const available = await perform(
        "plugin_versions",
        {
          provider: reference,
          ...(options.fromGit ? { fromGit: options.fromGit } : {}),
          ...(options.tagPrefix ? { tagPrefix: options.tagPrefix } : {}),
        },
        `Finding versions for ${reference}`,
      );
      if (!available.ok) {
        print(available);
        return;
      }
      const versions = available.result.versions.filter(
        (v: any) => v.selectable,
      );
      check(
        versions.length,
        "PACKAGE",
        "No unambiguous stable tags found; select an explicit commit instead",
      );
      reference = await answer(
        prompts.select({
          message:
            "Choose an exact plugin version (compatibility checked on install)",
          options: versions.map((v: any) => ({
            value: v.reference,
            label: v.reference,
            hint: `Git tag ${v.tag}`,
          })),
        }),
      );
    }
    check(typeof reference === "string", "INPUT", "Choose a package version");
    officialName(reference);
    check(
      !options.name,
      "OPTION",
      "Installation no longer configures projects. Use plugin configure <exact-reference> --name <configuration>.",
    );
    const result = await perform(
      "packages_install",
      {
        reference,
        ...(kind ? { kind } : {}),
        update,
        frozen: !!options.frozen,
        ...(options.fromGit ? { fromGit: options.fromGit } : {}),
        ...(options.tagPrefix ? { tagPrefix: options.tagPrefix } : {}),
      },
      `Installing ${friendlyReference(reference)}`,
    );
    if (!result.ok) {
      print(result);
      return;
    }
    print(result, { reference: result.result.reference, kind });
  };
  const plugin = app
    .command("plugin")
    .description(
      "Install exact-version plugins and inspect their capabilities",
    );
  plugin
    .command("browse [query]")
    .description("Browse installed, integrity-checked plugins")
    .option(
      "--kind <category>",
      "Filter provider, connector, model-pack, report-pack or activity-pack",
    )
    .option("--engine <engine>", "Filter declared connector execution modes")
    .action(async (query, options) => {
      if (!canPrompt())
        return run("plugin_browse", {
          ...(query ? { query } : {}),
          ...options,
        });
      await browsePlugins(
        {
          select: async (message, options) =>
            answer(prompts.select({ message, options })),
          search: async () =>
            answer(
              prompts.text({
                message: "Search plugins by name or description",
                validate: (v) =>
                  (v?.length ?? 0) > 128
                    ? "Use at most 128 characters"
                    : undefined,
              }),
            ),
          details: (text) => prompts.note(text, "Plugin details"),
        },
        query,
        options.kind,
        options,
        context().root,
      );
    });
  plugin
    .command("info <id>")
    .description("Show installed plugin identity, source and declared licence")
    .action((id) => run("plugin_show", { id }));
  plugin
    .command("versions <provider>")
    .description(
      "List stable tags for an official name or owner/repository; compatibility checked at install",
    )
    .option("--from-git <directory>", "Inspect a local Git repository")
    .option(
      "--tag-prefix <prefix>",
      "Component tag prefix in a shared repository",
    )
    .action(async (provider, options) =>
      print(
        await perform(
          "plugin_versions",
          { provider, ...options },
          `Finding versions for ${provider}`,
        ),
      ),
    );
  plugin
    .command("list")
    .description("List locked plugin versions")
    .action(() => run("packages_list"));
  plugin
    .command("templates <reference> <activity>")
    .description(
      "Read an exported activity's templates and generator source without executing it",
    )
    .action((reference, activity) =>
      run("provider_activity_inspect" as OperationName, {
        reference,
        activity,
      }),
    );
  for (const update of [false, true])
    plugin
      .command(`${update ? "update <reference>" : "install [reference]"}`)
      .description(
        "Cache a plugin without changing project configuration; official names default to latest qualified",
      )
      .option("--from-git <directory>", "Local Git source")
      .option(
        "--tag-prefix <prefix>",
        "Component tag prefix in a shared repository",
      )
      .option("--frozen", "Require an existing immutable lock")
      .option(
        "--name <configuration>",
        "Removed: use plugin configure --name instead",
      )
      .option(
        "--cache-only",
        "Compatibility option; cache-only is now the default",
      )
      .action((reference, options) =>
        installPlugin(reference, options, update),
      );
  const typedInstall = (group: Command, kind: "provider" | "connector") => {
    for (const update of [false, true])
      group
        .command(`${update ? "update" : "install"} <reference>`)
        .description(
          `${update ? "Check for a newer" : "Cache and lock a"} ${kind} package without changing project configuration`,
        )
        .option("--from-git <directory>", "Local Git source")
        .option(
          "--tag-prefix <prefix>",
          "Component tag prefix in a shared repository",
        )
        .option("--frozen", "Require an existing immutable lock")
        .action((reference, options) =>
          installPlugin(reference, options, update, kind),
        );
    group
      .command("list")
      .description(`List installed ${kind} packages`)
      .action(() => run("plugin_browse", { kind }));
  };
  const provider = app.commands.find((c) => c.name() === "provider")!;
  typedInstall(provider, "provider");
  typedInstall(
    app
      .command("connector")
      .description("Install and inspect source connectors"),
    "connector",
  );
  plugin
    .command("configure <reference>")
    .description("Register a cached provider with project configuration")
    .option("--name <configuration>", "Provider configuration name")
    .action((reference, options) =>
      author("plugin_configure", { reference, ...options }),
    );
  plugin
    .command("scaffold <id>")
    .description("Create an offline provider starter for review")
    .requiredOption(
      "--out <directory>",
      "New directory inside the project root",
    )
    .action((id, options) => author("provider_scaffold", { id, ...options }));
  plugin
    .command("pack-add <reference>")
    .description("Review attaching a cached model or activity preset pack")
    .requiredOption("--name <alias>", "Project pack alias")
    .option(
      "--provider <configuration>",
      "Parent configuration (activity presets only)",
    )
    .action((reference, options) =>
      author("pack_configure", { reference, ...options }),
    );
  plugin
    .command("check")
    .description(
      "Check project provider contracts, output syntax and determinism offline",
    )
    .option("--delivery", "Check the complete coordinated delivery")
    .action((options) => run("provider_check", options));
  plugin
    .command("show <configuration>")
    .description("Show provider operation capabilities")
    .action((configuration) => run("provider_commands", { configuration }));
  plugin
    .command("migrate")
    .description("Change an existing provider package reference for review")
    .requiredOption("--from <package>", "Existing project package key")
    .requiredOption("--to <reference>", "Installed exact version")
    .action((options) =>
      author("provider_migrate", { package: options.from, to: options.to }),
    );
  const config = app.commands.find((c) => c.name() === "config")!;
  config
    .command("show")
    .description("Inspect resolved configuration; --verbose includes values")
    .action(() => run("resolve"));
  const environments = app.commands.find((c) => c.name() === "environments")!;
  const environment = config
    .command("environment")
    .description("Manage environment profiles");
  for (const command of environments.commands) environment.addCommand(command);
  const advanced = app
    .command("advanced")
    .description(
      "Compiler inspection, plugin development and tool integration",
    );
  for (const name of [
    "plan",
    "diff",
    "generate",
    "schema",
    "mcp",
    "provider",
  ]) {
    advanced.addCommand(app.commands.find((c) => c.name() === name)!);
  }
  const exported = advanced
    .command("export")
    .description("Export files from a saved offline plugin result");
  exported
    .requiredOption("--result <file>")
    .requiredOption("--out <directory>")
    .action((options) => author("provider_export", options));
  const activity = advanced
    .command("activity")
    .description("Inspect installed activity packages");
  activity
    .command("list")
    .action(() => run("catalogue", { kind: "activities" }));
  activity
    .command("check <file>")
    .action((file) => run("activity_inspect", { path: file }));
  // Hide compatibility spellings in introductory help. Re-parenting above is
  // safe for handlers: they use the shared root context, not inherited globals.
  const hidden = new Set([
    "table",
    "step",
    "dataset",
    "environments",
    "providers",
    "activities",
    "standards",
    "packages",
    "validate",
    "doctor",
    "resolve",
    "validate-output",
    "activity",
    "provider",
    "plan",
    "diff",
    "generate",
    "schema",
    "mcp",
  ]);
  app.configureHelp({
    visibleCommands: (command) =>
      command.commands.filter(
        (c) =>
          (command !== app || !hidden.has(c.name())) &&
          (command !== contract || c.name() !== "validate"),
      ),
  });
  app.addHelpText(
    "after",
    "\nStart with a complete walkthrough: https://docs.ingestron.io/docs/start/first-contract\nRun a public GitHub example: https://docs.ingestron.io/docs/tutorials/github-to-parquet\nPlugin installation caches packages; use plugin configure to add a provider to your project.\nUse --json for automation; --verbose for detailed terminal output.",
  );
}
