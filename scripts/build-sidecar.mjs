import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const runtimeDir = path.join(repoRoot, "src-tauri", "sidecar-runtime");
const runtimeNodeSource = path.join(repoRoot, "src-tauri", "sidecar-node", "node");
const serverEntrySource = path.join(repoRoot, "server.js");
const serverSourceDir = path.join(repoRoot, "server");

const runtimeDependencyNames = [
  "@modelcontextprotocol/sdk",
  "better-sqlite3",
  "cookie-parser",
  "cors",
  "cron-parser",
  "dotenv",
  "express",
  "express-rate-limit",
  "http-proxy-middleware",
  "jsonwebtoken",
  "node-cron",
  "openai",
  "pino",
  "pino-http",
  "pino-pretty",
  "pptxgenjs",
];

function resolveExistingPath(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function runCommand(command, args, options = {}) {
  await new Promise((resolve, reject) => {
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
      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function copyDirectory(sourceDir, targetDir) {
  await fsp.mkdir(targetDir, { recursive: true });
  const entries = await fsp.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    await fsp.copyFile(sourcePath, targetPath);
  }
}

async function main() {
  if (!fs.existsSync(runtimeNodeSource)) {
    throw new Error(`Missing packaged Node runtime: ${runtimeNodeSource}`);
  }

  const npmRootOutput = [];
  await new Promise((resolve, reject) => {
    const child = spawn("npm", ["root", "-g"], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "inherit"],
    });

    child.stdout.on("data", (chunk) => {
      npmRootOutput.push(String(chunk));
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`npm root -g exited with code ${code}`));
    });
  });

  const npmGlobalRoot = npmRootOutput.join("").trim();
  const npmCliPath = resolveExistingPath([
    path.join(npmGlobalRoot, "npm", "bin", "npm-cli.js"),
    "/usr/local/lib/node_modules/npm/bin/npm-cli.js",
    "/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js",
  ]);
  const nodeGypPath = resolveExistingPath([
    path.join(npmGlobalRoot, "npm", "node_modules", "node-gyp", "bin", "node-gyp.js"),
    "/usr/local/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js",
    "/opt/homebrew/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js",
  ]);

  if (!npmCliPath) {
    throw new Error("Unable to locate npm-cli.js for sidecar runtime build");
  }

  if (!nodeGypPath) {
    throw new Error("Unable to locate node-gyp.js for sidecar runtime build");
  }

  const rootPackagePath = path.join(repoRoot, "package.json");
  const rootPackage = JSON.parse(await fsp.readFile(rootPackagePath, "utf8"));
  const runtimeDependencies = {};

  for (const dependencyName of runtimeDependencyNames) {
    const version = rootPackage.dependencies?.[dependencyName];
    if (!version) {
      throw new Error(`Missing runtime dependency version for ${dependencyName}`);
    }
    runtimeDependencies[dependencyName] = version;
  }

  await fsp.rm(runtimeDir, { recursive: true, force: true });
  await fsp.mkdir(runtimeDir, { recursive: true });

  await fsp.copyFile(runtimeNodeSource, path.join(runtimeDir, "node"));
  await fsp.copyFile(serverEntrySource, path.join(runtimeDir, "server.js"));
  await copyDirectory(serverSourceDir, path.join(runtimeDir, "server"));

  const runtimePackageJson = {
    name: "workhorse-sidecar-runtime",
    private: true,
    type: "module",
    dependencies: runtimeDependencies,
  };

  await fsp.writeFile(
    path.join(runtimeDir, "package.json"),
    `${JSON.stringify(runtimePackageJson, null, 2)}\n`,
    "utf8"
  );

  const wrapperScript = `#!/bin/bash
set -euo pipefail
DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
export PORT="\${PORT:-12621}"
export NODE_ENV="\${NODE_ENV:-production}"
cd "$DIR"
exec "$DIR/node" "$DIR/server.js" "$@"
`;

  const wrapperPath = path.join(runtimeDir, "workhorse-server");
  await fsp.writeFile(wrapperPath, wrapperScript, "utf8");
  await fsp.chmod(wrapperPath, 0o755);
  await fsp.chmod(path.join(runtimeDir, "node"), 0o755);

  await runCommand(
    runtimeNodeSource,
    [
      npmCliPath,
      "install",
      "--omit=dev",
      "--no-package-lock",
      "--audit=false",
      "--fund=false",
      "--prefix",
      runtimeDir,
    ],
    {
      cwd: repoRoot,
    }
  );

  const betterSqliteDir = path.join(runtimeDir, "node_modules", "better-sqlite3");
  await fsp.rm(path.join(betterSqliteDir, "build"), { recursive: true, force: true });
  await runCommand(runtimeNodeSource, [nodeGypPath, "rebuild", "--release"], {
    cwd: betterSqliteDir,
  });

  await runCommand(
    runtimeNodeSource,
    [
      "-e",
      [
        "const Database = require('better-sqlite3');",
        "new Database(':memory:').prepare('select 1').get();",
        "console.log('sidecar runtime verified');",
      ].join(" "),
    ],
    {
      cwd: runtimeDir,
    }
  );

  console.log(`Built sidecar runtime at ${runtimeDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
