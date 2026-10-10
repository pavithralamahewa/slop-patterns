import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const result = spawnSync(
  "npx",
  ["--yes", "tsx", "scripts/verify-core.ts"],
  { cwd: root, encoding: "utf8" },
);

if (result.status !== 0) {
  console.error(result.stdout);
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}
console.log(result.stdout.trim());
