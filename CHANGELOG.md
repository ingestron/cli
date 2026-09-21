# Changelog

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
