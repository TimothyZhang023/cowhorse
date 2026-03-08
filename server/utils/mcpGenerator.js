import {
  createHttpError,
  extractJsonObject,
  runJsonGeneration,
} from "./aiGeneration.js";

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeHeaders(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce((acc, [key, item]) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return acc;
    }

    acc[normalizedKey] = String(item ?? "").trim();
    return acc;
  }, {});
}

function normalizeEnv(value) {
  return normalizeHeaders(value);
}

function normalizeAuth(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const type = String(value.type || "").trim().toLowerCase();
  if (type === "bearer") {
    const token = String(value.token || "").trim();
    return token ? { type: "bearer", token } : null;
  }

  if (type === "basic") {
    const username = String(value.username || "").trim();
    const password = String(value.password || "").trim();
    if (!username || !password) {
      return null;
    }
    return { type: "basic", username, password };
  }

  return null;
}

export function normalizeGeneratedMcp(rawDraft) {
  const type = String(rawDraft?.type || "stdio").trim().toLowerCase() === "sse"
    ? "sse"
    : "stdio";
  const name = String(rawDraft?.name || "").trim();
  const command = String(rawDraft?.command || "").trim();
  const url = String(rawDraft?.url || "").trim();
  const args = normalizeStringArray(rawDraft?.args);
  const env = normalizeEnv(rawDraft?.env);
  const headers = normalizeHeaders(rawDraft?.headers);
  const auth = normalizeAuth(rawDraft?.auth);
  const isEnabled = rawDraft?.is_enabled === false ? 0 : 1;

  if (!name) {
    throw new Error("模型返回的 MCP 配置缺少名称");
  }

  if (type === "stdio" && !command) {
    throw new Error("模型返回的 stdio MCP 配置缺少 command");
  }

  if (type === "sse" && !url) {
    throw new Error("模型返回的 SSE MCP 配置缺少 url");
  }

  return {
    name,
    type,
    command: type === "stdio" ? command : undefined,
    args: type === "stdio" ? args : [],
    url: type === "sse" ? url : undefined,
    env,
    headers,
    auth,
    is_enabled: isEnabled,
  };
}

export function buildMcpGenerationMessages(requirement) {
  return [
    {
      role: "system",
      content:
        "你是 Cowhouse 的 MCP 接入助手。你的任务是根据自然语言需求生成可直接落库的 MCP 配置。你必须只返回一个 JSON 对象，不要输出 Markdown、解释或代码块。JSON 结构固定为：{\"name\":\"\",\"type\":\"stdio|sse\",\"command\":\"\",\"args\":[],\"url\":\"\",\"env\":{},\"headers\":{},\"auth\":null,\"is_enabled\":true}。规则：1. 只能返回 stdio 或 sse。2. 需要密钥时可以使用占位符，如 YOUR_API_KEY，不要编造真实密钥。3. stdio 必须给出 command 和 args 数组，并优先把 API_KEY 一类配置写入 env。4. sse 必须给出 url。5. 未使用字段保留空字符串、空数组、空对象或 null。",
    },
    {
      role: "user",
      content: `请根据下面的描述生成 MCP 接入配置：\n\n${String(
        requirement || ""
      ).trim()}\n\n要求：\n1. name 简洁明确。\n2. 如果更适合本地命令方式，优先输出 stdio。\n3. 如果描述里包含远程 URL、token、headers，要合理放入 url、auth、headers。\n4. 如果描述里包含环境变量或密钥名，优先放入 env。\n5. 不确定时也要给出最可能可执行的配置草稿。`,
    },
  ];
}

export async function generateMcpDraft(uid, requirement) {
  const normalizedRequirement = String(requirement || "").trim();
  if (!normalizedRequirement) {
    throw createHttpError(400, "请输入 MCP 接入需求描述");
  }

  const generation = await runJsonGeneration({
    uid,
    source: "mcp_generation",
    messages: buildMcpGenerationMessages(normalizedRequirement),
  });

  return {
    draft: normalizeGeneratedMcp(extractJsonObject(generation.content)),
    model: generation.model,
    endpoint: generation.endpoint,
  };
}
