import { test } from "node:test";
import assert from "node:assert/strict";
import { browsePlugins } from "../../src/cli/plugin-browser.js";
import { fixture } from "../support/project.js";
test("browser shows installed packages and never offers marketplace installation", async (t) => {
  const f = fixture(t),
    choices = [
      "provider",
      "example/fixture/plugin/provider.yaml@1.0.0",
      "exit",
    ];
  let shown = false;
  await browsePlugins(
    {
      select: async (_message, options) => {
        const next = choices.shift()!;
        assert.ok(
          options.some((o) => o.value === next),
          next,
        );
        assert.equal(
          options.some((o) => o.value === "install"),
          false,
        );
        return next;
      },
      search: async () => "",
      details: (text) => {
        shown = true;
        assert.match(text, /installed/);
      },
    },
    "",
    undefined,
    {},
    f.root,
  );
  assert.equal(shown, true);
  assert.equal(choices.length, 0);
});
test("empty catalogue and cancellation never install", async () => {
  await browsePlugins(
    {
      select: async (message, options) => {
        assert.match(message, /No plugins match/);
        assert.equal(options.length, 3);
        return ":exit";
      },
      search: async () => "",
      details: () => assert.fail(),
    },
    "nothing",
    "connector",
    {},
    "/missing",
  );
  await assert.rejects(
    browsePlugins(
      {
        select: async () => {
          throw new Error("Cancelled");
        },
        search: async () => "",
        details: () => assert.fail(),
      },
      "",
      undefined,
      {},
      "/missing",
    ),
    /Cancelled/,
  );
});
