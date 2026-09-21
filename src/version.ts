import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
let root = dirname(fileURLToPath(import.meta.url));
while (
  !existsSync(join(root, "package.json")) ||
  JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name !==
    "ingestron"
) {
  const parent = dirname(root);
  if (parent === root) throw new Error("Cannot locate CLI package");
  root = parent;
}
export const version: string = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
).version;
