const REGISTRY_URL = "https://registry.modelcontextprotocol.io/v0.1/servers";
const CACHE_TTL_MS = 10 * 60 * 1000;
const PAGE_LIMIT = 50;
const MAX_PAGES = 4;

let registryCache = {
  expiresAt: 0,
  servers: [],
};

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function simplifyRegistryServer(entry) {
  const server = entry?.server || {};
  const remotes = Array.isArray(server.remotes) ? server.remotes : [];
  const remote = remotes[0] || null;
  const packages = Array.isArray(server.packages) ? server.packages : [];
  const pkg = packages[0] || null;
  const officialMeta =
    entry?._meta?.["io.modelcontextprotocol.registry/official"] || {};

  return {
    name: server.name,
    title: server.title || server.name,
    description: server.description || "",
    version: server.version || "",
    repository_url: server.repository?.url || "",
    website_url: server.websiteUrl || "",
    transport: remote?.type || "unknown",
    remote_url: remote?.url || "",
    package_identifier: pkg?.identifier || "",
    package_registry: pkg?.registryType || "",
    package_transport: pkg?.transport?.type || "",
    package_environment_variables: Array.isArray(pkg?.environmentVariables)
      ? pkg.environmentVariables
      : [],
    requires_headers: Array.isArray(remote?.headers)
      ? remote.headers.some((header) => header?.isRequired)
      : false,
    remote_headers: Array.isArray(remote?.headers) ? remote.headers : [],
    status: officialMeta.status || "unknown",
    is_latest: Boolean(officialMeta.isLatest),
  };
}

async function fetchRegistryPage(cursor) {
  const url = new URL(REGISTRY_URL);
  url.searchParams.set("limit", String(PAGE_LIMIT));
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MCP Registry 请求失败: HTTP ${response.status}`);
  }
  return response.json();
}

export async function listRegistryServers() {
  if (registryCache.expiresAt > Date.now() && registryCache.servers.length > 0) {
    return registryCache.servers;
  }

  let cursor = "";
  const collected = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await fetchRegistryPage(cursor);
    const pageServers = (Array.isArray(payload?.servers) ? payload.servers : [])
      .map(simplifyRegistryServer)
      .filter((item) => item.name && item.is_latest && item.status === "active");

    collected.push(...pageServers);

    const nextCursor = payload?.metadata?.nextCursor;
    if (!nextCursor) {
      break;
    }
    cursor = nextCursor;
  }

  registryCache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    servers: uniqueBy(collected, (item) => item.name),
  };

  return registryCache.servers;
}

export async function searchRegistryServers(queries = [], limit = 8) {
  const normalizedQueries = uniqueBy(
    (Array.isArray(queries) ? queries : [])
      .map((item) => normalizeText(item).trim())
      .filter(Boolean),
    (item) => item
  ).slice(0, 6);

  if (normalizedQueries.length === 0) {
    return [];
  }

  const registryServers = await listRegistryServers();
  const scored = registryServers
    .map((server) => {
      const haystack = normalizeText(
        [
          server.name,
          server.title,
          server.description,
          server.repository_url,
          server.website_url,
          server.transport,
        ].join(" ")
      );

      let score = 0;
      for (const query of normalizedQueries) {
        if (haystack.includes(query)) {
          score += 8;
        }

        for (const token of query.split(/[^a-z0-9\u4e00-\u9fa5]+/).filter(Boolean)) {
          if (token.length >= 2 && haystack.includes(token)) {
            score += 2;
          }
        }
      }

      if (server.transport === "stdio") {
        score += 2;
      }
      if (server.transport === "sse") {
        score += 1;
      }

      return {
        ...server,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ score, ...server }) => server);
}

export async function getRegistryServerByName(serverName) {
  const normalizedTarget = normalizeText(serverName).trim();
  if (!normalizedTarget) {
    return null;
  }

  const registryServers = await listRegistryServers();
  return (
    registryServers.find(
      (server) => normalizeText(server.name).trim() === normalizedTarget
    ) || null
  );
}
