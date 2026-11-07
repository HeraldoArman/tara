import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const commands = [
  ["bun", ["run", "dev"], `${root}/apps/web`],
  [
    "uv",
    [
      "run",
      "uvicorn",
      "tara_server.api.main:app",
      "--reload",
      "--port",
      "8000",
    ],
    `${root}/apps/server`,
  ],
];
if (process.argv.includes("--worker")) {
  commands.push([
    "uv",
    ["run", "python", "-m", "tara_server.agent.worker", "dev"],
    `${root}/apps/server`,
  ]);
}
const children = commands.map(([command, args, cwd]) =>
  spawn(command, args, { cwd, stdio: "inherit" })
);
let stopping = false;
function stop(code) {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of children) {
    child.kill("SIGTERM");
  }
  process.exitCode = code;
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(0));
}
for (const child of children) {
  child.on("error", () => stop(1));
  child.on("exit", (code) => stop(code ?? 1));
}
