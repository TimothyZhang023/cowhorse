import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { getOrCreateLocalUser } from "../server/models/database.js";
import {
  getSystemConfigPath,
  getTaskConfig,
  getUserSystemConfig,
  updateUserSystemConfig,
} from "../server/utils/systemConfig.js";

describe("system config json", () => {
  let app;
  let authToken;

  beforeAll(async () => {
    const { createApp } = await import("../server/app.js");
    app = createApp();
    authToken = "local-mode-token";
  });

  it("stores defaults and user config in workhorse data dir", () => {
    const user = getOrCreateLocalUser();
    const configPath = getSystemConfigPath();
    expect(configPath).toBe(
      path.join(process.env.WORKHORSE_DATA_DIR, "system-config.json")
    );

    const current = getUserSystemConfig(user.uid, { username: user.username });
    expect(current.task_config.max_turns).toBe(100);
    expect(current.task_config.max_tool_loops).toBe(100);
    expect(current.task_config.max_tool_calls_per_signature).toBe(100);

    updateUserSystemConfig(user.uid, {
      task_config: {
        max_turns: 88,
      },
    });
    const nextTaskConfig = getTaskConfig(user.uid);
    expect(nextTaskConfig.max_turns).toBe(88);
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it("persists model policy in system config json via endpoints settings api", async () => {
    const putRes = await request(app)
      .put("/api/endpoints/settings/model-policy")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        primary_model: "gpt-4.1",
        fallback_models: ["gpt-4o-mini", "gpt-4.1"],
      })
      .expect(200);

    expect(putRes.body.primary_model).toBe("gpt-4.1");
    expect(putRes.body.fallback_models).toEqual(["gpt-4o-mini"]);

    const localUser = getOrCreateLocalUser();
    const payload = JSON.parse(fs.readFileSync(getSystemConfigPath(), "utf8"));
    expect(payload.users[localUser.uid].model_policy.primary_model).toBe(
      "gpt-4.1"
    );
    expect(payload.users[localUser.uid].model_policy.fallback_models).toEqual([
      "gpt-4o-mini",
    ]);
  });
});
