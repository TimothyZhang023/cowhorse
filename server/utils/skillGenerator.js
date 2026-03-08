import { getAllAvailableTools } from "../models/mcpManager.js";
import {
  createHttpError,
  extractJsonObject,
  runJsonGeneration,
} from "./aiGeneration.js";

function fallbackDescriptionFromRequirement(requirement) {
  const normalized = String(requirement || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "AI 自动生成的技能";
  }
  return normalized.length > 80
    ? `${normalized.slice(0, 80).trim()}...`
    : normalized;
}

export function normalizeGeneratedSkill(
  rawDraft,
  { availableToolNames = [], requirement = "" } = {}
) {
  const allowedTools = new Set(
    (Array.isArray(availableToolNames) ? availableToolNames : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  );

  const name = String(rawDraft?.name || "").trim();
  const prompt = String(rawDraft?.prompt || "").trim();
  const description = String(rawDraft?.description || "").trim();
  const examples = Array.isArray(rawDraft?.examples) ? rawDraft.examples : [];
  const tools = Array.isArray(rawDraft?.tools)
    ? rawDraft.tools
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .filter((item, index, list) => list.indexOf(item) === index)
        .filter((item) => allowedTools.size === 0 || allowedTools.has(item))
    : [];

  if (!name) {
    throw new Error("模型返回的技能缺少名称");
  }
  if (!prompt) {
    throw new Error("模型返回的技能缺少 prompt");
  }

  return {
    name,
    description: description || fallbackDescriptionFromRequirement(requirement),
    prompt,
    examples,
    tools,
  };
}

export function buildSkillGenerationMessages(requirement, availableToolNames = []) {
  const toolList = Array.isArray(availableToolNames) && availableToolNames.length
    ? availableToolNames.join(", ")
    : "无可用工具";

  return [
    {
      role: "system",
      content:
        "你是 Cowhouse 的 Skill 设计器。你的任务是把自然语言需求转换为可复用的技能草稿。你必须只返回一个 JSON 对象，不要输出 Markdown、解释或代码块。JSON 结构固定为：{\"name\":\"\",\"description\":\"\",\"prompt\":\"\",\"examples\":[],\"tools\":[]}。其中 prompt 必须是可直接用于 System Prompt 增强的中文说明，强调边界、步骤、输出要求；tools 只能从提供的可用工具名里挑选；没有合适工具时返回空数组。",
    },
    {
      role: "user",
      content: `请根据下面的需求生成技能草稿。\n\n需求：\n${String(
        requirement || ""
      ).trim()}\n\n当前可用工具：\n${toolList}\n\n要求：\n1. name 控制在 12 个汉字或等价长度以内。\n2. description 用一句话概括用途。\n3. prompt 直接面向执行模型，写清楚职责、执行步骤、约束、输出格式。\n4. examples 可以为空数组。\n5. tools 只能返回工具名数组，且必须来自可用工具列表。`,
    },
  ];
}

export async function generateSkillDraft(uid, requirement) {
  const normalizedRequirement = String(requirement || "").trim();
  if (!normalizedRequirement) {
    throw createHttpError(400, "请输入技能需求描述");
  }

  const availableTools = await getAllAvailableTools(uid)
    .then((tools) =>
      (Array.isArray(tools) ? tools : [])
        .map((tool) => tool?.function?.name)
        .filter(Boolean)
        .sort()
    )
    .catch(() => []);

  const generation = await runJsonGeneration({
    uid,
    source: "skill_generation",
    messages: buildSkillGenerationMessages(
      normalizedRequirement,
      availableTools
    ),
  });
  const draft = normalizeGeneratedSkill(extractJsonObject(generation.content), {
    availableToolNames: availableTools,
    requirement: normalizedRequirement,
  });

  return {
    draft,
    model: generation.model,
    endpoint: generation.endpoint,
  };
}
