import { describe, expect, it } from "vitest";
import {
  normalizeMessageForClient,
  resolveEndpointGenerationConfig,
} from "../server/routes/conversations.js";

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
});
