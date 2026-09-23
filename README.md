# Ingestron CLI

Create reviewed data contracts, configure flows and generate native data-engineering
assets from versioned plugins. Use the same project operations from your terminal
or an MCP client.

The CLI is a thin application over [`@ingestron/core`](https://github.com/ingestron/core).
Providers supply platform-specific generators, connectors and standards. Installing
the CLI does not install a platform provider or connect to a cloud account.

## Get started

Use Node 22.12 or newer, Git and pnpm 10.15.0. Build the public source:

```sh
git clone https://github.com/ingestron/cli.git
cd cli
pnpm install --frozen-lockfile
pnpm build
node build/cli/cli/index.js --help
pnpm examples:check
```

The example creates metadata and a draft contract, checks overwrite protection,
and builds SQL with a synthetic plugin. It needs no private repository or cloud
account and removes its temporary files afterwards.

To install this checkout's CLI in your terminal:

```sh
pnpm pack --pack-destination build/release
npm install --global ./build/release/ingestron-0.15.1.tgz
ingestron --version
```

This source release prepares the npm package named `ingestron`; it does not claim
that the same CLI version is already published on npm. Its core dependency is the
public, exact version `@ingestron/core@0.12.4`.

Follow the [five-minute quickstart](docs/quickstart.md) for a project you can keep.

## Work with projects and plugins

Commands use resource groups such as `source`, `contract`, `flow`, `config`,
`provider` and `connector`. Installed packages can add their own namespace:

```text
ingestron provider install local
ingestron connector install github
ingestron <namespace> <resource> <verb> --input request.json
```

Installation caches an exact, qualified version without changing project configuration.
Use `github@1.33.0` for an explicit pin, or `connector update github` to check for a newer
qualified release. Browse installed packages with `ingestron plugin browse`. Command help
shows the selected plugin's input schema without executing it.

- [Command reference](docs/commands.md) — implemented groups, options and errors.
- [Plugins](docs/plugins.md) — exact versions, installation, namespaces and a local starter.
- [Builds and ownership](docs/builds.md) — validate, generate, review and regenerate safely.
- [Automation and MCP](docs/automation.md) — JSON output and explicit permissions.
- [Contributing](CONTRIBUTING.md) — tests, package boundaries and releases.

Builds and checks run locally. Cloud login, deployment and remote flow execution
are not implemented. Local execution requires a compatible installed provider and
explicit `runtime prepare` / `run` commands; generated Python runs as your OS user,
not inside the compiler's JavaScript sandbox. See [security](SECURITY.md).

## Licence

Original code is licensed by **Otrera Limited** under [Apache-2.0](LICENSE).
[NOTICE](NOTICE) and [third-party notices](THIRD_PARTY_NOTICES.md) retain attribution
and dependency terms.
