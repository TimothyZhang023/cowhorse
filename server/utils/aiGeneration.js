import OpenAI from "openai";
import {
  PRESET_MODELS,
  getModels,
  logUsage,
} from "../models/database.js";
import {
  getEndpointCandidatesForModel,
  findModelConfigForEndpoint,
  mergeGenerationConfig,
  resolveEndpointModelPair,
} from "./modelSelection.js";

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

export function resolveGenerationModel(
  uidOrEndpoint,
  endpointOrModels = [],
  maybeModels = []
) {
  const hasUid = typeof uidOrEndpoint === "string";
  const uid = hasUid ? uidOrEndpoint : "";
  const endpoint = hasUid ? endpointOrModels : uidOrEndpoint;
  const models = hasUid ? maybeModels : endpointOrModels;
  const preferredCandidates = uid ? resolveModelCandidates(uid) : [];
  const enabledModels = Array.isArray(models)
    ? models.filter((model) => model?.is_enabled !== 0)
    : [];

  for (const candidate of preferredCandidates) {
    if (enabledModels.some((model) => model?.model_id === candidate)) {
      return candidate;
    }
  }

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
  const { endpoint, modelId: preferredModelId } = resolveEndpointModelPair(uid);
  if (!endpoint) {
    throw createHttpError(400, "请先在设置中配置可用的 API Endpoint");
  }

  const orderedEndpointCandidates = getEndpointCandidatesForModel(
    uid,
    preferredModelId
  );
  const modelId =
    preferredModelId ||
    resolveGenerationModel(uid, endpoint, getModels(endpoint.id, uid));
  if (!modelId) {
    throw createHttpError(400, "当前全局模型策略缺少可用模型，无法生成");
  }

  let lastError = null;
  for (const candidateEndpoint of orderedEndpointCandidates) {
    const baseURL = normalizeBaseUrl(candidateEndpoint.base_url);
    if (!baseURL) {
      continue;
    }

    try {
      const client = new OpenAI({
        apiKey: candidateEndpoint.api_key,
        baseURL,
      });

      const modelConfig =
        findModelConfigForEndpoint(candidateEndpoint.id, uid, modelId)
          ?.generation_config || {};

      const completion = await client.chat.completions.create({
        model: modelId,
        ...mergeGenerationConfig(modelConfig, { temperature }),
        messages,
      });

      if (completion.usage) {
        logUsage({
          uid,
          conversationId: null,
          model: modelId,
          endpointName: candidateEndpoint.name,
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          source,
        });
      }

      return {
        content: String(completion.choices?.[0]?.message?.content || "").trim(),
        model: modelId,
        endpoint: candidateEndpoint.name,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw createHttpError(
    502,
    lastError?.message || "当前全局模型策略对应的接入点均无法生成内容"
  );
}
