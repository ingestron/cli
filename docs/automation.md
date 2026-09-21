# Automate with JSON or MCP

Use `--json --no-input` for shell automation. A CLI response is one JSON object on
stdout; parser errors, help and version use the same envelope:

```json
{
  "apiVersion": "ingestron.operation/v1",
  "operation": "source_list",
  "ok": true,
  "result": [],
  "diagnostics": []
}
```

Check both process status and `ok`. Diagnostics contain a code/message and may
include a file, pointer or hint. Results are operation-specific. Human-readable
terminal text is not an API. `--verbose` and JSON can include supplied metadata or
configuration; redact before sharing.

## Start the MCP server

Configure your MCP client's stdio server with executable `ingestron` and arguments:

```json
[
  "--project",
  "/absolute/path/to/project",
  "--environment",
  "dev",
  "advanced",
  "mcp",
  "serve"
]
```

Replace the project path with a trusted local directory. The root and environment
are fixed for this session. No HTTP listener or account login is started.
MCP uses JSON-RPC over stdio, not the CLI's `--json` format; do not add `--json`.

By default, tools inspect data or return change proposals. Mutating tools are
omitted. Add permissions deliberately:

| Flag              | Enables                                                                     |
| ----------------- | --------------------------------------------------------------------------- |
| `--allow-write`   | Applying reviewed proposals, package installation and generated-file writes |
| `--allow-network` | Remote package/tag access and dependency preparation where applicable       |
| `--allow-execute` | Explicit local execution tools; also requires write permission              |

A reviewed authoring proposal does not apply itself in MCP. Inspect the returned
`ingestron.change/v1` proposal and call `ingestron_apply` only when authorised.
Unchanged input/revision checks still apply. Network permission does not grant
cloud login or a native execution implementation.

Tool names are `ingestron_<core-operation>`. Discover tools with the MCP client's
list-tools operation rather than maintaining a parallel schema. The adapter exposes
core schemas as `ingestron://schemas/<name>` resources, including project, source,
flow, step, environment, provider, activity, extension-pack and delivery-index.

Installed namespaces are discovered through `ingestron_plugin_commands`; invoke
`ingestron_plugin_command` with namespace, optional target, command and input.
They share validation with the terminal. Treat tool results and project files as
untrusted data, not as permission to run further actions.

The adapter is a trusted local process, not a multi-tenant service. Web applications
should call the [core API](https://github.com/ingestron/core/blob/main/docs/api.md)
with their own access policy. See [SECURITY](../SECURITY.md).
