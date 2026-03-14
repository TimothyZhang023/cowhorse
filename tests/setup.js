import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import crypto from "node:crypto";

const dbPath = path.join(
  os.tmpdir(),
  `workhorse-vitest-${process.pid}-${crypto.randomUUID()}.db`
);
const dataDir = path.join(
  os.tmpdir(),
  `workhorse-vitest-data-${process.pid}-${crypto.randomUUID()}`
);

process.env.DB_PATH = dbPath;
process.env.WORKHORSE_DATA_DIR = dataDir;
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.REFRESH_SECRET =
  process.env.REFRESH_SECRET || "test-refresh-secret";
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef";
process.env.STANDALONE_MODE = "false";

if (fs.existsSync(dbPath)) {
  fs.rmSync(dbPath, { force: true });
}
if (fs.existsSync(dataDir)) {
  fs.rmSync(dataDir, { recursive: true, force: true });
}
fs.mkdirSync(dataDir, { recursive: true });
