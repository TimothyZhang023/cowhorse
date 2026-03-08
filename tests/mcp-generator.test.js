import { describe, expect, it } from "vitest";

import { extractJsonObject } from "../server/utils/aiGeneration.js";
import {
  buildMcpGenerationMessages,
  normalizeGeneratedMcp,
} from "../server/utils/mcpGenerator.js";

describe("mcpGenerator", () => {
  it("extracts MCP JSON from fenced model output", () => {
    const parsed = extractJsonObject(`
\`\`\`json
{"name":"GitHub MCP","type":"stdio","command":"npx","args":["-y","@modelcontextprotocol/server-github"],"url":"","headers":{},"auth":{"type":"bearer","token":"YOUR_TOKEN"},"is_enabled":true}
\`\`\`
`);

    expect(parsed.type).toBe("stdio");
    expect(parsed.command).toBe("npx");
  });

  it("normalizes stdio MCP drafts", () => {
    const draft = normalizeGeneratedMcp({
      name: "Spec Everything",
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-everything"],
      headers: { "X-Test": 1 },
      auth: { type: "bearer", token: "YOUR_TOKEN" },
      is_enabled: true,
    });

    expect(draft).toEqual({
      name: "Spec Everything",
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-everything"],
      url: undefined,
      env: {},
      headers: { "X-Test": "1" },
      auth: { type: "bearer", token: "YOUR_TOKEN" },
      is_enabled: 1,
    });
  });

  it("normalizes sse MCP drafts", () => {
    const draft = normalizeGeneratedMcp({
      name: "Remote MCP",
      type: "sse",
      url: "https://example.com/sse",
      headers: { Authorization: "Bearer YOUR_TOKEN" },
      auth: null,
      is_enabled: false,
    });

    expect(draft.type).toBe("sse");
    expect(draft.url).toBe("https://example.com/sse");
    expect(draft.command).toBeUndefined();
    expect(draft.is_enabled).toBe(0);
    expect(draft.env).toEqual({});
  });

  it("builds MCP generation instructions from natural language", () => {
    const messages = buildMcpGenerationMessages(
      "接入 GitHub MCP，本地用 npx 启动，需要 Bearer Token"
    );

    expect(messages).toHaveLength(2);
    expect(messages[1].content).toContain("GitHub MCP");
    expect(messages[1].content).toContain("Bearer Token");
  });
});
