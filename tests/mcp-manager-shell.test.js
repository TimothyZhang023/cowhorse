import { describe, expect, it } from "vitest";

import { createUser } from "../server/models/database.js";
import {
  BUILTIN_SHELL_TOOL_NAME,
  executeBuiltInShellTool,
  getAllAvailableTools,
} from "../server/models/mcpManager.js";

describe("built-in shell tool", () => {
  it("is available even when no MCP servers are configured", async () => {
    const user = createUser(`shell_tool_${Date.now()}`, "password123");
    const tools = await getAllAvailableTools(user.uid);

    expect(
      tools.some((tool) => tool.function?.name === BUILTIN_SHELL_TOOL_NAME)
    ).toBe(true);
  });

  it("executes a shell command inside the current workspace", async () => {
    const result = await executeBuiltInShellTool({
      command: "printf 'hello-shell'",
      cwd: ".",
      timeout_ms: 5000,
    });

    const text = String(result.content?.[0]?.text || "");
    expect(text).toContain("Command: printf 'hello-shell'");
    expect(text).toContain("STDOUT:");
    expect(text).toContain("hello-shell");
    expect(text).toContain(`CWD: ${process.cwd()}`);
  });
});
