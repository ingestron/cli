/** Official-name convenience at the adapter boundary; core only receives exact references. */
import {
  executeAsync,
  operationSchemas,
  type Context,
  type OperationName,
  type Result,
} from "@ingestron/core";
import { check, packageLock, Problem } from "@ingestron/core/adapter";
import { coreVersion } from "../version.js";

export const officialPlugins = {
  "azure-blob": {
    repository: "ingestron/connectors",
    path: "connectors/azure-blob/connector.yaml",
    tagPrefix: "azure-blob-",
  },
  files: {
    repository: "ingestron/connectors",
    path: "connectors/files/connector.yaml",
    tagPrefix: "files-",
  },
  github: {
    repository: "ingestron/connectors",
    path: "connectors/github/connector.yaml",
    tagPrefix: "github-",
  },
  local: {
    repository: "ingestron/provider-local",
    path: "plugin/provider.yaml",
    tagPrefix: "",
  },
} as const;
const catalogueUrl =
  "https://raw.githubusercontent.com/ingestron/connectors/main/catalogue.json";
const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const compare = (a: string, b: string) => {
  const x = a.split(".").map(Number),
    y = b.split(".").map(Number);
  return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
};
export function officialName(reference: string) {
  if (reference.includes("/")) return undefined;
  const [name, version, extra] = reference.split("@");
  check(
    Object.hasOwn(officialPlugins, name),
    "PACKAGE",
    `Unknown official plugin '${name}'. Use ${Object.keys(officialPlugins).join(", ")}, or an explicit owner/repository reference. Check ingestron --version and update the CLI if a documented name is missing.`,
  );
  check(
    extra === undefined &&
      (version === undefined || version === "latest" || stable.test(version)),
    "PACKAGE",
    "Use a stable version, @latest, or omit the version for an official plugin",
  );
  return { name: name as keyof typeof officialPlugins, version };
}
export function catalogueReleases(
  value: any,
  name: keyof typeof officialPlugins,
  host = coreVersion,
): string[] {
  const identity = officialPlugins[name];
  check(
    value?.apiVersion === "ingestron.catalogue/v1",
    "CATALOGUE",
    "Unsupported official catalogue format",
  );
  const entry = value.plugins?.[name];
  check(
    entry &&
      entry.repository === identity.repository &&
      entry.path === identity.path &&
      entry.tagPrefix === identity.tagPrefix &&
      Array.isArray(entry.releases) &&
      entry.releases.length <= 1000,
    "CATALOGUE",
    `Invalid official catalogue identity for ${name}`,
  );
  const seen = new Set<string>();
  for (const release of entry.releases) {
    check(
      stable.test(release.version) &&
        !seen.has(release.version) &&
        Array.isArray(release.coreVersions) &&
        release.coreVersions.length > 0 &&
        release.coreVersions.every(
          (v: unknown) => typeof v === "string" && stable.test(v),
        ),
      "CATALOGUE",
      `Invalid qualified release for ${name}`,
    );
    seen.add(release.version);
  }
  return entry.releases
    .filter((r: any) => r.coreVersions.includes(host))
    .map((r: any) => r.version)
    .sort(compare);
}
export async function fetchCatalogue(): Promise<unknown> {
  try {
    const response = await fetch(catalogueUrl, {
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    check(
      response.ok && response.body,
      "CATALOGUE",
      "Official catalogue is unavailable; retry or install an explicit version",
    );
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        check(
          size <= 262144,
          "CATALOGUE",
          "Official catalogue exceeds the size limit",
        );
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof Problem) throw error;
    throw new Problem(
      "CATALOGUE",
      "Cannot read the official catalogue; retry or install an explicit version",
    );
  }
}
export async function resolvePluginArgs(
  context: Context,
  operation: OperationName,
  args: any,
  catalogue = fetchCatalogue,
): Promise<any> {
  if (operation !== "packages_install" && operation !== "plugin_versions")
    return args;
  const field = operation === "packages_install" ? "reference" : "provider";
  const alias = officialName(args[field]);
  if (!alias) return args;
  const identity = officialPlugins[alias.name];
  check(
    args.tagPrefix === undefined || args.tagPrefix === identity.tagPrefix,
    "OPTION",
    "Official plugin tag prefixes cannot be overridden; use an explicit reference for custom tags",
  );
  if (operation === "plugin_versions")
    return {
      ...args,
      provider: identity.repository,
      tagPrefix: identity.tagPrefix,
    };
  // Check permissions before catalogue network access, just as core does before install.
  check(
    context.allowWrite,
    "PERMISSION",
    "Package installation requires write access",
  );
  check(
    !(args.update && args.frozen),
    "PACKAGE",
    "Frozen installation cannot update packages",
  );
  const base = `${identity.repository}/${identity.path}@`;
  let version = alias.version;
  if (version === undefined || version === "latest") {
    const installed = Object.keys(packageLock(context.root).packages)
      .filter((r) => r.startsWith(base) && stable.test(r.slice(base.length)))
      .map((r) => r.slice(base.length))
      .sort(compare);
    if (!args.update && installed.length) version = installed[0];
    else {
      check(
        !args.frozen,
        "PACKAGE",
        "Frozen installation requires an existing exact lock; install an exact version first",
      );
      check(
        context.allowNetwork,
        "PERMISSION",
        "Latest plugin resolution requires explicit package-network access",
      );
      check(
        !args.fromGit,
        "OPTION",
        "Use an exact version with --from-git; latest selects official qualified releases",
      );
      const versions = catalogueReleases(await catalogue(), alias.name);
      check(
        versions.length,
        "COMPATIBILITY",
        `No qualified ${alias.name} release supports core ${coreVersion}; update the CLI or select an explicitly compatible version`,
      );
      version = [...versions, ...installed].sort(compare)[0];
    }
  }
  // Even 'update' must never retarget an existing immutable version lock.
  return {
    ...args,
    reference: `${base}${version}`,
    tagPrefix: identity.tagPrefix,
    update: false,
  };
}
export async function executePluginOperation(
  context: Context,
  operation: OperationName,
  args: any = {},
): Promise<Result> {
  try {
    if (operation === "packages_install" || operation === "plugin_versions") {
      const parsed = operationSchemas[operation].safeParse(args);
      check(parsed.success, "SCHEMA", "Invalid plugin operation arguments");
      if (operation === "packages_install")
        check(
          context.allowWrite,
          "PERMISSION",
          "Package installation requires write access",
        );
      check(
        context.allowNetwork || parsed.data?.fromGit,
        "PERMISSION",
        "Package access requires explicit package-network access",
      );
      args = await resolvePluginArgs(context, operation, parsed.data);
    }
    const result = await executeAsync(context, operation, args);
    // Keep custom manifest paths in every returned installable reference.
    if (operation === "plugin_versions" && result.ok) {
      const identity = Object.values(officialPlugins).find(
        (p) => p.repository === args.provider && p.tagPrefix === args.tagPrefix,
      );
      if (identity)
        result.result.versions = result.result.versions.map((v: any) => ({
          ...v,
          reference: `${identity.repository}/${identity.path}@${v.version}`,
        }));
    }
    return result;
  } catch (error) {
    const e =
      error instanceof Problem
        ? error
        : new Problem(
            "PACKAGE",
            "Plugin resolution failed; check the reference and catalogue",
          );
    return {
      apiVersion: "ingestron.operation/v1",
      operation,
      ok: false,
      diagnostics: [{ code: e.code, message: e.message }],
    };
  }
}
