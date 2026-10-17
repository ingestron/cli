# Review a checkpoint runtime upgrade

The private CLI 0.17.18 candidate adds `checkpoint preview` and `checkpoint apply`
for the private core 0.12.40, local provider 0.4.14 and PostgreSQL 1.1.7 workflow.
These commands require a retained previous managed build with its approved review,
and a prepared/reviewed current build that preserves the existing data directory.
Before changing packages or project inputs, retain that build:

```sh
ingestron checkpoint retain --from build/studio/dev/orders_append \
  --to build/checkpoint-baseline/orders_append
```

The new private directory contains the original review and data, with an integrity
receipt. Retention requires local writes and no execution or network access.
Existing destinations, active work and changed inputs are refused. Add
`--profile NAME` for a named original profile. Studio upgrade controls remain
unfinished.

From the project directory:

```sh
ingestron checkpoint preview --flow orders_append \
  --from build/studio/dev/orders_append \
  --previous build/checkpoint-baseline/orders_append
```

Review the retained batch, cursor and digest. Apply the returned digest with the
same flow, current directory, previous directory and optional profile:

```sh
ingestron checkpoint apply --flow orders_append \
  --from build/studio/dev/orders_append \
  --previous build/checkpoint-baseline/orders_append \
  --digest YOUR_REVIEW_DIGEST
```

Replace `YOUR_REVIEW_DIGEST` with preview's exact 64-character digest. If another
batch commits before apply, preview again. A compatible upgrade preserves original
Parquet/commit bytes and continues after the existing cursor. Changes to source
selection, credentials, schema, watermark policy, drivers or dependencies are
rejected. This candidate does not migrate updates, deletes, CDC or archive history.

Both commands use explicit write/execution authority and disable dependency
network access; `--dry-run` disables their writes and execution. Neither accepts
a secrets file. Optional `--run-id` identifies the maintenance operation. Inspect
an uncertain original ID with `run status`, then use `run recover` to acknowledge
it without replaying maintenance. Read-only MCP sessions expose neither
`ingestron_checkpoint_preview` nor `ingestron_checkpoint_apply`.

Installed SDK/CLI/MCP acceptance uses exact private archives and frozen packages
on a copied synthetic PostgreSQL history. It verifies cursor 2 to 4 to 5, retries,
stale review and permission/scope denials. This is not native cloud or browser
qualification, and the published core dependency pin remains unchanged.
