# Security

Report suspected vulnerabilities privately through
[GitHub vulnerability reporting](https://github.com/ingestron/cli/security/advisories/new).
Include a synthetic reproduction and affected versions; exclude credentials,
customer data and production logs.

The CLI operates with the invoking user's filesystem permissions. Choose a trusted
project root. `--dry-run` previews supported authoring commands; it is rejected for
builds, package installation and execution. Ordinary authoring applies the proposed
local changes. An invalid or edited managed output is protected from replacement.

Planning, building and plugin commands delegate to core's bounded offline compiler.
Package installation and tag lookup are explicit Git/network operations and may
use the operator's existing GitHub credentials. A lock records exact commits and
file hashes; those hashes detect changes, not publisher authenticity.

`runtime prepare` may download dependencies. `run` executes a provider's reviewed
local Python package as the current OS user. This is a trusted process boundary,
not the QuickJS compiler sandbox. Only declared secret environment names are passed
to the runner. Keep `.env` files untracked; do not place secrets in project values,
SQL, contracts or plugin inputs. Inspect provider code before granting execution.

MCP fixes its root/environment at startup. Write, network and execution permissions
are separate opt-ins; execution also needs write permission. The stdio server has
no multi-user authentication or tenant isolation. Treat files and plugin output as
untrusted data, not instructions. `--json` and `--verbose` may contain supplied
configuration or metadata; review results before sharing them.

See [core's security boundary](https://github.com/ingestron/core/blob/main/SECURITY.md)
for VM, YAML, path and generated-file controls. No telemetry or cloud SDK is bundled
in this CLI, and offline checks are not proof of native platform acceptance.
