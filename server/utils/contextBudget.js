import {
  buildGlobalPromptExtension,
  buildSkillsPromptExtension,
} from "./agentPromptBuilder.js";

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 256 * 1024;
export const CONTEXT_COMPACT_RATIO = 0.7;

function stringifyValue(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function estimateTokenCount(value) {
  const text = stringifyValue(value);
  if (!text.trim()) {
    return 0;
  }

  const cjkMatches = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || [];
  const asciiWordMatches = text.match(/[A-Za-z0-9_]+/g) || [];
  const punctuationMatches = text.match(/[^\p{L}\p{N}\s]/gu) || [];
  const whitespaceMatches = text.match(/\s/g) || [];

  const asciiChars = asciiWordMatches.reduce(
    (total, word) => total + word.length,
    0
  );

  return Math.max(
    1,
    Math.ceil(
      cjkMatches.length * 1.1 +
        asciiChars / 3.8 +
        asciiWordMatches.length * 0.2 +
        punctuationMatches.length * 0.15 +
        whitespaceMatches.length * 0.03
    )
  );
}

export function resolveContextWindowTokens(
  generationConfig = {},
  fallbackValue = DEFAULT_CONTEXT_WINDOW_TOKENS
) {
  const value = Number(generationConfig?.context_window);
  if (!Number.isFinite(value) || value <= 0) {
    return fallbackValue;
  }

  return Math.round(value);
}

export function resolveCompactionThresholdTokens(
  contextWindow = DEFAULT_CONTEXT_WINDOW_TOKENS,
  ratio = CONTEXT_COMPACT_RATIO
) {
  return Math.max(1024, Math.floor(Number(contextWindow || 0) * ratio));
}

export function estimateMessagesTokens(messages = []) {
  if (!Array.isArray(messages)) {
    return 0;
  }

  return messages.reduce((total, message) => {
    const role = String(message?.role || "");
    const name = String(message?.name || "");
    const content = stringifyValue(message?.content || "");
    const toolCalls = stringifyValue(message?.tool_calls || "");
    const toolCallId = String(message?.tool_call_id || "");

    return (
      total +
      estimateTokenCount(
        [role, name, content, toolCalls, toolCallId].filter(Boolean).join("\n")
      )
    );
  }, 0);
}

export function estimateToolSchemaTokens(tools = []) {
  return estimateTokenCount(
    Array.isArray(tools)
      ? tools.map((tool) => ({
          type: tool?.type,
          function: tool?.function,
        }))
      : []
  );
}

export function truncateTextToTokenBudget(
  text,
  maxTokens,
  { preserveEnd = true } = {}
) {
  const normalizedText = String(text || "");
  if (!normalizedText) {
    return "";
  }

  if (estimateTokenCount(normalizedText) <= maxTokens) {
    return normalizedText;
  }

  const charsPerToken = 3.2;
  const maxChars = Math.max(512, Math.floor(maxTokens * charsPerToken));

  if (normalizedText.length <= maxChars) {
    return normalizedText;
  }

  if (preserveEnd) {
    return `...${normalizedText.slice(-maxChars)}`;
  }

  return `${normalizedText.slice(0, maxChars)}...`;
}

export function buildStaticContextBudget({
  globalMarkdown = "",
  skills = [],
  tools = [],
  contextWindow = DEFAULT_CONTEXT_WINDOW_TOKENS,
} = {}) {
  const normalizedContextWindow = resolveContextWindowTokens({
    context_window: contextWindow,
  });
  const globalPrompt = buildGlobalPromptExtension(globalMarkdown);
  const skillsPrompt = buildSkillsPromptExtension(skills);
  const toolsSchema = Array.isArray(tools)
    ? tools.map((tool) => ({
        type: tool?.type,
        function: tool?.function,
      }))
    : [];

  const breakdown = [
    {
      key: "global_prompt",
      label: "全局规则",
      tokens: estimateTokenCount(globalPrompt),
    },
    {
      key: "skills",
      label: "Skills",
      tokens: estimateTokenCount(skillsPrompt),
    },
    {
      key: "mcp_tools",
      label: "MCP Tools",
      tokens: estimateTokenCount(toolsSchema),
    },
  ].map((item) => ({
    ...item,
    percentage_of_window:
      normalizedContextWindow > 0
        ? Number(
            ((item.tokens / normalizedContextWindow) * 100).toFixed(2)
          )
        : 0,
  }));

  const staticTokens = breakdown.reduce((sum, item) => sum + item.tokens, 0);
  const compactThreshold = resolveCompactionThresholdTokens(
    normalizedContextWindow
  );
  const remainingBudget = Math.max(0, normalizedContextWindow - staticTokens);

  return {
    context_window: normalizedContextWindow,
    compact_threshold: compactThreshold,
    compact_threshold_ratio: CONTEXT_COMPACT_RATIO,
    static_tokens: staticTokens,
    static_percentage: Number(
      ((staticTokens / normalizedContextWindow) * 100).toFixed(2)
    ),
    remaining_budget: remainingBudget,
    remaining_percentage: Number(
      ((remainingBudget / normalizedContextWindow) * 100).toFixed(2)
    ),
    breakdown,
  };
}
