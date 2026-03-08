import { describe, expect, it } from "vitest";

import { buildMcpDraftFromRegistryServer } from "../server/utils/mcpMarketGenerator.js";

describe("mcpMarketGenerator", () => {
  it("builds a stdio draft from registry package metadata", () => {
    const draft = buildMcpDraftFromRegistryServer({
      name: "github/server",
      title: "GitHub MCP",
      package_identifier: "@modelcontextprotocol/server-github",
      package_environment_variables: [
        {
          name: "GITHUB_TOKEN",
          isSecret: true,
        },
      ],
    });

    expect(draft).toEqual(
      expect.objectContaining({
        name: "GitHub MCP",
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: {
          GITHUB_TOKEN: "YOUR_GITHUB_TOKEN",
        },
      })
    );
  });

  it("builds an sse draft from registry remote metadata", () => {
    const draft = buildMcpDraftFromRegistryServer({
      name: "remote/server",
      title: "Remote MCP",
      remote_url: "https://example.com/mcp",
      remote_headers: [
        {
          name: "Authorization",
          isSecret: true,
        },
      ],
    });

    expect(draft).toEqual(
      expect.objectContaining({
        name: "Remote MCP",
        type: "sse",
        url: "https://example.com/mcp",
        headers: {
          Authorization: "YOUR_AUTHORIZATION",
        },
      })
    );
  });
});
