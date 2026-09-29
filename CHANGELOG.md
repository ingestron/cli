# Changelog

## 0.17.6

- Pin core 0.12.12. Providers can declare where each engine's rules are enforced,
  and SQL rules may use `${table}` and, on column rules, `${column}`; other
  placeholders fail `check`. Databricks 3.5.0 and ADF 4.5.0 use this.

## 0.17.5

- Pin core 0.12.11. Providers can declare which contract quality rules they
  enforce for each ingestion standard; `check` and `build` report coverage for
  the standard a flow selects. Databricks 3.4.0 and ADF 4.4.0 use this.

## 0.17.4

- Pin core 0.12.10. Connectors that check contract quality rules before commit
  count those rules as enforced at load for connection flows. `run` and
  `run status` report how many rules were checked and name any warnings; a failed
  error-severity rule stops the run with nothing committed.

## 0.17.3

- Pin core 0.12.9. Contracts can carry ODCS quality rules; `check` and `build`
  report how each target enforces them, and an error-severity rule the target
  cannot enforce blocks the build unless `defaults.quality.unsupported: report`.
  Primary keys imply not-null and unique rules, reported without blocking.

## 0.17.2

- Pin core 0.12.8. `ingestron check` lists data products with status and owner
  from ODCS contracts, and notes quality rules recorded but not yet enforced.
  An active contract must name an owner.

## 0.17.1

- Add `adf` and `databricks` official provider names, resolving to the public
  `ingestron/provider-adf` and `ingestron/provider-databricks` releases through the
  qualified catalogue. Both providers generate files only and never deploy.

## 0.17.0

- Bind one ingestion flow to named execution profiles with `--flow` and `--profile`.
  Environments, datasets and contracts remain shared.
- Pin core 0.12.7; builds and execution reject mismatched profile evidence.

## 0.16.3

- Resolve qualified plugin aliases through the same adapter in JSON-stdin, terminal
  and MCP installation routes. Preserve permission checks and exact package locks.

## 0.16.2

- Pin core 0.12.6 so mixed local and native-target projects validate correctly.
- Add a JSON-stdin operation boundary for Studio hosts, with explicit write,
  download and execution permissions and a bounded request size.

## 0.16.1

- Add `contract scaffold` for a minimal draft from a known field.
- Let `connections flow-add --execution <file>` pass reviewed provider-specific
  execution settings to the core operation.
- Pin the public core 0.12.5 package for the shared operation contract.

## 0.16.0 (private candidate)

- Add reviewable `connections add` and `connections flow-add` commands for
  connector-backed project authoring.
- Add `contract map` for versioned source-field selection and target names using
  saved discovery evidence. Review, approval and execution remain separate.
- Consume the matching unpublished core 0.12.5 operation contract.

## 0.15.1

- Pin core 0.12.4 so CLI and MCP accept reusable connections with per-table source selectors; new projects start with short top-level package names.
- Existing stream-based projects and exact package locks remain supported.

## 0.15.0

- Add `provider install` and `connector install` with matching list/update commands. They use the existing immutable package cache and reject a package of the wrong type before changing the lock.
- Move direct provider command execution to `provider exec`. Keep `plugin install` and the older `providers install` spelling for existing scripts.
- Pin core 0.12.2 so connected flows can resolve reviewed model-pack contracts in the same way as planning.

## 0.14.2

- Add the qualified `sql-server` source shortcut to CLI and MCP. `sql-server@1.0.0`
  resolves to its immutable source tag; installation still only caches the package.
- Offer every current official plugin in the interactive install prompt.

## 0.14.1

- Add `azure-blob` and `azure-blob@1.0.0` shortcuts, including qualified latest selection and MCP parity. No tag-prefix option is needed.
- Derive official-name help from the shared alias map and suggest checking/updating the CLI when a name is unknown.

## 0.14.0

- Add the official `files` plugin alias to CLI and MCP, with exact qualified catalogue resolution and unchanged cache-only installation.
- Keep core pinned to published 0.12.1; existing plugin identities and locks remain unchanged.

## 0.13.2

- Keep official plugin names short in ordinary install/list output; exact references remain in verbose and JSON output.
- Link help to complete walkthroughs and explain the separate provider-configuration step.
- Summarise configured resources and show Python preparation/reuse details from the local provider.

## 0.13.1 — Node.js runtime compatibility

- Require Node 22.12 or newer instead of excluding newer major versions. CI tests
  Node 22.12.0, 22.23.2 and 24.12.0, including installed CLI and MCP workflows.
- Pin core 0.12.1 so the transitive core package no longer warns on Node 24.

## 0.13.0 — simpler plugin installation

- CLI and MCP resolve official `github` and `local` names through shared adapter logic.
  Omitted versions and `@latest` select qualified compatible releases, then pin exact
  versions/commits. Repeated installs reuse locks; updates are explicit.
- Installation now only caches packages. Register project providers separately with
  `plugin configure`; `--cache-only` remains accepted and `install --name` gives a
  migration diagnostic. Existing full references and custom tag prefixes still work.
- Core remains pinned at 0.12.0; no source/provider runtime change is required.

## 0.12.1 — project-relative secret files

- Use `run --secrets-file .env` instead of `--env-file`. Node interprets the old
  flag before CLI startup; the new name preserves project-relative loading and
  source-declared secret filtering. Core/MCP's `envFile` operation field is unchanged.
- A subprocess regression verifies the option from outside the project directory.

## 0.12.0 — public source preview

- Terminal and stdio MCP adapters consume the exact public `@ingestron/core@0.12.0` package.
- Resource-oriented commands support project authoring, contracts, flows, builds and installed plugin namespaces.
- Plugin installation uses explicit repository references and immutable locks; browsing shows installed packages only.
- JSON output, reviewed changes, output ownership and separate MCP permission controls share core semantics.
- Public examples run without private providers. No platform implementation, marketplace catalogue or future-command placeholder is bundled.

CLI npm publication is a separate release step. Earlier private development history
is not a list of publicly supported releases.
