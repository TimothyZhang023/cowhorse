import { execFileSync } from "node:child_process";

const ports = process.argv
  .slice(2)
  .map((value) => Number.parseInt(value, 10))
  .filter((value) => Number.isInteger(value) && value > 0);

if (ports.length === 0) {
  console.error("Usage: node scripts/killport.mjs <port> [port...]");
  process.exit(1);
}

function findPids(port) {
  try {
    const output = execFileSync("lsof", ["-ti", `tcp:${port}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    return output
      .split("\n")
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isInteger(pid));
  } catch (error) {
    if (error.status === 1) {
      return [];
    }

    throw error;
  }
}

for (const port of ports) {
  const pids = [...new Set(findPids(port))];

  if (pids.length === 0) {
    console.log(`port ${port}: no process found`);
    continue;
  }

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
      console.log(`port ${port}: stopped pid ${pid}`);
    } catch (error) {
      if (error.code === "ESRCH") {
        console.log(`port ${port}: pid ${pid} already exited`);
        continue;
      }

      throw error;
    }
  }
}
