import request from "supertest";

describe("mcp batch operations", () => {
  let app;
  let authToken;

  beforeAll(async () => {
    const { createApp } = await import("../server/app.js");
    app = createApp();
    authToken = "local-mode-token";
  });

  it("batch enables, disables, and deletes selected mcp servers", async () => {
    const serverA = await request(app)
      .post("/api/mcp")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        name: `Batch MCP A ${Date.now()}`,
        type: "stdio",
        command: "node",
        args: ["server-a.js"],
        is_enabled: 1,
      })
      .expect(200);

    const serverB = await request(app)
      .post("/api/mcp")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        name: `Batch MCP B ${Date.now()}`,
        type: "stdio",
        command: "node",
        args: ["server-b.js"],
        is_enabled: 1,
      })
      .expect(200);

    await request(app)
      .put("/api/mcp/batch/enabled")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        server_ids: [serverA.body.id, serverB.body.id],
        is_enabled: 0,
      })
      .expect(200);

    let listRes = await request(app)
      .get("/api/mcp")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    const disabledServers = listRes.body.filter((item) =>
      [serverA.body.id, serverB.body.id].includes(item.id)
    );
    expect(
      disabledServers.every((item) => Number(item.is_enabled) === 0)
    ).toBe(true);

    await request(app)
      .put("/api/mcp/batch/enabled")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        server_ids: [serverA.body.id],
        is_enabled: 1,
      })
      .expect(200);

    listRes = await request(app)
      .get("/api/mcp")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    const nextServerA = listRes.body.find((item) => item.id === serverA.body.id);
    const nextServerB = listRes.body.find((item) => item.id === serverB.body.id);
    expect(Number(nextServerA.is_enabled)).toBe(1);
    expect(Number(nextServerB.is_enabled)).toBe(0);

    await request(app)
      .delete("/api/mcp/batch")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        server_ids: [serverA.body.id, serverB.body.id],
      })
      .expect(200);

    listRes = await request(app)
      .get("/api/mcp")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    expect(
      listRes.body.some((item) =>
        [serverA.body.id, serverB.body.id].includes(item.id)
      )
    ).toBe(false);
  });
});
