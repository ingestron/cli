# Install providers and connectors

Plugins supply platform generators, connector definitions, standards and other
versioned capabilities. The CLI hosts their commands through core; it contains no
bundled marketplace or platform implementation.

## Install an execution provider or source connector

```sh
ingestron provider install local
ingestron connector install github
ingestron connector install files
ingestron connector install azure-blob
ingestron connector install sql-server@1.0.0
```

Official names resolve through the small [qualified release catalogue](https://github.com/ingestron/connectors/blob/main/catalogue.json).
On first installation, an omitted version or `@latest` selects the newest catalogue
release qualified with this CLI's pinned core. The result records an exact version,
Git commit and file digests in `packages.lock.yaml`. Commit that lock. Catalogue
metadata is fetched only when resolving a new latest selection; it contains no code.
If it is unavailable, retry or specify an exact version.

Each command checks the package type before changing `packages.lock.yaml`.
Installation caches the package under `.ingestron/packages/` in the selected project
(or current directory). It does **not** edit `project.yaml`, create a connection or
execute the plugin. `--cache-only` remains accepted but is no longer needed.

```sh
ingestron connector install github@1.33.0
ingestron provider install local@0.4.1
ingestron connector install github --frozen
ingestron connector update github
```

Repeated installation, including `@latest`, reuses the highest exact stable version
already locked for that official plugin. `--frozen` requires an existing lock;
it never consults the catalogue. `update` explicitly checks the catalogue for a newer
compatible release and caches it alongside existing versions. It never downgrades
or retargets an existing version lock, and does not change project selections.
Builds and runs keep using their configured exact references.

## Other packages and development

Explicit references remain supported under the matching command:

```text
ingestron plugin versions owner/repository
ingestron provider install owner/repository@1.2.3
ingestron connector install owner/repository/connector.yaml@1.2.3
```

`plugin/provider.yaml` is the default manifest. Other packages use an explicit
path such as `owner/repository/packs/model.yaml@1.2.3`; 40-character Git commits
also work. Shared repositories can use `--tag-prefix <prefix>`. Official names
supply their paths/prefixes automatically. No `@latest` resolution for arbitrary
repositories is implied.

`plugin versions github` lists source-specific Git tags, including releases not
qualified in the catalogue. Listing is not compatibility proof. Interactive
`plugin install` remains available for older scripts and other package types.
Interactive installation asks for an official name or a repository; repositories require
selection of an exact tag. Automation can use names, but should pin exact versions
and use `--frozen` for reproducible restoration.

`--from-git <directory>` with an exact version uses a local Git repository for
development. Private repositories use your existing authorised GitHub credentials.
Installation does not run package install hooks. Existing full-reference behaviour
is retained; prefer official names for qualified version selection.

## Configure and inspect

```sh
ingestron provider list
ingestron connector list
ingestron plugin list
ingestron plugin browse --no-input
ingestron plugin info <installed-id-or-reference>
ingestron plugin show <configuration>
```

Replace angle-bracket placeholders with identities from your project. Browsing is
read-only and lists only installed, integrity-checked packages. Empty results do
not mean GitHub was searched. `info` describes package metadata; `show` describes a
configured provider's operation capabilities. A failed registration can leave a
valid cache/lock; resolve its configuration conflict and retry `plugin configure`.

Use `plugin configure <exact-reference> --name <configuration>` to register a cached
provider. Use the full resolved reference printed by installation or `plugin list`.
The former `plugin install --name` option now reports this separate configuration step.
Multiple configurations can use the same package. `plugin migrate
--from <package-key> --to <reference>` changes an existing selection; preview with
`--dry-run`, then regenerate and review changed output. Model/activity presets can
be attached with `plugin pack-add`; the package owns its supported contract.

## Namespaced commands

A configured plugin may declare commands in this form:

```text
ingestron <namespace> <resource> <verb> --help
ingestron <namespace> <resource> <verb> --target <configuration> --input request.json --out result.json
```

Help reads locked metadata without executing the plugin. The input file is JSON
inside the project; `--out` creates a new result file and refuses replacement.
With one matching configuration, target selection is automatic. With several,
`--target` is required. Namespace collisions fail rather than shadowing core
commands. Commands currently run bounded offline JSON hooks, not cloud shells.

## Try a local plugin

From an empty directory, generate a synthetic SQL provider with no external
package access:

```sh
ingestron plugin scaffold example-sql --out provider
cd provider
ingestron plugin check --delivery
ingestron build
ingestron check --output build/generated
```

Expect `build/generated/model.sql` containing `CREATE VIEW example_view` and an
`ingestron-project.json` manifest. This starter demonstrates the plugin contract;
it does not connect to a database or claim production platform support. Its own
Node tests are run with `node --test test/provider.test.mjs`.

Use [core's plugin contract](https://github.com/ingestron/core/blob/main/docs/plugins.md)
when authoring a provider. Core owns manifest schemas, compatibility and VM limits.
Delete only your disposable starter directory to clean up.
