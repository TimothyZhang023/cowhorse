import { describe, expect, it } from "vitest";
import {
  normalizeMessageForClient,
  buildConversationSystemPrompt,
  resolveEndpointGenerationConfig,
} from "../server/routes/conversations.js";
import {
  createSkill,
  createUser,
  setAppSetting,
} from "../server/models/database.js";

describe("conversation message normalization", () => {
  it("parses stored tool results into structured fields", () => {
    const normalized = normalizeMessageForClient({
      id: 1,
      role: "tool",
      content: "[TOOL_RESULT:call_123:get-sum]:3",
    });

    expect(normalized.role).toBe("tool");
    expect(normalized.tool_call_id).toBe("call_123");
    expect(normalized.name).toBe("get-sum");
    expect(normalized.content).toBe("3");
  });

  it("parses stored tool calls into assistant metadata", () => {
    const toolCalls = [
      {
        id: "call_123",
        type: "function",
        function: {
          name: "get-sum",
          arguments: "{\"a\":1,\"b\":2}",
        },
      },
    ];

    const normalized = normalizeMessageForClient({
      id: 2,
      role: "assistant",
      content: `[TOOL_CALLS]:${JSON.stringify(toolCalls)}`,
    });

    expect(normalized.role).toBe("assistant");
    expect(normalized.content).toBe("");
    expect(normalized.tool_calls).toEqual(toolCalls);
  });

  it("uses a conservative auto max_tokens default for OpenRouter", () => {
    const config = resolveEndpointGenerationConfig(
      { provider: "openrouter" },
      {}
    );

    expect(config.max_tokens).toBe(16384);
  });

  it("builds conversation agent prompt with global prompt and enabled skills", () => {
    const user = createUser(`conv_prompt_${Date.now()}`, "password123");
    createSkill(
      user.uid,
      "Browser Skill",
      "web helper",
      "遇到网页任务时优先使用浏览器工具。",
      [],
      []
    );
    createSkill(
      user.uid,
      "Disabled Skill",
      "disabled",
      "这个 skill 不应该出现在 prompt 中。",
      [],
      [],
      { is_enabled: 0 }
    );
    setAppSetting(user.uid, "global_system_prompt_markdown", "始终先确认目标。");

    const prompt = buildConversationSystemPrompt(user.uid, {
      system_prompt: "你需要帮用户执行一个完整任务。",
    });

    expect(prompt).toContain("对话 Agent");
    expect(prompt).toContain("始终先确认目标");
    expect(prompt).toContain("Browser Skill");
    expect(prompt).not.toContain("Disabled Skill");
    expect(prompt).toContain("你需要帮用户执行一个完整任务");
    expect(prompt).toContain("shell_execute");
  });
});
