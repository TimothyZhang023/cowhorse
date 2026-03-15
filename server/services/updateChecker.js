import fetch from "node-fetch"; // If not available in Node 18+, we use global fetch
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { logger } from "../utils/logger.js";

function resolveCurrentDir() {
  if (typeof __dirname !== "undefined") {
    return __dirname;
  }

  try {
    const metaUrl = new Function("return import.meta.url")();
    if (metaUrl) {
      return dirname(fileURLToPath(metaUrl));
    }
  } catch {}

  return process.cwd();
}

function loadCurrentVersion() {
  if (process.env.WORKHORSE_VERSION) {
    return process.env.WORKHORSE_VERSION;
  }

  try {
    const packageJson = JSON.parse(
      fs.readFileSync(join(resolveCurrentDir(), "../../package.json"), "utf8")
    );
    return packageJson.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const currentVersion = loadCurrentVersion();

const GITHUB_REPO = "TimothyZhang023/cowhorse"; // Based on CorpusName from user context
const STARTUP_DELAY_MS = 1000 * 15;
const CHECK_INTERVAL_MS = 1000 * 60 * 60 * 12; // 12 hours
const MAX_CHECK_ATTEMPTS = 3;

let updateInfo = {
  hasUpdate: false,
  latestVersion: currentVersion,
  releaseUrl: "",
  checkTime: null,
};
let checkAttempts = 0;
let checkerStarted = false;

function hasRemainingAttempts() {
  return checkAttempts < MAX_CHECK_ATTEMPTS;
}

export async function checkUpdate() {
  if (!hasRemainingAttempts()) {
    return updateInfo;
  }

  checkAttempts += 1;
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: { Accept: "application/vnd.github.v3+json" },
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.tag_name) {
      throw new Error("No tag_name found in GitHub response");
    }
    const latestVersion = data.tag_name.replace(/^v/, "");

    updateInfo = {
      hasUpdate: isNewerVersion(currentVersion, latestVersion),
      latestVersion,
      releaseUrl: data.html_url,
      checkTime: new Date().toISOString(),
    };

    if (updateInfo.hasUpdate) {
      logger.info(
        { current: currentVersion, latest: latestVersion },
        "[Update] New version available!"
      );
    } else {
      logger.info(
        { version: currentVersion },
        "[Update] Running latest version"
      );
    }
  } catch (error) {
    logger.error(
      { err: error.message, attempt: checkAttempts, maxAttempts: MAX_CHECK_ATTEMPTS },
      "[Update] Failed to check for updates"
    );
  }

  return updateInfo;
}

function isNewerVersion(current, latest) {
  const c = current.split(".").map(Number);
  const l = latest.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (l[i] > (c[i] || 0)) return true;
    if (l[i] < (c[i] || 0)) return false;
  }
  return false;
}

export function getUpdateStatus() {
  return updateInfo;
}

export function startUpdateChecker() {
  if (checkerStarted) {
    return;
  }

  checkerStarted = true;

  // Initial check after 15 seconds to avoid slowing down startup.
  setTimeout(() => {
    void checkUpdate();
  }, STARTUP_DELAY_MS);

  // Periodic checks are still spaced far apart, and the process lifetime
  // is capped to at most 3 update attempts total.
  setInterval(() => {
    if (!hasRemainingAttempts()) {
      return;
    }
    void checkUpdate();
  }, CHECK_INTERVAL_MS);
}
