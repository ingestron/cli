# Changelog

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
