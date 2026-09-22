/** Presentation is deliberately separate from operation results. JSON is the
 * lossless API; terminal output is bounded, plain text and actionable. Never
 * serialise arbitrary plugin data or resolved bindings in the default summary. */
import { friendlyReference } from "@ingestron/core/adapter";
import { stringify } from "yaml";
import { officialPlugins } from "./plugin-resolution.js";
import type { Result } from "@ingestron/core";
export function exitCode(result: Result): number {
  if (result.ok) return 0;
  const codes = result.diagnostics.map((d) => d.code);
  if (codes.includes("CANCELLED")) return 130;
  if (codes.includes("NOT_IMPLEMENTED")) return 4;
  if (codes.some((c) => ["STALE", "OWNER", "CONFLICT"].includes(c))) return 5;
  if (
    codes.some((c) =>
      [
        "INPUT",
        "BINDING",
        "CAPABILITY",
        "PACKAGE",
        "OPTION",
        "COMMAND",
        "SCHEMA",
      ].includes(c),
    )
  )
    return 3;
  return 2;
}
const clean = (value: unknown): string =>
  String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
function pluginLabel(reference: string): string {
  for (const [name, entry] of Object.entries(officialPlugins)) {
    const prefixes = [
      `${entry.repository}/${entry.path}@`,
      ...(name === "local" ? [`${entry.repository}@`] : []),
    ];
    for (const prefix of prefixes)
      if (reference.startsWith(prefix)) {
        const version = reference.slice(prefix.length);
        if (/^\d+\.\d+\.\d+$/.test(version)) return `${name}@${version}`;
      }
  }
  return friendlyReference(reference);
}
function lines(title: string, items: string[], empty: string) {
  if (!items.length) return empty;
  return `${title} (${items.length})\n${items
    .slice(0, 20)
    .map((i) => `  ${clean(i)}`)
    .join(
      "\n",
    )}${items.length > 20 ? "\n  More results available with --json or --verbose." : ""}`;
}
export function terminal(
  result: Result,
  verbose = false,
  args: any = {},
): string {
  if (!result.ok)
    return result.diagnostics
      .map(
        (d) =>
          `Error: ${clean(d.message)}${verbose ? ` [${d.code}]` : ""}${d.file ? `\n  File: ${clean(d.file)}${clean(d.pointer ?? "")}` : ""}${d.hint ? `\n  Next: ${clean(d.hint)}` : ""}`,
      )
      .join("\n");
  const value = result.result;
  if (verbose)
    return `${result.operation.replaceAll("_", " ")}\n${typeof value === "string" ? value : stringify(value).trimEnd()}`;
  if (value?.apiVersion === "ingestron.change/v1")
    return (
      lines(
        "Proposed file changes",
        value.changes.map(
          (c: any) => `${c.before === null ? "Create" : "Update"} ${c.path}`,
        ),
        "No file changes needed.",
      ) + "\nPreview only; no files changed."
    );
  if (value?.applied)
    return lines("Saved files", value.files, "No file changes needed.");
  switch (result.operation) {
    case "plugin_browse":
      return (
        (value.length
          ? "Installed plugins\n\n" +
            value
              .map(
                (p: any) =>
                  `  ${clean(p.id).padEnd(13)} ${clean(p.name)} [${clean(p.kindLabel)} · ${clean(p.availability)}]\n    ${clean(p.description)}\n    ${clean(p.url)}`,
              )
              .join("\n\n")
          : "No installed plugins match this search.") +
        "\n\nBrowse versions: ingestron plugin versions github\nGuided install: ingestron plugin install\nInstall: ingestron plugin install github"
      );
    case "plugin_versions":
      return (
        lines(
          `Versions for ${value.provider}`,
          value.versions.map(
            (v: any) =>
              `${v.reference}${v.ambiguous ? "  (conflicting tags; select a commit)" : ""}`,
          ),
          "No stable version tags found.",
        ) +
        "\n\n" +
        value.evidence +
        "\nInstall: ingestron plugin install <owner/repository>@<version>"
      );
    case "packages_install":
      return `${value.cached ? "Using cached" : "Installed"} plugin ${clean(pluginLabel(args.reference ?? value.reference ?? "package"))}.\nUse --verbose for the exact reference and licence information.`;
    case "packages_list":
      return lines(
        "Installed plugins",
        Object.keys(value.packages).map(pluginLabel),
        "No plugins installed.\nNext: ingestron plugin install local",
      );
    case "source_list":
      return lines(
        "Sources",
        value.map(
          (s: any) =>
            `${s.id}  ${s.type}${s.format ? "/" + s.format : ""}  ${s.execution}`,
        ),
        "No sources configured.\nNext: ingestron source add <name> --type <type>",
      );
    case "source_show":
      return `Source ${clean(value.id)}\n  Type: ${clean(value.type)}${value.format ? ` (${clean(value.format)})` : ""}\n  Execution: ${clean(value.selected.execution)}\n  Environment: ${clean(value.selected.environment)}\n  Provider: ${clean(value.selected.provider ?? "project default")}\nUse --verbose to inspect connection references.`;
    case "contract_list":
      return lines(
        "Contracts",
        value.map((c: any) => `${c.id}  ${c.status}  ${c.path}`),
        "No contracts drafted.\nNext: ingestron contract draft <name> --metadata <file>",
      );
    case "contract_show":
      return (
        `Contract ${clean(value.id)} (${clean(value.status)})\n` +
        lines(
          "Entities",
          (value.schema ?? []).map(
            (s: any) =>
              `${s.physicalName ?? s.name}: ${(s.properties ?? []).length} fields`,
          ),
          "No entities.",
        ) +
        "\nUse --verbose to review the complete contract."
      );
    case "contract_check":
      return `Contract valid: ${clean(value.path)}${value.status === "draft" ? "\nStatus: draft; review business requirements before use." : ""}\n${clean(value.evidence)}`;
    case "contract_validate":
      return `Contract valid for native table authoring (${value.columns.length} columns).`;
    case "inspect":
      return lines(
        "Flows",
        value.flows.map(
          (f: any) =>
            `${f.id}  ${f.kind}  ${f.tables.length} tables, ${f.outputs.length} outputs`,
        ),
        "No flows configured.\nNext: ingestron flow add <name> --contract <name> --standard <standard>",
      );
    case "flow_show":
      return `Flow ${clean(value.id)}\n  Kind: ${clean(value.kind)}\n  Tables: ${
        Object.keys(value.tables ?? {})
          .map(clean)
          .join(", ") || "none"
      }\n  Outputs: ${
        Object.keys(value.publishes ?? {})
          .map(clean)
          .join(", ") || "none"
      }\nUse --verbose to inspect configuration.`;
    case "validate":
      return value.mode === "draft"
        ? `Draft configuration checked (${value.flows} flows).\n${value.pending.length} unresolved inputs. Strict build readiness has not been checked.`
        : `Project checks passed${value.nodes === undefined ? "" : ` (${value.nodes} planned nodes)`}.\nValidation is local; no platform connection was tested.`;
    case "doctor":
      return `Project ${clean(value.project)} (${clean(value.environment)})\n${value.pending.length} unresolved inputs.\n${clean(value.platformAccess)}\nNext: ${clean(value.next)}`;
    case "runtime_prepare":
      return (
        `Runtime ${clean(value.status)} for ${value.flows.map(clean).join(", ")}.` +
        (value.result?.flows ?? [])
          .map(
            (f: any) =>
              `\n  ${clean(f.flow)}: Python ${clean(f.pythonVersion ?? "3.12")} (${f.reused ? "reused" : "prepared"})`,
          )
          .join("") +
        `\nUse ingestron run status ${clean(value.id)} --verbose for environment paths and details.`
      );
    case "run":
    case "run_status":
      return `Run ${clean(value.id)}: ${clean(value.status)} (${clean(value.action)}).\nTarget: ${clean(value.configuration)}; flows: ${value.flows.map(clean).join(", ")}.\nUse ingestron run status ${clean(value.id)} to inspect the receipt.`;
    case "build":
      return `Built ${value.packages?.length ?? 1} project package(s) into ${clean(value.directory)}.\n${clean(value.evidence)}`;
    case "generate":
      return "Generated native assets.\nUse check --output <directory> to verify local output.";
    case "validate_output":
      return "Generated output checks passed.\nOwnership and syntax checked locally; no platform connection was tested.";
    case "environments":
      return lines(
        "Environments",
        value.available.map(
          (e: string) => `${e}${e === value.selected ? " (selected)" : ""}`,
        ),
        "No environments configured.",
      );
    case "tables":
      return lines(
        "Flow tables",
        value.map((f: any) => `${f.flow}: ${f.tables.join(", ") || "none"}`),
        "No tables configured.",
      );
    case "catalogue":
      return lines(
        args.kind ?? "Capabilities",
        value.map(
          (v: any) =>
            `${v.id}${v.version ? "@" + v.version : ""}${v.description ? "  " + v.description : ""}`,
        ),
        `No ${args.kind ?? "capabilities"} available.\nNext: ingestron plugin list`,
      );
    case "provider_commands":
      return lines(
        "Plugin operations",
        value.commands.map((c: any) => `${c.name}  ${c.description}`),
        "No plugin operations available.",
      );
    case "plugin_command":
    case "provider_command":
      return "Plugin operation completed locally.\nUse --json, --verbose or --out to inspect its result.";
    case "plan":
      return `Local build plan ready (${value.nodes.length} nodes).\nUse --json or --verbose to inspect the plan.`;
    case "diff":
      return `Local differences: ${value.added.length} added, ${value.changed.length} changed, ${value.removed.length} removed.`;
    case "config_explain":
      return `Configuration: ${clean(value.path)} (${clean(value.environment)})\nUse --verbose to inspect declared and resolved values.`;
    case "resolve":
      return (
        `Project ${clean(value.project.id)} — resolved build configuration\n` +
        `Providers: ${
          Object.keys(value.project.providers?.configurations ?? {})
            .map(clean)
            .join(", ") || "none"
        }\n` +
        `Connections: ${
          Object.keys(value.project.connections ?? {})
            .map(clean)
            .join(", ") || "none"
        }\n` +
        `Flows: ${value.flows.length}; unresolved inputs: ${value.pending.length}.\n` +
        "Authored files: ingestron source list; ingestron contract list.\nUse --verbose for resolved configuration and input-file digests."
      );
    case "read":
      return value.content;
    case "schema":
      return "Schema available. Use --json for tools or --verbose to inspect it.";
  }
  return `${result.operation.replaceAll("_", " ")} completed.\nUse --json for structured data or --verbose for details.`;
}
