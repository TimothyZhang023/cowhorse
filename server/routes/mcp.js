import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  createMcpServer,
  deleteMcpServer,
  listMcpServers,
  updateMcpServer,
} from "../models/database.js";
import {
  disconnectMcpServer,
  getAllAvailableTools,
  testMcpServerConnection,
} from "../models/mcpManager.js";
import {
  getDefaultMcpTemplate,
  listDefaultMcpTemplates,
} from "../utils/defaultMcpCatalog.js";
import {
  generateDraftFromMarketMcp,
  searchMarketMcp,
} from "../utils/mcpMarketGenerator.js";
import { generateMcpDraft } from "../utils/mcpGenerator.js";

const router = Router();
router.use(authMiddleware);

// 获取用户配置的所有 MCP Server
router.get("/", (req, res) => {
  try {
    const servers = listMcpServers(req.uid);
    res.json(servers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取所有已启用的 MCP Server 注册的 Tools
router.get("/tools", async (req, res) => {
  try {
    const tools = await getAllAvailableTools(req.uid);
    res.json(tools);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/defaults", (req, res) => {
  try {
    res.json(listDefaultMcpTemplates());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/market", async (req, res) => {
  try {
    const query = req.query?.query;
    const results = await searchMarketMcp(query, 12);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/defaults/:templateId/import", (req, res) => {
  try {
    const template = getDefaultMcpTemplate(req.params.templateId);
    if (!template) {
      return res.status(404).json({ error: "MCP 模板不存在" });
    }

    const server = createMcpServer(
      req.uid,
      template.name,
      template.type,
      template.command,
      template.args,
      template.url,
      template.is_enabled,
      template.env,
      template.headers,
      template.auth
    );

    res.json({
      template,
      server,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/market/generate", async (req, res) => {
  try {
    const serverName = req.body?.server_name || req.body?.serverName;
    const autoCreate = Boolean(
      req.body?.auto_create !== undefined
        ? req.body.auto_create
        : req.body?.autoCreate
    );

    const draft = await generateDraftFromMarketMcp(serverName);

    if (autoCreate) {
      const server = createMcpServer(
        req.uid,
        draft.name,
        draft.type,
        draft.command,
        draft.args,
        draft.url,
        draft.is_enabled,
        draft.env,
        draft.headers,
        draft.auth
      );

      return res.json({
        draft,
        server,
      });
    }

    res.json({ draft });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.post("/:id/test", async (req, res) => {
  try {
    const result = await testMcpServerConnection(req.uid, Number(req.params.id));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/generate", async (req, res) => {
  try {
    const requirement = req.body?.requirement;
    const autoCreate = Boolean(
      req.body?.auto_create !== undefined
        ? req.body.auto_create
        : req.body?.autoCreate
    );

    const result = await generateMcpDraft(req.uid, requirement);

    if (autoCreate) {
      const server = createMcpServer(
        req.uid,
        result.draft.name,
        result.draft.type,
        result.draft.command,
        result.draft.args,
        result.draft.url,
        result.draft.is_enabled,
        result.draft.env,
        result.draft.headers,
        result.draft.auth
      );

      return res.json({
        ...result,
        server,
      });
    }

    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// 添加新的 MCP Server
router.post("/", (req, res) => {
  try {
    const { name, type, command, args, url, is_enabled, env, headers, auth } =
      req.body;

    if (!name || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (type !== "stdio" && type !== "sse") {
      return res.status(400).json({ error: "Type must be stdio or sse" });
    }

    const server = createMcpServer(
      req.uid,
      name,
      type,
      command,
      args,
      url,
      is_enabled,
      env,
      headers,
      auth
    );
    res.json(server);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新 MCP Server
router.put("/:id", (req, res) => {
  try {
    const updates = req.body;
    updateMcpServer(req.params.id, req.uid, updates);
    // Drop existing connection so next call reconnects with new config
    disconnectMcpServer(req.uid, Number(req.params.id)).catch(console.error);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除 MCP Server
router.delete("/:id", (req, res) => {
  try {
    // Drop connection before deleting from DB
    disconnectMcpServer(req.uid, Number(req.params.id)).catch(console.error);
    deleteMcpServer(req.params.id, req.uid);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
