# Source testing and discovery — local candidate

CLI 0.17.9 adds source-level commands and delivery-plan commands. This candidate
requires core 0.12.15 for the new operations. The release manifest still pins
published core 0.12.14. A separate local archive installation with a temporary
core override qualifies the candidate; it is not a publishable dependency update.

```sh
ingestron connection access northwind
ingestron connection prepare northwind --allow-write --allow-execute --allow-network
ingestron connection test northwind --allow-write --allow-execute --allow-network
ingestron connection inventory northwind --allow-write --allow-execute --allow-network
```

Run `ingestron connection metadata --help` for explicit table JSON selection,
page limits, cursor and executor flags. `connection contracts` takes a metadata
receipt and explicit table/name selections; it writes independent drafts and does
not bind or publish them. Credentials belong in the registered private environment
file or execution environment, never in command examples or project YAML.
Source testing does not establish ingestion readiness or target access.

```sh
ingestron delivery-plan check --path delivery-plan.yaml --baseline delivery-plan.baseline.yaml
ingestron delivery-plan edit --file delivery-plan.yaml
ingestron delivery-plan baseline --path delivery-plan.yaml
```

Plan editing and baseline commands return review proposals. Applying them uses
the existing explicit authoring/write boundary. A baseline is a reviewed scope,
not completion or acceptance evidence. Changed requirements identify dependent
work; changed scope requires an advanced revision before replacing a baseline.

MCP exposes declaration and plan checks without write/execute permissions.
Source runtime operations require both private writes and execution permission;
contract drafts require write permission. Installed candidate MCP checks cover
these combinations.

## Review a local ingestion flow

After inspecting the isolated contracts, use the current metadata receipt and
source object IDs to preview the flow. This candidate command returns a proposal;
it does not apply it. For example, from a configured project:

```sh
ingestron --project . --environment dev --json connection flow-review northwind \
  --flow northwind_bronze --receipt <metadata-receipt-uuid> \
  --provider local_prepare \
  --tables '[{"id":"<source-object-id>","table":"Orders","contract":"contracts/discovery/dev/northwind/<draft-uuid>/Orders.odcs.yaml"}]'
```

If the local provider has not been configured, add `--runtime <installed-reference>`.
Its default configuration is included in the proposal. Source mappings come from
the metadata receipt. Inspect the proposed files before invoking the existing
`apply` operation with write authority. Edited drafts invalidate the proposal.
This command requires the unpublished CLI 0.17.9/core 0.12.15 combination described
above; it is unavailable in CLI 0.17.8.

## Prepare native delivery with optional local testing

To use a configured native target, supply `--target` with `provider`, `source`
and `ingestion` JSON. Omit `--provider` and `--runtime` when you do not want an
Ingestron execution binding. The proposal then contains one native flow with no
local execution profile. Source metadata access uses the separately installed
connector adapter; it does not require a local delivery configuration.

The target standard must be declared by the installed provider and support the
selected source kind. Target settings cannot replace shared table or schema
identities. Inspect the proposed files, apply them, then generate the target
bundle with `build --flow <flow-id>`. Generation does not read records or deploy.

To test the same contracts locally, explicitly add `--provider <local-name>`.
Add `--runtime <installed-reference>` only when its local configuration is needed.
A flow with both target and local execution gets `executionProfiles.local_test`;
generate its local assets with `build --flow <flow-id> --profile local_test`.
A local-only flow uses its default binding, with no duplicate test profile.

In Studio, choose **Prepare local test** after agreeing to use the Ingestron
runtime. Studio validates, builds, prepares locked dependencies, discovers
metadata and reviews the saved contracts. Inspect the resulting selection, then
choose **Approve & run locally** to read records. **Run locally again** reuses an
unchanged approved scope. Edits require fresh preparation and review.

Local results show written row counts and measured quality checks. Blocking
library quality rules stop the output commit. Failed-run evidence keeps rule
identities and measured counts; it contains no row samples. Earlier committed
outputs remain available. A local pass does not verify native networking,
deployment or execution; complete those steps with the target platform's tooling.

