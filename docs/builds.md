# Build and maintain generated assets

Start with a project containing a compatible provider, reviewed contracts and
configured flows. Provider documentation defines its standards, bindings and
source assumptions. The CLI does not infer consistency, business keys or recovery
policy from column metadata.

```sh
ingestron check --setup
ingestron check
ingestron build
ingestron check --output build/generated
```

`check --setup` diagnoses local missing values, not connectivity. Strict `check`
plans the project. `build` writes generated assets and ownership manifests under
`build/generated` by default. Output checking verifies local integrity and syntax;
it does not call a target platform's validator.

## Scope and ownership

Use `--out <directory>` to select another project-relative output. `--provider`
selects a configuration and its required dependencies; `--flow` selects a flow.
Core rejects subsets that cannot preserve complete declared handovers. `--delivery`
checks/builds coordinated exports when the participating providers support them.
The generated project manifest records package boundaries and dependencies.

`--ownership managed` is the default. Ingestron can regenerate intact managed
output; if you edit a generated file, it refuses to silently replace it. Keep
custom source in the authored project, or use `--ownership team` in a new output
directory to hand native source to a team for manual maintenance. Do not assume
manual edits will be merged on a later generation.

Commit authored inputs, exact package locks and reviewed output to Git as your
workflow requires. Leave `.ingestron/` caches and local secret files untracked.
Each output needs one writer. A completed build means files were generated, not
that a pipeline ran or records were processed.

## Review a saved plan

```sh
ingestron advanced plan --out build/plan.json
ingestron advanced diff --plan build/plan.json
ingestron advanced generate --plan build/plan.json --out build/review
```

These are compiler plans. Changes to inputs, core or locked plugins require a fresh
plan; stale plans fail. There is no remote deployment drift lookup.

## Common failures

| Symptom                       | Next step                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| Missing provider/package      | Install the exact reviewed reference; use `--frozen` to restore an existing lock                   |
| Unresolved environment input  | Inspect `check --setup` and set the documented non-secret binding/value                            |
| Invalid contract/type         | Run `contract check <id>`; use `--native` to test flat-table eligibility                           |
| Stale plan or source snapshot | Re-import changed source metadata or create a fresh build plan after review                        |
| Edited generated output       | Preserve the edits in Git, compare with a new output directory, then choose ownership deliberately |
| Unsupported handover/subset   | Build the complete export group or revise the provider-declared dependency                         |

Use the [synthetic plugin example](plugins.md#try-a-local-plugin) to verify basic
build behaviour without any private provider or target platform.
