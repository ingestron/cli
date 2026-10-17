# Inspect locked templates

The private CLI0.17.21/core0.12.48 acceptance pair supports:

```sh
ingestron --project ./project --json --no-input plugin templates <reference> <activity>
```

Use an exact installed provider reference and one of its exported activity IDs.
The command returns declared template text, output names and formats, optional
declared generator source, and verified source digests. It reads the package
cache without downloading packages or running generator code.

The same operation is available as the read-only MCP tool
`ingestron_provider_activity_inspect`. A read-only MCP session cannot apply a
version change. Installation and application require their existing explicit
permissions.

This is a private candidate feature. The public core dependency pin remains
0.12.14; a configured core lacking the inspection operation refuses the request.
Template inspection does not qualify generated output or platform execution.
