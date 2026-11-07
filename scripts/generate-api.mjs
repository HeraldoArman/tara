import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const commands = [
  [
    "uv",
    ["run", "--project", "apps/server", "python", "scripts/export_openapi.py"],
  ],
  [
    "bunx",
    [
      "openapi-typescript",
      "apps/web/openapi.json",
      "-o",
      "apps/web/src/lib/generated/api.d.ts",
    ],
  ],
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
