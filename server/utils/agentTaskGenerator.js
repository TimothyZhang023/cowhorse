import { listSkills, listMcpServers } from "../models/database.js";
import { getAllAvailableTools } from "../models/mcpManager.js";
import { listDefaultMcpTemplates, searchDefaultMcpTemplates } from "./defaultMcpCatalog.js";
import { searchRegistryServers } from "./mcpRegistry.js";
import { createHttpError, extractJsonObject, runJsonGeneration } from "./aiGeneration.js";

function sanitizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSuggestedSkills(items, availableToolNames = []) {
  const allowedTools = new Set(availableToolNames);

  return safeArray(items)
    .map((item) => ({
      name: sanitizeText(item?.name),
      description: sanitizeText(item?.description),
      prompt: sanitizeText(item?.prompt),
      tools: safeArray(item?.tools)
        .map((tool) => sanitizeText(tool))
        .filter(Boolean)
        .filter((tool, index, list) => list.indexOf(tool) === index)
        .filter((tool) => allowedTools.size === 0 || allowedTools.has(tool)),
    }))
    .filter((item) => item.name && item.prompt);
}

function normalizeTaskDraft(rawDraft, { availableToolNames = [], skills = [] } = {}) {
  const allowedTools = new Set(availableToolNames);
  const knownSkillIds = new Set(skills.map((skill) => skill.id));

  const name = sanitizeText(rawDraft?.name);
  const description = sanitizeText(rawDraft?.description);
  const systemPrompt = String(rawDraft?.system_prompt || "").trim();
  const modelId = sanitizeText(rawDraft?.model_id);
  const skillIds = safeArray(rawDraft?.skill_ids)
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && knownSkillIds.has(id));
  const toolNames = safeArray(rawDraft?.tool_names)
    .map((tool) => sanitizeText(tool))
    .filter(Boolean)
    .filter((tool, index, list) => list.indexOf(tool) === index)
    .filter((tool) => allowedTools.has(tool));

  if (!name) {
    throw new Error("模型返回的任务草稿缺少名称");
  }
  if (!systemPrompt) {
    throw new Error("模型返回的任务草稿缺少 system_prompt");
  }

  return {
    name,
    description,
    system_prompt: systemPrompt,
    model_id: modelId,
    skill_ids: skillIds,
    tool_names: toolNames,
  };
}

function normalizeAnalysis(rawAnalysis) {
  return {
    summary: sanitizeText(rawAnalysis?.summary),
    workflow_steps: safeArray(rawAnalysis?.workflow_steps)
      .map((item) => sanitizeText(item))
      .filter(Boolean)
      .slice(0, 8),
    capability_breakdown: safeArray(rawAnalysis?.capability_breakdown)
      .map((item) => sanitizeText(item))
      .filter(Boolean)
      .slice(0, 8),
    search_queries: safeArray(rawAnalysis?.search_queries)
      .map((item) => sanitizeText(item))
      .filter(Boolean)
      .slice(0, 6),
    existing_skill_ids: safeArray(rawAnalysis?.existing_skill_ids)
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id)),
  };
}

function buildUnderstandingMessages(requirement, existingSkills, installedServers) {
  return [
    {
      role: "system",
      content:
        "你是 Workhorse 的任务编排分析器。你必须先理解需求，再拆解能力，再产出市场检索关键词。只返回 JSON，不要输出 Markdown。结构固定为：{\"summary\":\"\",\"workflow_steps\":[],\"capability_breakdown\":[],\"search_queries\":[],\"existing_skill_ids\":[]}。existing_skill_ids 只能从给定技能 ID 中选择。",
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          requirement,
          existing_skills: existingSkills.map((skill) => ({
            id: skill.id,
            name: skill.name,
            description: skill.description || "",
            prompt_excerpt: String(skill.prompt || "").slice(0, 120),
          })),
          installed_mcp_servers: installedServers.map((server) => ({
            id: server.id,
            name: server.name,
            type: server.type,
          })),
        },
        null,
        2
      ),
    },
  ];
}

function buildSynthesisMessages({
  requirement,
  analysis,
  existingSkills,
  availableTools,
  defaultTemplates,
  marketCandidates,
}) {
  return [
    {
      role: "system",
      content:
        "你是 Workhorse 的 ReAct 任务编排代理。你的职责是根据需求分析、市场 MCP 检索结果和当前已安装工具，生成一个可执行的任务蓝图。你必须只返回 JSON，不要输出 Markdown。结构固定为：{\"task\":{\"name\":\"\",\"description\":\"\",\"system_prompt\":\"\",\"skill_ids\":[],\"tool_names\":[],\"model_id\":\"\"},\"suggested_skills\":[],\"recommended_mcp_template_ids\":[],\"market_mcp_recommendations\":[]}。约束：1. task.tool_names 只能从 available_tools 里选择。2. task.skill_ids 只能从 existing_skills 的 ID 里选择。3. suggested_skills 结构为 {name,description,prompt,tools}。4. recommended_mcp_template_ids 只能从 default_templates 里选。5. market_mcp_recommendations 只保留 3-5 个最相关结果，每项结构为 {name,title,transport,reason,repository_url,remote_url,template_id}。",
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          requirement,
          analysis,
          existing_skills: existingSkills.map((skill) => ({
            id: skill.id,
            name: skill.name,
            description: skill.description || "",
          })),
          available_tools: availableTools,
          default_templates: defaultTemplates.map((template) => ({
            id: template.id,
            name: template.name,
            description: template.description,
            keywords: template.keywords || [],
          })),
          market_candidates: marketCandidates,
        },
        null,
        2
      ),
    },
  ];
}

