import request from "supertest";

describe("conversation tool settings", () => {
  let app;
  let authToken;

  beforeAll(async () => {
    const { createApp } = await import("../server/app.js");
    app = createApp();

    authToken = "local-mode-token";
  });

  it("persists per-conversation tool selection", async () => {
    const createRes = await request(app)
      .post("/api/conversations")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ title: "工具选择测试" })
      .expect(200);

    const conversationId = String(createRes.body.id);

    await request(app)
      .put(`/api/conversations/${conversationId}`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ tool_names: ["github_search_repositories", "postgres_query"] })
      .expect(200);

    const listRes = await request(app)
      .get("/api/conversations")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    const updatedConversation = listRes.body.find(
      (item) => String(item.id) === conversationId
    );

    expect(updatedConversation).toBeTruthy();
    expect(updatedConversation.tool_names).toEqual([
      "github_search_repositories",
      "postgres_query",
    ]);
  });

  it("supports resetting conversation tool selection to all tools", async () => {
    const createRes = await request(app)
      .post("/api/conversations")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        title: "全部工具测试",
        tool_names: ["filesystem_read_file"],
      })
      .expect(200);

    const conversationId = String(createRes.body.id);

    await request(app)
      .put(`/api/conversations/${conversationId}`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ tool_names: null })
      .expect(200);

    const listRes = await request(app)
      .get("/api/conversations")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    const updatedConversation = listRes.body.find(
      (item) => String(item.id) === conversationId
    );

    expect(updatedConversation).toBeTruthy();
    expect(updatedConversation.tool_names).toBeNull();
  });

  it("persists conversation-level context window settings", async () => {
    const createRes = await request(app)
      .post("/api/conversations")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        title: "上下文窗口测试",
        context_window: 65536,
      })
      .expect(200);

    const conversationId = String(createRes.body.id);
    expect(createRes.body.context_window).toBe(65536);

    await request(app)
      .put(`/api/conversations/${conversationId}`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ context_window: 131072 })
      .expect(200);

    const listRes = await request(app)
      .get("/api/conversations")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    const updatedConversation = listRes.body.find(
      (item) => String(item.id) === conversationId
    );

    expect(updatedConversation).toBeTruthy();
    expect(updatedConversation.context_window).toBe(131072);
  });
});
