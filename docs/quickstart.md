# Create and review your first contract

In about five minutes, create an Ingestron project, import synthetic metadata and
review a draft contract. You need Node 22 and the CLI installed from the source
archive as described in the [README](../README.md). No plugin, credentials, source
connection or cloud resources are needed.

## Create a disposable project

Run these commands from a directory where you can create a new `retail` folder:

```sh
ingestron init retail --no-input
cd retail
ingestron config show
```

Expect `project.yaml` and environment files for `dev`, `test` and `prod`.
Initialisation protects existing files. Use another empty directory if `retail`
already contains a project.

Preview a source definition, then apply it:

```sh
ingestron --dry-run source add customers --type csv
ingestron source add customers --type csv
ingestron source list
```

The first command lists proposed files without writing them. The second creates
`sources/customers.yaml`. `csv` describes the intended source; it does not read a
CSV file or establish connectivity.

## Import metadata and draft a contract

Save this synthetic input as `metadata.json` inside `retail`:

```json
{
  "table": "customers",
  "columns": [
    {
      "name": "id",
      "logicalType": "integer",
      "physicalType": "BIGINT",
      "required": true
    },
    { "name": "name", "logicalType": "string", "physicalType": "STRING" }
  ]
}
```

```sh
ingestron source import customers --metadata metadata.json
ingestron contract draft customers --source customers
ingestron contract check customers
ingestron contract show customers --verbose
ingestron check --draft
```

Expect `contracts/customers.odcs.yaml`, a provenance sidecar and a valid draft
configuration. Review names, types, keys and business meaning before using the
contract. A valid ODCS schema does not mean those decisions have been approved.
There is no flow or generated pipeline yet; strict builds require a provider.

## Verify protection and recover

Run the same `contract draft` command again: it must reject the existing contract.
Review changes in Git instead of overwriting reviewed work. If metadata is malformed,
correct the indicated field and re-import it. If the source definition changes,
import fresh metadata before drafting from that source again.

Use `--json` for structured diagnostics and `check --setup` for unresolved inputs.
Delete only this disposable `retail` directory when finished; no cloud cleanup is
needed. The [executable example](../examples/quickstart.mjs) checks these steps,
including rejection and output preservation, and then tests a synthetic SQL build.

Next: [build with a local plugin starter](plugins.md#try-a-local-plugin) or read
[build ownership](builds.md) before using a real provider.
