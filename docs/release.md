# Release the CLI

Use Node 22.12 or newer and pnpm 10.15.0. The package is `ingestron`; original code is
Apache-2.0, licensed by Otrera Limited. The core dependency must be an exact public
npm version, with matching registry integrity in `pnpm-lock.yaml`.

1. Install with `pnpm install --frozen-lockfile`.
2. After dependency changes, run `pnpm licences:inventory` and review the upstream notices.
3. Run `pnpm validate` and `pnpm audit --prod`. Review any findings before release.
4. Inspect `build/release/ingestron-<version>.tgz`, produced by the package check.
   It contains only compiled adapters, package metadata and top-level documentation/notices.
5. From the reviewed commit, check `npm whoami`, then publish that exact archive
   with `npm publish build/release/ingestron-<version>.tgz --access public`.
   Complete npm authentication interactively when required.
6. Verify the published version/integrity and anonymously install it in an empty
   directory. Run the installed help, quickstart and MCP checks. Record the commit
   and package integrity in your release record.

Never overwrite a published version. Check the registry after an uncertain publish
attempt before retrying. GitHub source publication is separate from npm publication.
CI builds and validates pull requests; it does not automatically publish packages.
Platform plugins have their own releases and acceptance checks.
