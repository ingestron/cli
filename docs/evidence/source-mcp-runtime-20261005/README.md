# Installed source-access parity — 2026-10-05

All sixteen frozen synthetic sources return matching capabilities, connection
test results, inventory, selected metadata and bounded scalar samples through
the installed SDK, CLI operation and actual stdio MCP server. The private
candidate uses CLI 0.17.18, core 0.12.43 and locked local provider 0.4.14. Public
dependency pins are unchanged.

Each case verifies six scenario groups and closes four identified MCP processes:
96 groups and 64 closures across the matrix. Read-only, write-only and execute-only
MCP sessions hide and refuse source reads. SDK and CLI require both permissions.
The enabled MCP session annotates execution tools and separately refuses runtime
preparation without network authority. Malformed limits and caller root,
environment or SQL fields are rejected before receipt or output writes.

Source test, one-item inventory requests and explicit metadata selection agree
across the three entry points, apart from their independent receipt identifiers.
Samples retain the selected source and fields, return one row and report
truncation. Row values are compared only in memory and omitted from proof.
New receipts contain metadata and counts without sample rows or synthetic
credentials. All authored YAML and existing generated output remain identical.
This adapter does not build, approve or run ingestion, or test output commits.

The source-owned driver verifies all 156 core and 29 CLI archive files before
qualification. It supplies frozen loopback transports and private runtime
hooks, then removes every hook. The CLI-owned adapter loads product dependencies
from that installed package tree, never from component source checkouts. The
frozen driver and adapter hashes are recorded in [harness.json](harness.json).
The same archive files were verified again after the component gates.

The first four-case attempt failed before loading core: CommonJS resolution
could not resolve its import-only root export. The repaired adapter resolves
the installed package's import export. The original failed proof remains in
[first-attempt.json](first-attempt.json), followed by [focused.json](focused.json)
and the successful full [installed-mcp.json](installed-mcp.json). No production
operation or permission semantics changed.

The CLI passes its complete gate, including 99 tests and installed package
checks. The connector gate passes 5 Node and 287 Python tests. Commands and log
hashes are recorded in [acceptance.json](acceptance.json), along with the
unchanged production file hashes and exact installed SDK client identities.

Files are actual synthetic files. HTTP APIs use loopback fixtures; four database
cases use DB-API stand-ins and SFTP uses an OpenSSH transport stand-in. This does
not qualify live accounts, database engines/drivers, SSH/TLS, native platform
execution, browser/editor interaction or independent engineer acceptance.
The full product acceptance ledger remains incomplete.
