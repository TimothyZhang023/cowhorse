import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { runAgentTask } from "../models/agentEngine.js";
import {
  createAgentTask,
  deleteAgentTask,
  listTaskRunEvents,
  listTaskRuns,
  listAgentTasks,
  updateAgentTask,
} from "../models/database.js";

const router = Router();
router.use(authMiddleware);

router.get("/", (req, res) => {
  try {
    const tasks = listAgentTasks(req.uid);
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/runs", (req, res) => {
  try {
    const { taskId, limit } = req.query;
    const runs = listTaskRuns(req.uid, {
      taskId: taskId ? Number(taskId) : undefined,
      limit: limit ? Number(limit) : 20,
    });
    res.json(runs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/runs/:runId/events", (req, res) => {
  try {
    const events = listTaskRunEvents(Number(req.params.runId), req.uid);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", (req, res) => {
  try {
    const {
      name,
      description,
      system_prompt,
      skill_ids,
      tool_names,
      model_id,
    } = req.body;
    if (!name || !system_prompt) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const task = createAgentTask(
      req.uid,
      name,
      description,
      system_prompt,
      skill_ids,
      tool_names,
      model_id
    );
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/:id", (req, res) => {
  try {
    updateAgentTask(req.params.id, req.uid, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", (req, res) => {
  try {
    deleteAgentTask(req.params.id, req.uid);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 执行 AgentTask
router.post("/:id/run", async (req, res) => {
  try {
    const { message } = req.body;
    const result = await runAgentTask(req.uid, parseInt(req.params.id), {
      initialUserMessage: message,
      triggerSource: "manual",
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
