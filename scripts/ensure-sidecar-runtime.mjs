import fsp from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const runtimeDir = path.join(repoRoot, "src-tauri", "sidecar-runtime");
const placeholderPath = path.join(runtimeDir, "dev-placeholder.txt");

async function main() {
  await fsp.mkdir(runtimeDir, { recursive: true });

  const entries = await fsp.readdir(runtimeDir);
  const hasNonHiddenFile = entries.some((name) => !name.startsWith("."));
  if (hasNonHiddenFile) {
    return;
  }

  await fsp.writeFile(
    placeholderPath,
    "Generated for tauri dev. Run `npm run build:sidecar` for production runtime artifacts.\n",
    "utf8"
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
