import test from "node:test";
import assert from "node:assert/strict";
import { terminal } from "../../src/cli/output.js";
const result = (operation: string, value: any) =>
  ({ ok: true, operation, result: value, diagnostics: [] }) as any;
test("official package summaries stay short without relabelling third-party packages", () => {
  const value = {
    packages: {
      "ingestron/connectors/connectors/github/connector.yaml@1.33.0": {},
      "ingestron/provider-local/plugin/provider.yaml@0.4.1": {},
      "other/connectors/custom.yaml@1.0.0": {},
    },
  };
  const text = terminal(result("packages_list", value));
  assert.match(text, /github@1.33.0/);
  assert.match(text, /local@0.4.1/);
  assert.match(text, /other\/connectors/);
  assert.doesNotMatch(text, /connectors\/github\/connector/);
  assert.match(
    terminal(result("packages_list", value), true),
    /connectors\/github\/connector/,
  );
});
test("installation keeps information path in verbose output", () => {
  const value = {
    reference: "ingestron/provider-local/plugin/provider.yaml@0.4.1",
    informationFile: ".ingestron/plugin-info/hash.json",
  };
  assert.match(terminal(result("packages_install", value)), /local@0.4.1/);
  assert.doesNotMatch(terminal(result("packages_install", value)), /hash.json/);
  assert.match(terminal(result("packages_install", value), true), /hash.json/);
});
test("runtime preparation shows Python version and reuse without leaking paths", () => {
  const value = {
    id: "run",
    status: "succeeded",
    flows: ["issues"],
    result: {
      flows: [
        {
          flow: "issues",
          pythonVersion: "3.12.10",
          reused: true,
          python: "/private/path",
        },
      ],
    },
  };
  assert.match(
    terminal(result("runtime_prepare", value)),
    /Python 3.12.10 \(reused\)/,
  );
  assert.doesNotMatch(terminal(result("runtime_prepare", value)), /private/);
});
test("configuration summary names resources without values", () => {
  const value = {
    project: {
      id: "demo",
      providers: { configurations: { local: { token: "secret-value" } } },
      connections: { github: { token: "secret-value" } },
    },
    flows: [],
    pending: [],
  };
  const text = terminal(result("resolve", value));
  assert.match(text, /Providers: local/);
  assert.match(text, /Connections: github/);
  assert.match(text, /source list/);
  assert.doesNotMatch(text, /secret-value/);
});
test("check lists data product owners and unenforced quality rules", () => {
  const value = {
    mode: "strict",
    evidence: "offline",
    dataProducts: [
      {
        contract: "orders",
        status: "active",
        owners: ["ana@example.com"],
        qualityRules: 2,
        enforcedQualityRules: 0,
      },
      { contract: "customers", status: "draft", owners: [], qualityRules: 0 },
    ],
  };
  const text = terminal(result("validate", value));
  assert.match(text, /Project checks passed/);
  assert.match(text, /orders {2}active {2}owner ana@example\.com/);
  assert.match(text, /customers {2}draft {2}no owner/);
  assert.match(
    text,
    /2 quality rule\(s\) are recorded in contracts but not yet enforced/,
  );
  assert.doesNotMatch(
    terminal(result("validate", { mode: "strict", evidence: "offline" })),
    /Data products/,
  );
});

