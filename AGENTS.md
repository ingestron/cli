# Standalone Ingestron CLI

This repository owns terminal commands/presentation and the thin MCP adapter.
The independent `ingestron/core` repository owns schemas, compiler, operation
semantics, plugin host and generated-file protection. Consume its immutable version;
no compiler copies, workspace package or sibling source imports belong here.
Native generators and standards remain in registered provider repositories.

Use Node 22 and pnpm 10.15.0. Work on scoped codex/ branches. Run pnpm validate
before delivery. Preserve unrelated changes and generated-file ownership.

Never connect to ADF, Databricks, Fabric or source data from the compiler/tests.
Do not invoke platform validate/deploy commands: some require workspace access.
User SQL and Python are source artefacts, never compiler-side executable input.
Use synthetic fixtures. Keep secrets out of YAML, manifests, output and logs.

Standards come from exact-version installed providers. Reject unsupported semantics; do not drop
configuration silently or describe offline checks as native execution proof.
Keep compatibility, sources and limitations in docs/. The npm name is `ingestron`.
Original code is Apache-2.0 with Otrera Limited as licensor, authorised by the owner.
Preserve upstream notices. This is the one active CLI source repository.

## Provider references

Core resolves explicit owner/repository@version or full manifest references.
Plugin browsing shows installed packages only. Do not reintroduce private product
aliases or an upstream marketplace into core. Official github/local aliases resolve in the shared CLI/MCP adapter using qualified
metadata from ingestron/connectors/catalogue.json. Keep this catalogue outside core;
installation caches exact locks and never configures the project implicitly.

Explicit execution lives in the separate execution operation boundary. Build/planning
remain offline. CLI/MCP execution requires explicit authority; MCP needs its own
allow-execute opt-in. Execution tests use synthetic providers/sources only. Databricks
and ADF run/deploy stay unavailable until their own reviewed qualification.

## Independent core dependency

Pin `@ingestron/core` to an exact published npm version. No private Git dependency,
sibling compiler copy or core-access credential belongs here. Run `pnpm validate`
and `pnpm package:check` against installed packages. Public source and npm releases
remain separately verified actions; never overwrite existing registry versions.
