# Contributing

Use Node 22 and pnpm 10.15.0. After cloning this repository:

```sh
pnpm install --frozen-lockfile
pnpm validate
```

The gate checks formatting, builds the adapters, runs synthetic CLI/MCP tests and
the quickstart, checks documentation links and notices, and installs the packed CLI
in an isolated directory. It compares CLI and core plans and tests the actual stdio
MCP transport. Network access is needed to download npm dependencies; tests do not
contact a customer source or cloud platform. Execution tests use local Python 3.12
on macOS/Linux. CI supplies that runtime.

This repository owns terminal parsing, presentation and MCP transport. Shared
schemas, operation semantics, plugin loading and compiler logic belong in
[core](https://github.com/ingestron/core). Consume its exact npm version; do not
copy implementation or add sibling checkout dependencies. Platform generators and
standards belong in their plugin repositories. Product roadmaps are maintained
outside this component; command help describes implemented behaviour only.

Keep changes focused, preserve unrelated edits, and run `pnpm format` after editing.
Add a boundary regression test when changing parsing, permissions or transport.
Use synthetic fixtures and retain generated-file protection. Do not add credentials,
production data or source-system logs. For vulnerabilities, see [SECURITY](SECURITY.md).

When changing dependencies, regenerate `THIRD_PARTY_NOTICES.md` using
`pnpm licences:inventory` and review the complete upstream texts. Follow the
[release procedure](docs/release.md) before publishing an npm package.
