import { getAppSetting, listSkills } from "./database.js";
import { getAllAvailableTools } from "./mcpManager.js";
import { buildTaskSystemPrompt } from "../utils/agentPromptBuilder.js";

const GLOBAL_SYSTEM_PROMPT_MD_KEY = "global_system_prompt_markdown";

export function selectAgentSkills(allSkills = [], skillIds = null) {
  const enabledSkills = (Array.isArray(allSkills) ? allSkills : []).filter(
    (skill) => Number(skill.is_enabled) === 1
  );
  const selectedSkillIds = Array.isArray(skillIds)
    ? new Set(skillIds.map((id) => Number(id)).filter(Number.isFinite))
    : null;

  if (!selectedSkillIds || selectedSkillIds.size === 0) {
    return enabledSkills;
  }

  return enabledSkills.filter((skill) =>
    selectedSkillIds.has(Number(skill.id))
  );
}

export function selectAgentTools(allTools = [], toolNames = null) {
  const selectedToolNames = Array.isArray(toolNames)
    ? new Set(
        toolNames.map((name) => String(name || "").trim()).filter(Boolean)
      )
    : null;

  if (!selectedToolNames || selectedToolNames.size === 0) {
    return Array.isArray(allTools) ? allTools : [];
  }

  return (Array.isArray(allTools) ? allTools : []).filter((tool) =>
    selectedToolNames.has(String(tool?.function?.name || "").trim())
  );
}

export function buildAgentSystemPrompt({
  uid,
  baseSystemPrompt,
  skillIds = null,
  globalMarkdown = null,
}) {
  const selectedSkills = selectAgentSkills(listSkills(uid), skillIds);
  const resolvedGlobalMarkdown =
    globalMarkdown !== null
      ? String(globalMarkdown || "")
      : getAppSetting(
          uid,
          GLOBAL_SYSTEM_PROMPT_MD_KEY,
          process.env.GLOBAL_SYSTEM_PROMPT_MD || ""
        );

  return buildTaskSystemPrompt({
    taskSystemPrompt: baseSystemPrompt,
    taskSkills: selectedSkills,
    globalMarkdown: resolvedGlobalMarkdown,
  });
}

export async function prepareAgentTooling(uid, { toolNames = null } = {}) {
  const allTools = await getAllAvailableTools(uid).catch(() => []);
  const requestTools = selectAgentTools(allTools, toolNames);
  const openaiTools = requestTools.map(({ _mcp_server_id, ...tool }) => tool);

  return {
    allTools,
    requestTools,
    openaiTools,
  };
}
