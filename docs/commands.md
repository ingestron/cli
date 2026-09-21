# Command reference

`ingestron --help` lists the implemented public groups. Use `--help` after any
command for its exact arguments and defaults. Plugin namespaces appear only when
the project contains their configured, locked packages.

## Project commands

| Group                | Commands                                                     | Purpose                                                                                         |
| -------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `init [directory]`   | `--id`, `--provider`, `--environments`                       | Create project/environment files; optional provider must already be installed                   |
| `source`             | `add`, `list`, `show`, `configure`, `prepare`, `import`      | Define sources, export supported readers, import supplied metadata                              |
| `contract`           | `draft`, `list`, `show`, `check`                             | Draft ODCS from `--source` or `--metadata`; `check --native` also checks flat-table eligibility |
| `flow`               | `add`, `list`, `show`, `configure`, `connect`, `export`      | Author provider flows and explicit dataset handovers/export groups                              |
| `flow table`         | `add`, `configure`, `list`                                   | Manage ingestion tables within flows                                                            |
| `flow step`          | `add`                                                        | Add a transformation activity and its input settings                                            |
| `flow output`        | `add`, `list`                                                | Declare or inspect published datasets                                                           |
| `flow standard`      | `list`, `show`                                               | Inspect standards declared by installed providers                                               |
| `config`             | `show`, `set`, `explain`, `fill`                             | Inspect/edit non-secret values; `fill` requires an interactive terminal                         |
| `config environment` | `list`, `add --from`                                         | Inspect profiles or copy one for review                                                         |
| `check`              | `--draft`, `--setup`, `--output`, or strict default          | Check incomplete configuration, local setup, generated output or build readiness                |
| `build`              | `--provider`, `--flow`, `--delivery`, `--out`, `--ownership` | Generate local assets through the installed provider                                            |
| `connections`        | `validate`, `prepare`, `contracts`                           | Validate/prepare project-defined connector flows; no source connection                          |

Source execution contexts are `manual` or `local`; `source prepare` exports a reader,
it does not run one. Contracts remain drafts for human review. A build creates no
cloud resources. See [quickstart](quickstart.md) and [builds](builds.md).

`init` defaults to `dev,test,prod`. An explicit `--environments` list takes priority;
otherwise `--environment`, `--env` or `-e` selects one initial environment. An
installed provider repository can be selected without a version only when exactly
one matching version is installed; specify its exact reference if ambiguous.

## Plugins and local execution

| Group             | Commands                                                                          | Purpose                                                                             |
| ----------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `plugin`          | `list`, `browse`, `info`, `versions`                                              | Inspect installed packages or explicitly query repository tags                      |
| `plugin`          | `install`, `update`, `configure`, `migrate`, `pack-add`                           | Lock exact references and review project registration/selection                     |
| `plugin`          | `scaffold`, `check`, `show`                                                       | Create a synthetic starter, check provider determinism, inspect configured commands |
| `runtime`         | `prepare`                                                                         | Explicitly prepare/download dependencies for a compatible local provider            |
| `run`             | `--action`, `--from`, `--provider`, `--flow`, `--run-id`, `--retry`, `--env-file` | Execute selected local work; default action is `run`                                |
| `run status <id>` |                                                                                   | Inspect the durable local receipt                                                   |

Provider package identity and project configuration name are different. See
[plugins](plugins.md) for explicit references and `ingestron <namespace> …` commands.
`run` requires a provider declaring a compatible execution transport. Current core
supports local Python on POSIX; cloud execution and deployment are unavailable.
Runtime dependency preparation uses the network. Generated workloads run under
the current OS user and can access resources allowed by that identity.

## Advanced commands

| Command                                             | Purpose                                                      |
| --------------------------------------------------- | ------------------------------------------------------------ |
| `advanced plan [--out <file>]`                      | Inspect/save a local compiler plan                           |
| `advanced diff --plan <file>`                       | Compare a saved plan to current inputs                       |
| `advanced generate --plan <file> --out <directory>` | Generate from an unchanged saved plan                        |
| `advanced schema <name>`                            | Inspect a shared core JSON schema                            |
| `advanced provider <configuration> <command...>`    | Invoke a declared offline command directly                   |
| `advanced export --result <file> --out <directory>` | Export files returned by an offline provider command         |
| `advanced activity list` / `check <file>`           | Inspect installed activity metadata                          |
| `advanced mcp serve`                                | Start the stdio MCP adapter; see [automation](automation.md) |

Earlier implemented root spellings remain hidden compatibility routes: `providers`,
`packages`, `table`, `step`, `dataset`, `environments`, `validate`, `doctor`,
`resolve`, `plan`, `diff`, `generate`, `validate-output`, `schema`, `activity`,
`activities`, `standards`, `provider` and `mcp`. New scripts should use the groups
above. `contract draft --id` and the old flat-native `contract validate` also remain
accepted. Unsupported commands such as `deploy` and `source discover` are not
registered; they fail as unknown commands.

## Global options and errors

`--project <directory>` defaults to `.`; `--environment <name>` defaults to `dev`
and has aliases `--env` and `-e`. `--json` emits one versioned JSON object and
suppresses prompts. `--verbose` includes complete result details. `--no-input`
disables prompts; `--plain` disables both decoration and prompts. `--no-color` /
`NO_COLOR` disable rich decoration; `--no-progress` disables animation. Redirected
output and CI receive plain output. See [automation](automation.md) for the envelope.

`--dry-run` is supported for local authoring, including init, source changes,
contract drafting, flow/table/step/output changes, configuration, plugin scaffold,
pack attachment/migration and exporting provider results. It is rejected before
package installation, builds or execution. Previewing init may create the empty
root directory; project files are not written.

Do not combine `check --draft`, `--setup` and `--output`. Flow/table/step selection
is supported for strict project checks; table/step require a flow. Draft checks
apply to the whole project.

| Exit | Meaning                                            |
| ---- | -------------------------------------------------- |
| 0    | Success, including help/version                    |
| 2    | Validation or operation failure                    |
| 3    | Invalid command, input, option, binding or package |
| 4    | Requested provider capability is not implemented   |
| 5    | Ownership conflict or stale proposal/input         |
| 130  | Interactive cancellation                           |

Inspect the diagnostic code and message rather than relying on exit status alone.
CLI version `0.12.0` is separate from the legacy provider compatibility field
`minimumCli: 4.2.0`; core documents that manifest ABI.
