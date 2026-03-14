import {
  PRESET_MODELS,
  getAppSetting,
  getEndpointGroups,
  getModels,
  setAppSetting,
} from "../models/database.js";

export const GLOBAL_PRIMARY_MODEL_KEY = "global_primary_model";
export const GLOBAL_FALLBACK_MODELS_KEY = "global_fallback_models";

function sortEndpointsWithoutDefaultBias(endpoints = []) {
  return [...(Array.isArray(endpoints) ? endpoints : [])].sort((a, b) => {
    const timeA = Date.parse(a?.created_at || "") || 0;
    const timeB = Date.parse(b?.created_at || "") || 0;
    if (timeA !== timeB) {
      return timeA - timeB;
    }

    return Number(a?.id || 0) - Number(b?.id || 0);
  });
}

function normalizeModelId(value) {
  return String(value || "").trim();
}

function normalizeModelList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.map((item) => normalizeModelId(item)).filter(Boolean))
  );
}

function parseJsonArray(rawValue) {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return normalizeModelList(parsed);
  } catch {
    return [];
  }
}

export function getGlobalModelSettings(uid) {
  try {
    return {
      primary_model: normalizeModelId(
        getAppSetting(uid, GLOBAL_PRIMARY_MODEL_KEY, "")
      ),
      fallback_models: parseJsonArray(
        getAppSetting(uid, GLOBAL_FALLBACK_MODELS_KEY, "[]")
      ),
    };
  } catch {
    return {
      primary_model: "",
      fallback_models: [],
    };
  }
}

export function saveGlobalModelSettings(
  uid,
  { primary_model = "", fallback_models = [] } = {}
) {
  const normalizedPrimaryModel = normalizeModelId(primary_model);
  const normalizedFallbackModels = normalizeModelList(fallback_models).filter(
    (modelId) => modelId !== normalizedPrimaryModel
  );

  setAppSetting(uid, GLOBAL_PRIMARY_MODEL_KEY, normalizedPrimaryModel);
  setAppSetting(
    uid,
    GLOBAL_FALLBACK_MODELS_KEY,
    JSON.stringify(normalizedFallbackModels)
  );

  return {
    primary_model: normalizedPrimaryModel,
    fallback_models: normalizedFallbackModels,
  };
}

export function getEnabledModelCatalog(uid) {
  const endpoints = sortEndpointsWithoutDefaultBias(getEndpointGroups(uid));
  const catalog = [];
  const seen = new Set();

  for (const endpoint of endpoints) {
    const models = getModels(endpoint.id, uid).filter(
      (model) => Number(model.is_enabled) === 1
    );

    for (const model of models) {
      const modelId = normalizeModelId(model.model_id);
      if (!modelId || seen.has(modelId)) {
        continue;
      }

      seen.add(modelId);
      catalog.push({
        ...model,
        model_id: modelId,
        endpoint_id: endpoint.id,
        endpoint_name: endpoint.name,
        endpoint_provider: endpoint.provider,
      });
    }
  }

  return catalog;
}

export function getOrderedEndpointGroups(uid) {
  return sortEndpointsWithoutDefaultBias(getEndpointGroups(uid));
}

export function getEndpointCandidatesForModel(uid, modelId = "") {
  const normalizedModelId = normalizeModelId(modelId);
  const endpoints = getOrderedEndpointGroups(uid);

  if (!normalizedModelId) {
    return endpoints;
  }

  const matchingEndpoints = endpoints.filter((endpoint) =>
    getModels(endpoint.id, uid).some(
      (model) =>
        Number(model.is_enabled) === 1 &&
        normalizeModelId(model.model_id) === normalizedModelId
    )
  );

  return matchingEndpoints.length > 0 ? matchingEndpoints : endpoints;
}

export function resolveEndpointModelPair(uid, requestedModel = "") {
  const modelCandidates = resolveModelCandidates(uid, requestedModel);

  for (const modelId of modelCandidates) {
    const endpoint = getEndpointCandidatesForModel(uid, modelId)[0];
    if (endpoint) {
      return { endpoint, modelId };
    }
  }

  return {
    endpoint: getOrderedEndpointGroups(uid)[0] || null,
    modelId: "",
  };
}

export function resolveModelCandidates(uid, requestedModel = "") {
  const settings = getGlobalModelSettings(uid);
  const catalog = getEnabledModelCatalog(uid);
  const presetModels = Array.isArray(PRESET_MODELS)
    ? PRESET_MODELS.map((model) => normalizeModelId(model?.model_id))
    : [];

  const requested = normalizeModelId(requestedModel);
  const candidates = normalizeModelList([
    requested,
    requested ? "" : settings.primary_model,
    ...settings.fallback_models,
    ...catalog.map((model) => model.model_id),
    ...presetModels,
  ]).filter((modelId) => modelId !== "default");

  return candidates;
}

export function findModelConfigForEndpoint(endpointId, uid, modelId) {
  const targetModelId = normalizeModelId(modelId);
  if (!targetModelId) {
    return null;
  }

  return (
    getModels(endpointId, uid).find(
      (model) =>
        normalizeModelId(model.model_id) === targetModelId &&
        Number(model.is_enabled) === 1
    ) || null
  );
}

export function getPreferredEnabledModel(uid) {
  const settings = getGlobalModelSettings(uid);
  const catalog = getEnabledModelCatalog(uid);

  if (!catalog.length) {
    return null;
  }

  const targetIds = normalizeModelList([
    settings.primary_model,
    ...settings.fallback_models,
    ...catalog.map((model) => model.model_id),
  ]);

  for (const targetId of targetIds) {
    const matched = catalog.find(
      (model) => normalizeModelId(model.model_id) === targetId
    );
    if (matched) {
      return matched;
    }
  }

  return catalog[0] || null;
}

export function mergeGenerationConfig(
  baseConfig = {},
  overrideConfig = {},
  { keepUndefined = false } = {}
) {
  const merged = {
    ...(baseConfig || {}),
    ...(overrideConfig || {}),
  };

  return Object.fromEntries(
    Object.entries(merged).filter(([key, value]) => {
      if (key === "context_window") {
        return false;
      }

      if (keepUndefined) {
        return true;
      }

      return value !== undefined && value !== null && value !== "";
    })
  );
}
