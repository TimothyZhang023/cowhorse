import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

describe("conversations stop route", () => {
  let app;
  let authToken;

  beforeAll(async () => {
    const { createApp } = await import("../server/app.js");
    app = createApp();
    authToken = "local-mode-token";
  });

  it("returns a no-op result when there is no active execution", async () => {
    const createRes = await request(app)
      .post("/api/conversations")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ title: "stop-test" })
      .expect(200);

    const conversationId = String(createRes.body.id);
    const stopRes = await request(app)
      .post(`/api/conversations/${conversationId}/stop`)
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    expect(stopRes.body.success).toBe(true);
    expect(stopRes.body.stopped).toBe(false);
  });
});
