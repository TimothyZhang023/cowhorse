import request from "supertest";

describe("skills batch operations", () => {
  let app;
  let authToken;

  beforeAll(async () => {
    const { createApp } = await import("../server/app.js");
    app = createApp();
    authToken = "local-mode-token";
  });

  it("batch enables, disables, and deletes selected skills", async () => {
    const skillA = await request(app)
      .post("/api/skills")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        name: `Skill A ${Date.now()}`,
        prompt: "这是一个用于批量测试的 skill prompt。",
      })
      .expect(200);

    const skillB = await request(app)
      .post("/api/skills")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        name: `Skill B ${Date.now()}`,
        prompt: "这是另一个用于批量测试的 skill prompt。",
      })
      .expect(200);

    await request(app)
      .put("/api/skills/batch/enabled")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        skill_ids: [skillA.body.id, skillB.body.id],
        is_enabled: 0,
      })
      .expect(200);

    let listRes = await request(app)
      .get("/api/skills")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    const disabledSkills = listRes.body.filter((item) =>
      [skillA.body.id, skillB.body.id].includes(item.id)
    );
    expect(disabledSkills.every((item) => Number(item.is_enabled) === 0)).toBe(
      true
    );

    await request(app)
      .put("/api/skills/batch/enabled")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        skill_ids: [skillA.body.id],
        is_enabled: 1,
      })
      .expect(200);

    listRes = await request(app)
      .get("/api/skills")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    const nextSkillA = listRes.body.find((item) => item.id === skillA.body.id);
    const nextSkillB = listRes.body.find((item) => item.id === skillB.body.id);
    expect(Number(nextSkillA.is_enabled)).toBe(1);
    expect(Number(nextSkillB.is_enabled)).toBe(0);

    await request(app)
      .delete("/api/skills/batch")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        skill_ids: [skillA.body.id, skillB.body.id],
      })
      .expect(200);

    listRes = await request(app)
      .get("/api/skills")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    expect(
      listRes.body.some((item) =>
        [skillA.body.id, skillB.body.id].includes(item.id)
      )
    ).toBe(false);
  });
});
