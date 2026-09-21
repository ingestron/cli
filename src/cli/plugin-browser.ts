import { browseProviders, pluginKindLabel } from "@ingestron/core/adapter";
interface Browser {
  select(
    message: string,
    options: { value: string; label: string; hint?: string }[],
  ): Promise<string>;
  search(): Promise<string>;
  details(text: string): void;
}
/** Read-only navigation of installed plugin metadata. */
export async function browsePlugins(
  ui: Browser,
  query = "",
  initialKind?: string,
  filters: { engine?: string } = {},
  root = process.cwd(),
) {
  browseProviders(root, query, initialKind, filters); // Validate filters even when catalogue is empty.
  let kind = initialKind;
  let listing = !!query || !!kind;
  let page = 0;
  for (;;) {
    if (!listing) {
      const choice = await ui.select("Browse plugins", [
        { value: "all", label: "Browse all plugins" },
        { value: "search", label: "Search plugins" },
        ...(
          ["provider", "model-pack", "activity-pack", "report-pack"] as const
        ).map((value) => ({ value, label: pluginKindLabel(value) })),
        {
          value: "connector",
          label: "Connectors",
          hint: "Installed connector packages",
        },
        { value: "exit", label: "Finish browsing" },
      ]);
      if (choice === "exit") return;
      kind = ["all", "search"].includes(choice) ? undefined : choice;
      query = choice === "search" ? await ui.search() : "";
      listing = true;
      page = 0;
    }
    const plugins = browseProviders(root, query, kind, filters);
    const visible = plugins.slice(page * 25, (page + 1) * 25);
    const selected = await ui.select(
      plugins.length
        ? `Select a plugin (${plugins.length} results, page ${page + 1})`
        : "No plugins match; change category or search",
      [
        ...visible.map((p) => ({
          value: p.reference,
          label: `${p.name} [${p.kindLabel}]`,
          hint: `${p.availability} · ${p.description}`,
        })),
        ...(page > 0 ? [{ value: ":previous", label: "Previous page" }] : []),
        ...((page + 1) * 25 < plugins.length
          ? [{ value: ":next", label: "Next page" }]
          : []),
        { value: ":search", label: "Search this category" },
        { value: ":back", label: "Change category / browse all" },
        { value: ":exit", label: "Finish browsing" },
      ],
    );
    if (selected === ":next") {
      page++;
      continue;
    }
    if (selected === ":previous") {
      page--;
      continue;
    }
    if (selected === ":exit") return;
    if (selected === ":back") {
      listing = false;
      continue;
    }
    if (selected === ":search") {
      query = await ui.search();
      page = 0;
      continue;
    }
    const plugin = plugins.find((p) => p.reference === selected)!;
    ui.details(
      `${plugin.name} (${plugin.id})\n${plugin.kindLabel} · ${plugin.availability}\n\n${plugin.description}\n${plugin.evidence}\n\nLicence: ${plugin.licence}\nDocumentation: ${plugin.documentation}\nSource and package documentation: ${plugin.url}\n\nExact-version licences/notices and provenance are saved to .ingestron/plugin-info/ during installation. Engine compatibility is package-specific; installed metadata is not runtime verification.`,
    );
    const action = await ui.select("Next step", [
      { value: "back", label: "Back to results" },
      { value: "exit", label: "Finish browsing" },
    ]);
    if (action === "exit") return;
  }
}
