import { rmSync } from "node:fs";
rmSync(new URL("../build/cli", import.meta.url), {
  recursive: true,
  force: true,
});