test("check summarises quality rule coverage by enforcement mode", () => {
  const text = terminal(
    result("validate", {
      mode: "strict",
      evidence: "offline",
      dataProducts: [
        {
          contract: "orders",
          status: "active",
          owners: ["ana"],
          qualityRules: 2,
        },
      ],
      quality: {
        summary: {
          rules: 4,
          atLoad: 1,
          afterLoad: 1,
          unsupported: 2,
          documentation: 0,
        },
        rules: [],
      },
    }),
  );
  assert.match(
    text,
    /Quality rules: 4 \(1 at load, 1 after load, 2 not enforced by the target\)\./,
  );
  assert.doesNotMatch(text, /recorded in contracts but not yet enforced/);
});
test("run summaries report pre-commit quality results by rule and count", () => {
  const value = {
    id: "r1",
    status: "succeeded",
    action: "run",
    configuration: "local",
    flows: ["retail"],
    result: {
      flows: [
        {
          flow: "retail",
          quality: [
            { id: "orders.key-unique", passed: true, value: 0 },
            { id: "amount-present", passed: false, value: 3 },
          ],
        },
      ],
    },
  };
  assert.match(
    terminal(result("run", value)),
    /Quality rules: 2 checked before commit; 1 warning\(s\): amount-present\./,
  );
  value.result.flows[0].quality[1].passed = true;
  assert.match(terminal(result("run_status", value)), /all passed/);
  delete (value.result.flows[0] as any).quality;
  assert.doesNotMatch(terminal(result("run", value)), /Quality/);
});
test("check summarises source routes with maturity and cost", () => {
  const reference = (
    maturity: string,
    cost: string,
    verified = "2026-09-30",
  ) => ({
    maturity,
    cost: { model: cost },
    verified,
  });
  const value = {
    mode: "strict",
    sources: [
      {
        flow: "sales",
        connection: "erp",
        kind: "sql-server",
        selected: {
          route: "portable",
          configuration: "local",
          package: "sql-server@1.4.0",
          reference: reference("preview", "none"),
        },
        alternative: {
          route: "native",
          configuration: "adf",
          standards: ["snapshot-land@v1"],
          reference: reference("preview", "included", "2020-01-01"),
        },
      },
      {
        flow: "issues",
        connection: "gh",
        kind: "github",
        selected: {
          route: "portable",
          configuration: "local",
          package: "github@1.33.1",
        },
      },
    ],
  };
  const text = terminal(result("validate", value));
  assert.match(
    text,
    /sales: erp \(sql-server\) portable sql-server@1\.4\.0 on local \[preview, no extra cost\]/,
  );
  assert.match(
    text,
    /Also available: native on adf via snapshot-land@v1 \[preview, included in platform pricing, record checked 2020-01-01\]/,
  );
  assert.match(
    text,
    /issues: gh \(github\) portable github@1\.33\.1 on local \[no reference record\]/,
  );
});

test("check shows a bridge as one route from the landing to the ingesting provider", () => {
  const text = terminal(
    result("validate", {
      mode: "strict",
      evidence: "offline",
      nodes: 6,
      digest: "x",
      dataProducts: [],
      quality: { summary: { total: 0 }, rules: [] },
      sources: [
        {
          flow: "sales",
          connection: "erp",
          kind: "sql-server",
          selected: {
            route: "bridge",
            via: "landing",
            configuration: "processing",
            standards: [
              "snapshot-land@v1",
              "snapshot-publication@v1",
              "snapshot-with-history@v1",
            ],
            reference: {
              maturity: "preview",
              cost: { model: "included" },
              verified: new Date().toISOString().slice(0, 10),
            },
          },
        },
      ],
    }),
  );
  assert.match(
    text,
    /sales: erp \(sql-server\) bridge: lands on landing, ingests on processing via snapshot-land@v1 → snapshot-publication@v1 → snapshot-with-history@v1 \[preview, included in platform pricing\]/,
  );
});

test("discover lists drafts, skipped fields and provider assets", () => {
  const drafts = terminal(
    result("discover", {
      flow: "sales",
      route: "portable",
      tables: [
        {
          table: "customers",
          file: "contracts/sales/customers.odcs.yaml",
          fields: 3,
          keys: ["id"],
          skipped: [
            { name: "payload", reason: "unsupported source type jsonb" },
          ],
        },
      ],
      next: "Review each draft.",
    }),
  );
  assert.match(
    drafts,
    /customers: 3 fields → contracts\/sales\/customers\.odcs\.yaml \(source keys: id\)/,
  );
  assert.match(drafts, /skipped payload: unsupported source type jsonb/);
  const provider = terminal(
    result("discover", {
      flow: "sales",
      route: "bridge metadata on landing",
      tables: [],
      files: ["build/discovery/sales/template.json"],
      review: ["Grant the factory metadata-output permissions"],
      next: "Deploy template.json, then run ingestron discover --flow sales --from <file>.",
    }),
  );
  assert.match(provider, /wrote build\/discovery\/sales\/template\.json/);
  assert.match(provider, /review: Grant the factory/);
});
