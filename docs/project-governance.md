# Project governance

The candidate governance workflow uses the shared core operation API. Release it
with the matching core version after installed acceptance; the current published
core pin remains unchanged during private candidate work.

`ingestron governance check` reports contract ownership, required quality rule
inventory and project delivery gaps without source access. Use `--flow orders` to
scope contract checks. Delivery definitions remain project-wide.

`ingestron governance policy --file reviewed-policy.yaml --dry-run` previews a
saved project policy. Apply through the normal reviewed CLI change workflow with
local-write permission. Policy edits preserve the existing inline or referenced
location. Changed inputs invalidate the preview.

The thin MCP adapter advertises `ingestron_governance_check` and
`ingestron_policy_propose` from installed core schemas. Both return read-only
results or previews. Applying requires the separate write-enabled `ingestron_apply`
tool. Policy and delivery-plan schemas are available as MCP resources.

A successful policy check concerns current definitions and the local planning
baseline. It does not establish an authenticated approval, runtime quality result
or cloud deployment. Actual quality coverage and execution remain separate.
