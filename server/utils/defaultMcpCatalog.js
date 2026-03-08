const DEFAULT_MCP_TEMPLATES = [
  {
    id: "filesystem",
    name: "Filesystem",
    description: "访问本地目录和文件，适合文档整理、代码巡检、知识库读取。",
    category: "文件",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/workspace"],
    url: "",
    env: {},
    headers: {},
    auth: null,
    is_enabled: 0,
    needs_configuration: true,
    keywords: ["文件", "目录", "workspace", "codebase", "read", "write"],
    source_url: "https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem",
  },
  {
    id: "github",
    name: "GitHub",
    description: "访问 GitHub 仓库、Issue、PR 和代码内容。",
    category: "研发",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    url: "",
    env: {},
    headers: {},
    auth: {
      type: "bearer",
      token: "YOUR_GITHUB_TOKEN",
    },
    is_enabled: 0,
    needs_configuration: true,
    keywords: ["github", "git", "pr", "issue", "repo", "代码仓库"],
    source_url: "https://www.npmjs.com/package/@modelcontextprotocol/server-github",
  },
  {
    id: "postgres",
    name: "Postgres",
    description: "连接 PostgreSQL 数据库，执行查询和分析。",
    category: "数据",
    type: "stdio",
    command: "npx",
    args: [
      "-y",
      "@modelcontextprotocol/server-postgres",
      "postgres://user:password@host:5432/dbname",
    ],
    url: "",
    env: {},
    headers: {},
    auth: null,
    is_enabled: 0,
    needs_configuration: true,
    keywords: ["postgres", "database", "sql", "数据库", "分析"],
    source_url: "https://www.npmjs.com/package/@modelcontextprotocol/server-postgres",
  },
  {
    id: "memory",
    name: "Memory",
    description: "提供长期记忆/知识图谱能力，适合持续型 Agent。",
    category: "记忆",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    url: "",
    env: {},
    headers: {},
    auth: null,
    is_enabled: 1,
    needs_configuration: false,
    keywords: ["memory", "知识图谱", "记忆", "长期上下文"],
    source_url: "https://www.npmjs.com/package/@modelcontextprotocol/server-memory",
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    description: "用于复杂问题分解、逐步推理和长链路规划。",
    category: "推理",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    url: "",
    env: {},
    headers: {},
    auth: null,
    is_enabled: 1,
    needs_configuration: false,
    keywords: ["reasoning", "plan", "分解", "推理", "复杂任务"],
    source_url: "https://www.npmjs.com/package/@modelcontextprotocol/server-sequential-thinking",
  },
  {
    id: "everything",
    name: "Everything Demo",
    description: "官方协议能力演示服务器，适合联调和验证能力边界。",
    category: "演示",
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-everything"],
    url: "",
    env: {},
    headers: {},
    auth: null,
    is_enabled: 1,
    needs_configuration: false,
    keywords: ["demo", "测试", "调试", "everything"],
    source_url: "https://www.npmjs.com/package/@modelcontextprotocol/server-everything",
  },
];

function cloneTemplate(template) {
  return JSON.parse(JSON.stringify(template));
}

export function listDefaultMcpTemplates() {
  return DEFAULT_MCP_TEMPLATES.map(cloneTemplate);
}

export function getDefaultMcpTemplate(templateId) {
  const template = DEFAULT_MCP_TEMPLATES.find((item) => item.id === templateId);
  return template ? cloneTemplate(template) : null;
}

export function searchDefaultMcpTemplates(text, limit = 5) {
  const normalized = String(text || "").toLowerCase();
  if (!normalized) {
    return listDefaultMcpTemplates().slice(0, limit);
  }

  const scored = DEFAULT_MCP_TEMPLATES.map((template) => {
    let score = 0;
    const haystack = [
      template.name,
      template.description,
      template.category,
      ...(template.keywords || []),
    ]
      .join(" ")
      .toLowerCase();

    for (const token of normalized.split(/\s+/).filter(Boolean)) {
      if (haystack.includes(token)) {
        score += 3;
      }
    }

    if (normalized.includes(String(template.name).toLowerCase())) {
      score += 5;
    }

    return { template, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => cloneTemplate(item.template));

  return scored;
}
