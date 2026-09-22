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
