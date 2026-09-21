# Executable quickstart

After `pnpm install --frozen-lockfile` and `pnpm build`, run:

```sh
pnpm examples:check
```

[quickstart.mjs](quickstart.mjs) creates a disposable project, imports synthetic
metadata, drafts/checks a contract and verifies dry-run/overwrite protection. It
also scaffolds and builds a synthetic SQL provider. It deletes its temporary files
on completion or failure. No private plugin, cloud account or source data is used.

The package gate runs this same example against the installed archive. Follow the
[manual tutorial](../docs/quickstart.md) to keep a project for inspection.
