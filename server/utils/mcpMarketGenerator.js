import { createHttpError } from "./aiGeneration.js";
import { getRegistryServerByName, searchRegistryServers } from "./mcpRegistry.js";

function sanitizeText(value) {
  return String(value || "").trim();
}

function toPlaceholderKey(key) {
  return sanitizeText(key)
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function normalizeEnvVars(items) {
  return (Array.isArray(items) ? items : []).reduce((acc, item) => {
    const key = sanitizeText(item?.name);
    if (!key) {
      return acc;
    }
    acc[key] = item?.isSecret ? `YOUR_${toPlaceholderKey(key)}` : "";
    return acc;
  }, {});
}

function normalizeRemoteHeaders(items) {
  return (Array.isArray(items) ? items : []).reduce((acc, item) => {
    const key = sanitizeText(item?.name);
    if (!key) {
      return acc;
    }
    acc[key] = item?.isSecret ? `YOUR_${toPlaceholderKey(key)}` : "";
    return acc;
  }, {});
}

export function buildMcpDraftFromRegistryServer(server) {
  if (!server) {
    throw createHttpError(404, "未找到对应的市场 MCP");
  }

  const packageIdentifier = sanitizeText(server.package_identifier);
  const remoteUrl = sanitizeText(server.remote_url);
  const title = sanitizeText(server.title) || sanitizeText(server.name);

  if (packageIdentifier) {
    return {
      name: title,
      type: "stdio",
      command: "npx",
      args: ["-y", packageIdentifier],
      url: "",
      env: normalizeEnvVars(server.package_environment_variables),
      headers: {},
      auth: null,
      is_enabled: 0,
      market_source: server,
    };
  }

  if (remoteUrl) {
    const headers = normalizeRemoteHeaders(server.remote_headers);
    return {
      name: title,
      type: "sse",
      command: "",
      args: [],
      url: remoteUrl,
      env: {},
      headers,
      auth: null,
      is_enabled: 0,
      market_source: server,
    };
  }

  throw createHttpError(400, "该市场 MCP 暂无可自动生成的接入方式");
}

export async function searchMarketMcp(query, limit = 12) {
  const normalized = sanitizeText(query);
  if (!normalized) {
    return [];
  }
  return searchRegistryServers([normalized], limit);
}

export async function generateDraftFromMarketMcp(serverName) {
  const server = await getRegistryServerByName(serverName);
  return buildMcpDraftFromRegistryServer(server);
}
