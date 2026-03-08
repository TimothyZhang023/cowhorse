import OpenAI from "openai";
import {
  PRESET_MODELS,
  getDefaultEndpointGroup,
  getEndpointGroups,
  getModels,
  logUsage,
} from "../models/database.js";

const PROVIDER_FALLBACK_MODELS = {
  openai: "gpt-4o-mini",
  openai_compatible: "gpt-4o-mini",
  openrouter: "openai/gpt-4o-mini",
  gemini: "gemini-2.0-flash",
};

export function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export function resolveGenerationEndpoint(uid) {
  return getDefaultEndpointGroup(uid) || getEndpointGroups(uid)[0] || null;
}

export function resolveGenerationModel(endpoint, models = []) {
  const availableModels = Array.isArray(models)
    ? models.filter((model) => model?.is_enabled !== 0)
    : [];

  const explicitModel = availableModels.find(
    (model) => model?.model_id && model.model_id !== "default"
  );
  if (explicitModel) {
    return explicitModel.model_id;
  }

  const presetModel = PRESET_MODELS.find(
    (model) => model?.model_id && model.model_id !== "default"
  );
  if (presetModel) {
    return presetModel.model_id;
  }

  return (
    PROVIDER_FALLBACK_MODELS[String(endpoint?.provider || "openai_compatible")] ||
    null
  );
}

export function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    throw new Error("模型没有返回可解析的内容");
  }

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const primary = fencedMatch?.[1]?.trim() || raw;

  try {
    return JSON.parse(primary);
  } catch {
    const start = primary.indexOf("{");
    const end = primary.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(primary.slice(start, end + 1));
    }
  }

  throw new Error("模型返回内容不是合法 JSON");
}

export async function runJsonGeneration({
  uid,
  messages,
  source,
  temperature = 0.3,
}) {
  const endpoint = resolveGenerationEndpoint(uid);
  if (!endpoint) {
    throw createHttpError(400, "请先在设置中配置默认模型 Endpoint");
  }

  const modelId = resolveGenerationModel(endpoint, getModels(endpoint.id, uid));
  if (!modelId) {
    throw createHttpError(400, "默认 Endpoint 缺少可用模型，无法生成");
  }

  const baseURL = normalizeBaseUrl(endpoint.base_url);
  if (!baseURL) {
    throw createHttpError(400, "默认 Endpoint 缺少有效的 Base URL");
  }

  const client = new OpenAI({
    apiKey: endpoint.api_key,
    baseURL,
  });

  const completion = await client.chat.completions.create({
    model: modelId,
    temperature,
    messages,
  });

  if (completion.usage) {
    logUsage({
      uid,
      conversationId: null,
      model: modelId,
      endpointName: endpoint.name,
      promptTokens: completion.usage.prompt_tokens,
      completionTokens: completion.usage.completion_tokens,
      source,
    });
  }

  return {
    content: String(completion.choices?.[0]?.message?.content || "").trim(),
    model: modelId,
    endpoint: endpoint.name,
  };
}
