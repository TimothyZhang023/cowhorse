import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";

const WORKHORSE_DATA_DIR =
  process.env.WORKHORSE_DATA_DIR || join(os.homedir(), ".workhorse");
const SYSTEM_CONFIG_PATH = join(WORKHORSE_DATA_DIR, "system-config.json");

const MAX_LIMIT = 1000;

const DEFAULT_USER_CONFIG = {
  user_profile: {
    username: "",
  },
  task_config: {
    max_turns: 100,
    max_tool_loops: 100,
    max_tool_calls_per_signature: 100,
  },
  model_policy: {
    primary_model: "",
    fallback_models: [],
  },
};

const DEFAULT_SYSTEM_CONFIG = {
  version: 1,
  defaults: DEFAULT_USER_CONFIG,
  users: {},
};

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureDataDir() {
  if (!fs.existsSync(WORKHORSE_DATA_DIR)) {
    fs.mkdirSync(WORKHORSE_DATA_DIR, { recursive: true });
  }
}

function normalizePositiveInteger(input, fallbackValue) {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) {
    return fallbackValue;
  }
  return Math.min(MAX_LIMIT, Math.max(1, Math.round(value)));
}

function normalizeModelList(input) {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(input.map((item) => String(item || "").trim()).filter(Boolean))
  );
}

function normalizeUserConfig(input = {}, fallback = DEFAULT_USER_CONFIG) {
  const merged = {
    ...cloneJson(fallback),
    ...(input && typeof input === "object" ? input : {}),
  };

  const username = String(merged?.user_profile?.username || "").trim();
  const fallbackTaskConfig = fallback.task_config || DEFAULT_USER_CONFIG.task_config;
  const taskConfig = merged?.task_config || {};
  const modelPolicy = merged?.model_policy || {};

  return {
    user_profile: {
      username,
    },
    task_config: {
      max_turns: normalizePositiveInteger(
        taskConfig.max_turns,
        fallbackTaskConfig.max_turns
      ),
      max_tool_loops: normalizePositiveInteger(
        taskConfig.max_tool_loops,
        fallbackTaskConfig.max_tool_loops
      ),
      max_tool_calls_per_signature: normalizePositiveInteger(
        taskConfig.max_tool_calls_per_signature,
        fallbackTaskConfig.max_tool_calls_per_signature
      ),
    },
    model_policy: {
      primary_model: String(modelPolicy.primary_model || "").trim(),
      fallback_models: normalizeModelList(modelPolicy.fallback_models),
    },
  };
}

function normalizeSystemConfig(input = {}) {
  const defaults = normalizeUserConfig(
    input?.defaults || {},
    DEFAULT_USER_CONFIG
  );
  const usersInput = input?.users || {};
  const users = {};

  for (const [uid, value] of Object.entries(usersInput)) {
    if (!uid) continue;
    users[uid] = normalizeUserConfig(value, defaults);
  }

  return {
    version: Number.isFinite(Number(input?.version)) ? Number(input.version) : 1,
    defaults,
    users,
  };
}

function readSystemConfigRaw() {
  ensureDataDir();
  if (!fs.existsSync(SYSTEM_CONFIG_PATH)) {
    const initial = cloneJson(DEFAULT_SYSTEM_CONFIG);
    fs.writeFileSync(SYSTEM_CONFIG_PATH, JSON.stringify(initial, null, 2), "utf8");
    return normalizeSystemConfig(initial);
  }

  try {
    const payload = fs.readFileSync(SYSTEM_CONFIG_PATH, "utf8");
    return normalizeSystemConfig(JSON.parse(payload));
  } catch {
    const fallback = cloneJson(DEFAULT_SYSTEM_CONFIG);
    fs.writeFileSync(SYSTEM_CONFIG_PATH, JSON.stringify(fallback, null, 2), "utf8");
    return normalizeSystemConfig(fallback);
  }
}

function writeSystemConfigRaw(config) {
  ensureDataDir();
  const normalized = normalizeSystemConfig(config);
  fs.writeFileSync(SYSTEM_CONFIG_PATH, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

export function getSystemConfigPath() {
  return SYSTEM_CONFIG_PATH;
}

export function getSystemConfig() {
  return readSystemConfigRaw();
}

export function getUserSystemConfig(uid, options = {}) {
  const normalizedUid = String(uid || "").trim();
  if (!normalizedUid) {
    return normalizeUserConfig(DEFAULT_USER_CONFIG, DEFAULT_USER_CONFIG);
  }

  const config = readSystemConfigRaw();
  const existing = config.users[normalizedUid];
  let userConfig = normalizeUserConfig(existing || {}, config.defaults);

  if (!userConfig.user_profile.username && options?.username) {
    userConfig = {
      ...userConfig,
      user_profile: {
        ...userConfig.user_profile,
        username: String(options.username || "").trim(),
      },
    };
    config.users[normalizedUid] = userConfig;
    writeSystemConfigRaw(config);
  }

  return userConfig;
}

export function updateUserSystemConfig(uid, partialConfig = {}) {
  const normalizedUid = String(uid || "").trim();
  if (!normalizedUid) {
    throw new Error("uid is required");
  }

  const config = readSystemConfigRaw();
  const current = normalizeUserConfig(config.users[normalizedUid] || {}, config.defaults);
  const next = normalizeUserConfig(
    {
      ...current,
      ...(partialConfig || {}),
      user_profile: {
        ...current.user_profile,
        ...(partialConfig?.user_profile || {}),
      },
      task_config: {
        ...current.task_config,
        ...(partialConfig?.task_config || {}),
      },
      model_policy: {
        ...current.model_policy,
        ...(partialConfig?.model_policy || {}),
      },
    },
    config.defaults
  );

  config.users[normalizedUid] = next;
  writeSystemConfigRaw(config);
  return next;
}

export function getTaskConfig(uid, options = {}) {
  return getUserSystemConfig(uid, options).task_config;
}

export function getModelPolicyConfig(uid, options = {}) {
  return getUserSystemConfig(uid, options).model_policy;
}

export function updateModelPolicyConfig(uid, policy = {}) {
  return updateUserSystemConfig(uid, { model_policy: policy }).model_policy;
}
