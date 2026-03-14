import { execSync } from "node:child_process";

let cachedEnv = null;

/**
 * Fetches the shell environment variables by running a login shell and printing the env.
 * This ensures that environment variables set in .zshrc, .bashrc, or .zprofile are available.
 */
export function getShellEnv() {
  if (cachedEnv) return cachedEnv;

  if (process.platform === "win32") {
    cachedEnv = { ...process.env };
    return cachedEnv;
  }

  try {
    // We use a login shell (-l) to source user profiles
    const shell = process.env.SHELL || "/bin/zsh";
    
    // -lc "env" executes the 'env' command in a login shell context
    const output = execSync(`${shell} -lc "env"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });

    const env = {};
    output.split("\n").forEach((line) => {
      const firstEqual = line.indexOf("=");
      if (firstEqual > 0) {
        const key = line.slice(0, firstEqual);
        const value = line.slice(firstEqual + 1);
        env[key] = value;
      }
    });

    // Merge with current process.env, shell env variables should generally take precedence
    // for execution environment, especially PATH, node versions (nvm), etc.
    cachedEnv = { ...process.env, ...env };
    
    console.log("[ShellEnv] Successfully loaded environment from shell:", shell);
    return cachedEnv;
  } catch (e) {
    console.warn("[ShellEnv] Failed to fetch shell environment:", e.message);
    cachedEnv = { ...process.env };
    return cachedEnv;
  }
}