function enrichTemplateMatches(templateIds, defaultTemplates) {
  const templateMap = new Map(defaultTemplates.map((item) => [item.id, item]));
  return safeArray(templateIds)
    .map((id) => sanitizeText(id))
    .filter(Boolean)
    .filter((id, index, list) => list.indexOf(id) === index)
    .map((id) => templateMap.get(id))
    .filter(Boolean);
}

function normalizeMarketRecommendations(items, matchedTemplates) {
  const templateIds = new Set(matchedTemplates.map((item) => item.id));

  return safeArray(items)
    .map((item) => ({
      name: sanitizeText(item?.name),
      title: sanitizeText(item?.title),
      transport: sanitizeText(item?.transport),
      reason: sanitizeText(item?.reason),
      repository_url: sanitizeText(item?.repository_url),
      remote_url: sanitizeText(item?.remote_url),
      template_id: templateIds.has(sanitizeText(item?.template_id))
        ? sanitizeText(item?.template_id)
        : "",
    }))
    .filter((item) => item.name && item.reason)
    .slice(0, 5);
}

export async function generateAgentTaskBlueprint(uid, requirement) {
  const normalizedRequirement = sanitizeText(requirement);
  if (!normalizedRequirement) {
    throw createHttpError(400, "请输入任务需求描述");
  }

  const [existingSkills, installedServers, availableToolsRaw] = await Promise.all([
    Promise.resolve(listSkills(uid)),
    Promise.resolve(listMcpServers(uid)),
    getAllAvailableTools(uid).catch(() => []),
  ]);

  const availableTools = safeArray(availableToolsRaw)
    .map((tool) => sanitizeText(tool?.function?.name))
    .filter(Boolean)
    .filter((tool, index, list) => list.indexOf(tool) === index);

  const defaultTemplates = listDefaultMcpTemplates();

  const understanding = await runJsonGeneration({
    uid,
    source: "agent_task_understanding",
    temperature: 0.2,
    messages: buildUnderstandingMessages(
      normalizedRequirement,
      existingSkills,
      installedServers
    ),
  });

  const analysis = normalizeAnalysis(extractJsonObject(understanding.content));
  const templateMatches = searchDefaultMcpTemplates(
    [normalizedRequirement, ...analysis.capability_breakdown, ...analysis.search_queries].join(" "),
    5
  );

  const marketCandidates = await searchRegistryServers(
    [normalizedRequirement, ...analysis.search_queries, ...analysis.capability_breakdown],
    8
  ).catch(() => []);

  const synthesis = await runJsonGeneration({
    uid,
    source: "agent_task_generation",
    temperature: 0.35,
    messages: buildSynthesisMessages({
      requirement: normalizedRequirement,
      analysis,
      existingSkills,
      availableTools,
      defaultTemplates,
      marketCandidates,
    }),
  });

  const rawBlueprint = extractJsonObject(synthesis.content);
  const draft = normalizeTaskDraft(rawBlueprint?.task, {
    availableToolNames: availableTools,
    skills: existingSkills,
  });
  draft.skill_ids = Array.from(
    new Set([...(analysis.existing_skill_ids || []), ...(draft.skill_ids || [])])
  );
  const suggestedSkills = normalizeSuggestedSkills(
    rawBlueprint?.suggested_skills,
    availableTools
  );
  const recommendedTemplates = enrichTemplateMatches(
    safeArray(rawBlueprint?.recommended_mcp_template_ids).length > 0
      ? rawBlueprint.recommended_mcp_template_ids
      : templateMatches.map((template) => template.id),
    defaultTemplates
  );
  const marketRecommendations = normalizeMarketRecommendations(
    rawBlueprint?.market_mcp_recommendations?.length > 0
      ? rawBlueprint.market_mcp_recommendations
      : marketCandidates.map((candidate) => ({
          ...candidate,
          reason: "与需求拆解和搜索关键词匹配",
          template_id: "",
        })),
    recommendedTemplates
  );

  return {
    analysis,
    draft,
    suggested_skills: suggestedSkills,
    recommended_mcp_templates: recommendedTemplates,
    market_mcp_recommendations: marketRecommendations,
    model: synthesis.model,
    endpoint: synthesis.endpoint,
  };
}