## Source samples — private candidate

`ingestron connection sample <connection> --source '{"schema":"sales","table":"Orders"}'
--limit 20 --columns '["id","amount"]'` reads one explicitly selected object using
the installed connector and source-access executor. Supply `--executor` when
selection is ambiguous and a project-relative `--secrets-file` for secret bindings. Metadata
discovery and sampling are separate actions. Sample rows go to the requested
response, while receipts retain counts only.

The structured operation is `connection_sample`. MCP exposes it only with both
write and execute opt-ins. Older installed core or connector versions do not gain
sampling automatically. This candidate is checked against a temporary core archive
override; public dependency pins remain unchanged.

Run `node scripts/source-sample-acceptance.mjs --cli <installed-cli.js> --connectors
<connector-repository> --provider <local-provider-repository> --python <python3.12>`
for synthetic installed command/operation/MCP parity. Optional `--cache` seeds a
previously prepared hash-verified dependency cache; omit it for clean preparation.
The harness writes its own uniquely named temporary project and acceptance report.

Database acceptance can supply `--connector postgresql` (or `mysql`, `oracle`,
`sql-server`) and a synthetic `--fixture` JSON file. The harness rejects a database
host outside `127.0.0.1`. Its fixture keeps settings and secret references separate.
The connector repository owns the disposable database runner.

### Installed SDK, CLI and MCP matrix

`scripts/runtime-matrix-mcp-acceptance.mjs` is the CLI-owned client adapter for
the connector repository's frozen sixteen-source acceptance matrix. It loads
the SDK and MCP client from the actual installed CLI dependency tree, then starts
that CLI's stdio server. It compares locked capabilities, connection testing,
inventory, selected metadata and bounded samples across all three entry points.

Read-only, write-only and execute-only MCP sessions must hide and refuse source
reads. An enabled session still requires separate network authority for runtime
preparation. Requests cannot change the session's project or environment, add SQL,
or exceed sample limits. Receipts retain metadata and row counts; business rows
remain in the immediate sample response. The adapter verifies that authored
definitions and existing output remain unchanged and closes its own servers.

Run it through the source-owned fixture driver, which supplies only synthetic
transports and existing private runtime caches:

```sh
python3 ../connectors/scripts/runtime-matrix-acceptance.py <frozen-acceptance.json> \
  --phase client --client-script scripts/runtime-matrix-mcp-acceptance.mjs
```

Use Node 22 and the fixture's Python 3.12 on `PATH`. Qualify frozen copies of the
driver and adapter; changing either during a run invalidates the evidence.
This matrix does not qualify live vendor accounts, database engines, SSH/TLS,
browser interaction or native platform execution. Public dependency pins remain
unchanged. The current private sixteen-source qualification is recorded in
[installed source-access parity evidence](evidence/source-mcp-runtime-20261005/README.md).

### Source-declared metadata options (private candidate)

The private core 0.12.15 / CLI 0.17.9 candidate exposes the locked connector's
`metadataOptionsSchema` in `connection access`. `connection metadata` and
`connection drafts` accept `--options <json>`; the same operation argument is
available through MCP when execution and private writes are permitted. Core
validates options against the installed source schema before writing a receipt
or launching the source. Draft selections apply the same options to every batch.

Files 1.5.4 can explicitly suggest JSON/JSONL schemas with
`--options '{"sampleRecords":true,"limit":20}'`. This reads business records:
the result includes each file's sampled record count, limit, byte bound and
truncation. The suggested fields remain optional, with no inferred keys;
ambiguous types are skipped with a reason. No record values are saved in metadata
receipts or draft definitions. Without options, JSON metadata still requires an
authored contract or explicit sampling. Review types and skipped fields; a prefix
sample does not validate the complete file. CSV/TSV headers and Parquet footers
retain their record-free path. Public dependency pins remain unchanged, so this
candidate behaviour requires the separately verified private installed pair.
