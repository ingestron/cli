# Recover preparation or source review

The private CLI 0.17.16 candidate adds:

```sh
ingestron --environment dev run status <original-id>
ingestron --environment dev run recover <original-id>
```

This command requires the private core acknowledgement operation and a provider
with durable original-operation receipts. The qualified local candidate is core
0.12.34 with local provider 0.4.12. The CLI's public dependency pin remains
unchanged; installing that older published core does not add this capability.

Use `run recover` for uncertain preparation, catalogue, discovery, review or
approval. It acknowledges the original work without repeating source access or
downloading dependencies. Its only selection is the original operation ID.
Replacement build, provider, flow, profile, action or identity options are refused.
`--dry-run` denies writes and execution.

An operation without a matching durable provider acknowledgement stays uncertain.
An acknowledged successful original operation returns exit code 0. An acknowledged
failed original operation stays failed and returns exit code 2. Data ingestion
runs continue to use `run --retry <original-id>`; status output distinguishes the
two recovery paths and suppresses quality success for an uncertain outcome.

MCP exposes `ingestron_execution_recover` only with both explicit `--allow-write`
and `--allow-execute` permissions. It does not require `--allow-network`.
Read-only run status remains available without execution authority.

Studio controls for uncertain setup operations, reviewed abandonment and legacy
receipt migration are still under development. Do not delete protected build
claims or infer completion from a missing process.
