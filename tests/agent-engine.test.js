import { describe, expect, it } from "vitest";
import {
  buildFallbackFinalResponse,
  getToolCallSignature,
  isUsableFinalResponse,
  registerToolCall,
  resolveInitialUserMessage,
  selectTaskSkills,
  selectTaskTools,
} from "../server/models/agentEngine.js";

describe("agentEngine", () => {
  it("keeps an explicit runtime message when provided", () => {
    const task = { name: "验收测试任务" };

    expect(resolveInitialUserMessage(task, "请执行一次巡检")).toBe(
      "请执行一次巡检"
    );
  });

  it("creates a fallback runtime message when the UI does not provide one", () => {
    const task = { name: "验收测试任务" };

    expect(resolveInitialUserMessage(task, "")).toContain("验收测试任务");
    expect(resolveInitialUserMessage(task, "")).toContain("[TASK_RUN]");
  });

  it("builds a stable signature for equivalent tool arguments", () => {
    const first = getToolCallSignature({
      function: {
        name: "get-sum",
        arguments: JSON.stringify({ b: 2, a: 1 }),
      },
    });
    const second = getToolCallSignature({
      function: {
        name: "get-sum",
        arguments: JSON.stringify({ a: 1, b: 2 }),
      },
    });

    expect(first).toBe(second);
  });

  it("marks a repeated tool call as over budget after the configured limit", () => {
    const toolCallCounts = new Map();
    const toolCall = {
      function: {
        name: "get-sum",
        arguments: JSON.stringify({ a: 1, b: 2 }),
      },
    };

    expect(registerToolCall(toolCallCounts, toolCall, 2).overBudget).toBe(
      false
    );
    expect(registerToolCall(toolCallCounts, toolCall, 2).overBudget).toBe(
      false
    );
    expect(registerToolCall(toolCallCounts, toolCall, 2).overBudget).toBe(true);
  });

  it("rejects tool-call style wrap-up content and falls back to tool summaries", () => {
    expect(
      isUsableFinalResponse(
        "<tool_call><function=get_sum><parameter=a>10</parameter></tool_call>"
      )
    ).toBe(false);

    expect(
      buildFallbackFinalResponse(
        [
          {
            role: "tool",
            name: "get-sum",
            content: "The sum of 10 and 2 is 12.",
          },
        ],
        "已停止重复工具调用。"
      )
    ).toContain("The sum of 10 and 2 is 12.");
  });

  it("respects task-level skill selection when provided", () => {
    const selected = selectTaskSkills({ skill_ids: [2] }, [
      { id: 1, is_enabled: 1, name: "A" },
      { id: 2, is_enabled: 1, name: "B" },
      { id: 3, is_enabled: 0, name: "C" },
    ]);

    expect(selected.map((skill) => skill.name)).toEqual(["B"]);
  });

  it("respects task-level tool selection when provided", () => {
    const selected = selectTaskTools({ tool_names: ["shell_execute"] }, [
      { function: { name: "shell_execute" } },
      { function: { name: "ddg-search" } },
    ]);

    expect(selected.map((tool) => tool.function.name)).toEqual([
      "shell_execute",
    ]);
  });
});
