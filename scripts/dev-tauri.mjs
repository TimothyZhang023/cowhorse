import { spawn } from "node:child_process";
import process from "node:process";

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function main() {
  const env = {
    ...process.env,
    WORKHORSE_NODE_BIN: process.execPath,
  };

  await run(npmCommand, ["run", "stop"], { env });
  await run(process.execPath, ["scripts/ensure-sidecar-runtime.mjs"], { env });
  await run(npmCommand, ["run", "tauri", "--", "dev"], { env });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
