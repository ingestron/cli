import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (["generated", "node_modules", ".git"].includes(e.name)) return [];
    const p = resolve(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith(".md") ? [p] : [];
  });
}
const files = [
  "README.md",
  "CHANGELOG.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  ...walk("docs"),
  ...walk("examples"),
];
let links = 0;
for (const file of files) {
  const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = match[1].split("#")[0];
    if (!href || /^[a-z]+:/i.test(href)) continue;
    const target = resolve(dirname(file), decodeURIComponent(href));
    if (!existsSync(target) || !statSync(target).isFile())
      throw new Error(`${file}: broken link ${href}`);
    links++;
  }
}
console.log(`${files.length} Markdown files; ${links} local file links passed`);
