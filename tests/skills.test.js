import { describe, expect, it } from "vitest";

import {
  extractJsonObject,
  resolveGenerationModel,
} from "../server/utils/aiGeneration.js";
import {
  buildSkillGenerationMessages,
  normalizeGeneratedSkill,
} from "../server/utils/skillGenerator.js";

describe("skillGenerator", () => {
  it("extracts JSON from fenced model output", () => {
    const parsed = extractJsonObject(`
这里是技能草稿：

\`\`\`json
{"name":"网页巡检","description":"检查页面状态","prompt":"输出问题清单","examples":[],"tools":["browser.search"]}
\`\`\`
`);

    expect(parsed).toEqual({
      name: "网页巡检",
      description: "检查页面状态",
      prompt: "输出问题清单",
      examples: [],
      tools: ["browser.search"],
    });
  });

  it("normalizes generated skills and filters unavailable tools", () => {
    const draft = normalizeGeneratedSkill(
      {
        name: "竞品调研",
        description: "",
        prompt: "先检索，再对比，最后输出结论。",
        examples: ["示例"],
        tools: ["search.web", "unknown.tool", "search.web"],
      },
      {
        requirement: "生成一个竞品调研技能",
        availableToolNames: ["search.web"],
      }
    );

    expect(draft.name).toBe("竞品调研");
    expect(draft.description).toContain("生成一个竞品调研技能");
    expect(draft.examples).toEqual(["示例"]);
    expect(draft.tools).toEqual(["search.web"]);
  });

  it("resolves a usable fallback model when endpoint models are absent", () => {
    expect(
      resolveGenerationModel(
        { provider: "openrouter" },
        [{ model_id: "default", is_enabled: 1 }]
      )
    ).toBe("openai/gpt-4o-mini");
  });

  it("builds generation messages with explicit tool constraints", () => {
    const messages = buildSkillGenerationMessages("做一个日报总结技能", [
      "search.web",
      "fetch.page",
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[1].content).toContain("做一个日报总结技能");
    expect(messages[1].content).toContain("search.web, fetch.page");
  });
});
