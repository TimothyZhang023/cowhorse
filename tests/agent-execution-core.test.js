import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  chatCreateMock,
  openAiConstructorMock,
  executeMcpToolMock,
  getEndpointCandidatesForModelMock,
} = vi.hoisted(() => ({
  chatCreateMock: vi.fn(),
  openAiConstructorMock: vi.fn(),
  executeMcpToolMock: vi.fn(),
  getEndpointCandidatesForModelMock: vi.fn(),
}));

vi.mock("openai", () => {
  class MockOpenAI {
    constructor(config) {
      openAiConstructorMock(config);
      this.chat = {
        completions: {
          create: chatCreateMock,
        },
      };
    }
  }

  return {
    default: MockOpenAI,
  };
});

vi.mock("../server/models/mcpManager.js", () => ({
  executeMcpTool: executeMcpToolMock,
}));

vi.mock("../server/utils/modelSelection.js", () => ({
  getEndpointCandidatesForModel: getEndpointCandidatesForModelMock,
}));

import {
  executeAgentToolCall,
  normalizeBaseUrlCandidates,
  normalizeToolCallResult,
  requestAgentTurnWithFallback,
} from "../server/models/agentExecutionCore.js";

describe("agentExecutionCore", () => {
  beforeEach(() => {
    chatCreateMock.mockReset();
    openAiConstructorMock.mockReset();
    executeMcpToolMock.mockReset();
    getEndpointCandidatesForModelMock.mockReset();
  });

  it("normalizes base url candidates without duplicates", () => {
    expect(normalizeBaseUrlCandidates("https://api.example.com/")).toEqual([
      "https://api.example.com",
      "https://api.example.com/v1",
      "https://api.example.com/api/v1",
    ]);
    expect(normalizeBaseUrlCandidates("https://api.example.com/v1")).toEqual([
      "https://api.example.com/v1",
      "https://api.example.com/api/v1",
    ]);
  });

  it("falls back to the next endpoint for non-stream completions", async () => {
    getEndpointCandidatesForModelMock.mockReturnValue([
      {
        id: "ep-1",
        name: "primary",
        api_key: "key-1",
        base_url: "https://primary.example.com/api/v1",
      },
      {
        id: "ep-2",
        name: "secondary",
        api_key: "key-2",
        base_url: "https://secondary.example.com/api/v1",
      },
    ]);
    chatCreateMock
      .mockRejectedValueOnce(new Error("primary failed"))
      .mockRejectedValueOnce(new Error("primary failed again"))
      .mockResolvedValueOnce({
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });

    const result = await requestAgentTurnWithFallback({
      uid: "u-1",
      modelCandidates: ["gpt-test"],
      messages: [{ role: "user", content: "hello" }],
      stream: false,
      resolveGenerationConfig: () => ({ temperature: 0.2 }),
    });

    expect(result.ok).toBe(true);
    expect(result.endpoint.id).toBe("ep-2");
    expect(openAiConstructorMock).toHaveBeenCalledTimes(3);
    expect(chatCreateMock).toHaveBeenCalledTimes(3);
  });

  it("retries stream requests without stream_options when upstream rejects it", async () => {
    getEndpointCandidatesForModelMock.mockReturnValue([
      {
        id: "ep-1",
        name: "primary",
        api_key: "key-1",
        base_url: "https://primary.example.com/api/v1",
      },
    ]);
    chatCreateMock
      .mockRejectedValueOnce({
        message: "400",
        response: {
          data: {
            error: {
              message: "stream_options.include_usage is unsupported",
            },
          },
        },
      })
      .mockResolvedValueOnce({
        [Symbol.asyncIterator]: async function* () {},
      });

    const result = await requestAgentTurnWithFallback({
      uid: "u-1",
      modelCandidates: ["gpt-test"],
      messages: [{ role: "user", content: "hello" }],
      stream: true,
      resolveGenerationConfig: () => ({ temperature: 0.2 }),
      getErrorMessage: (error) =>
        error?.response?.data?.error?.message || error?.message || "",
    });

    expect(result.ok).toBe(true);
    expect(result.retriedWithoutStreamOptions).toBe(true);
    expect(chatCreateMock).toHaveBeenCalledTimes(2);
    expect(chatCreateMock.mock.calls[0][0].stream_options).toEqual({
      include_usage: true,
    });
    expect(chatCreateMock.mock.calls[1][0].stream_options).toBeUndefined();
  });

  it("executes tools through MCP and normalizes the text result", async () => {
    executeMcpToolMock.mockResolvedValue({
      content: [{ text: "line one" }, { text: "line two" }],
    });

    const result = await executeAgentToolCall({
      uid: "u-1",
      requestTools: [
        {
          _mcp_server_id: "srv-1",
          function: { name: "echo" },
        },
      ],
      toolCall: {
        id: "call-1",
        function: {
          name: "echo",
          arguments: JSON.stringify({ value: 42 }),
        },
      },
      executionScope: {
        uid: "u-1",
        conversationId: "c-1",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.args).toEqual({ value: 42 });
    expect(result.resultText).toBe("line one\nline two");
    expect(executeMcpToolMock).toHaveBeenCalledWith(
      "u-1",
      "srv-1",
      "echo",
      { value: 42 },
      {
        signal: undefined,
        executionScope: {
          uid: "u-1",
          conversationId: "c-1",
        },
      }
    );
    expect(
      normalizeToolCallResult({
        content: [{ text: "line one" }, { text: "line two" }],
      })
    ).toBe("line one\nline two");
  });
});
