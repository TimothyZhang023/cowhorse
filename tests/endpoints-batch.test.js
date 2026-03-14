import request from "supertest";

describe("endpoint model batch updates", () => {
  let app;
  let authToken;

  beforeAll(async () => {
    const { createApp } = await import("../server/app.js");
    app = createApp();
    authToken = "local-mode-token";
  });

  it("batch enables and disables selected endpoint models", async () => {
    const endpointRes = await request(app)
      .post("/api/endpoints")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        name: `Batch Endpoint ${Date.now()}`,
        provider: "openai_compatible",
        base_url: "https://api.example.com/v1",
        api_key: "sk-test",
        use_preset_models: false,
      })
      .expect(200);

    const endpointId = Number(endpointRes.body.id);

    const modelARes = await request(app)
      .post(`/api/endpoints/${endpointId}/models`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        model_id: "batch-model-a",
        display_name: "Batch Model A",
        is_enabled: 0,
      })
      .expect(200);

    const modelBRes = await request(app)
      .post(`/api/endpoints/${endpointId}/models`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        model_id: "batch-model-b",
        display_name: "Batch Model B",
        is_enabled: 0,
      })
      .expect(200);

    await request(app)
      .put(`/api/endpoints/${endpointId}/models/batch`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        model_ids: [modelARes.body.id, modelBRes.body.id],
        is_enabled: 1,
      })
      .expect(200);

    let modelsRes = await request(app)
      .get(`/api/endpoints/${endpointId}/models`)
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    expect(modelsRes.body.every((item) => Number(item.is_enabled) === 1)).toBe(
      true
    );

    await request(app)
      .put(`/api/endpoints/${endpointId}/models/batch`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        model_ids: [modelARes.body.id],
        is_enabled: 0,
      })
      .expect(200);

    modelsRes = await request(app)
      .get(`/api/endpoints/${endpointId}/models`)
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    const modelA = modelsRes.body.find((item) => item.id === modelARes.body.id);
    const modelB = modelsRes.body.find((item) => item.id === modelBRes.body.id);
    expect(Number(modelA.is_enabled)).toBe(0);
    expect(Number(modelB.is_enabled)).toBe(1);
  });
});
