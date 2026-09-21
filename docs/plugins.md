# Install and inspect plugins

Plugins supply platform generators, connector definitions, standards and other
versioned capabilities. The CLI hosts their commands through core; it contains no
bundled marketplace or platform implementation.

## Choose an exact package

Use a compatible GitHub repository you can access. The following is a placeholder,
not an Ingestron-hosted package:

```text
ingestron plugin versions owner/repository
ingestron plugin install owner/repository@1.2.3
```

`plugin/provider.yaml` is the default manifest. Other packages use an explicit
path such as `owner/repository/packs/model.yaml@1.2.3`. A 40-character Git commit is
also accepted. `@latest` and product aliases such as `adf@1.2.3` are not resolved.
For independently tagged components, provide `--tag-prefix <prefix>` to both
version lookup and initial installation. Git tag listing is not compatibility proof.

Interactive `plugin install` asks for a repository and an exact version.
Automation must supply the exact reference and should use `--no-input`. Private
Git repositories require your existing authorised GitHub credentials; public
repositories do not require private core access.

Installation writes `.ingestron/packages/` and `packages.lock.yaml`. Commit the lock.
`--cache-only` skips project registration; `--frozen` restores an existing lock
without changing its selected commit. `--from-git <directory>` uses a local Git
repository for development. Installation never runs a package's install hooks.

## Configure and inspect

```sh
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

Use `plugin configure <reference> --name <configuration>` to register a cached
provider. Multiple configurations can use the same package. `plugin migrate
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
