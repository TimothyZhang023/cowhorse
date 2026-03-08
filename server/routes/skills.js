import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  createSkill,
  deleteSkill,
  listSkills,
  updateSkill,
} from "../models/database.js";
import { generateSkillDraft } from "../utils/skillGenerator.js";

const router = Router();
router.use(authMiddleware);

router.get("/", (req, res) => {
  try {
    const skills = listSkills(req.uid);
    res.json(skills);
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

    const result = await generateSkillDraft(req.uid, requirement);

    if (autoCreate) {
      const skill = createSkill(
        req.uid,
        result.draft.name,
        result.draft.description,
        result.draft.prompt,
        result.draft.examples,
        result.draft.tools
      );

      return res.json({
        ...result,
        skill,
      });
    }

    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.post("/", (req, res) => {
  try {
    const { name, description, prompt, examples, tools } = req.body;
    if (!name || !prompt) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const skill = createSkill(
      req.uid,
      name,
      description,
      prompt,
      examples,
      tools
    );
    res.json(skill);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/:id", (req, res) => {
  try {
    updateSkill(req.params.id, req.uid, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", (req, res) => {
  try {
    deleteSkill(req.params.id, req.uid);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
