import { describe, expect, it } from "vitest";

import {
  getDefaultMcpTemplate,
  listDefaultMcpTemplates,
  searchDefaultMcpTemplates,
} from "../server/utils/defaultMcpCatalog.js";

describe("defaultMcpCatalog", () => {
  it("lists bundled default templates", () => {
    const templates = listDefaultMcpTemplates();

    expect(templates.length).toBeGreaterThanOrEqual(5);
    expect(templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "filesystem", name: "Filesystem" }),
        expect.objectContaining({ id: "github", name: "GitHub" }),
      ])
    );
  });

  it("returns a clone of a template by id", () => {
    const template = getDefaultMcpTemplate("github");

    expect(template).toEqual(
      expect.objectContaining({
        id: "github",
        type: "stdio",
        command: "npx",
      })
    );
  });

  it("searches templates by natural language keywords", () => {
    const templates = searchDefaultMcpTemplates("代码仓库 PR issue", 3);

    expect(templates[0]).toEqual(
      expect.objectContaining({
        id: "github",
      })
    );
  });
});
