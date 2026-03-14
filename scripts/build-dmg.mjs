import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const packageJsonPath = path.join(repoRoot, "package.json");
const packageJson = JSON.parse(await fsp.readFile(packageJsonPath, "utf8"));
const productName = packageJson.name || "workhorse";
const version = packageJson.version || "0.0.0";
const archLabel = process.arch === "arm64" ? "aarch64" : "x64";
const appPath = path.join(
  repoRoot,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "macos",
  `${productName}.app`
);
const outputDir = path.join(
  repoRoot,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "dmg"
);
const outputPath = path.join(outputDir, `${productName}_${version}_${archLabel}.dmg`);

await fsp.mkdir(outputDir, { recursive: true });
await fsp.rm(outputPath, { force: true });

await new Promise((resolve, reject) => {
  const child = spawn(
    "hdiutil",
    [
      "create",
      "-volname",
      productName,
      "-srcfolder",
      appPath,
      "-ov",
      "-format",
      "UDZO",
      outputPath,
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
    }
  );

  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) {
      resolve();
      return;
    }
    reject(new Error(`hdiutil exited with code ${code}`));
  });
});

console.log(`Built dmg at ${outputPath}`);
