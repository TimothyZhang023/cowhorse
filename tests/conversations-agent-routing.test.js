import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

const streamConversationAgentMock = vi.fn();

vi.mock("../server/models/agentConversation.js", async () => {
  const actual = await vi.importActual("../server/models/agentConversation.js");
  return {
    ...actual,
    streamConversationAgent: streamConversationAgentMock,
  };
});

describe("conversation agent routing", () => {
  let app;
  let authToken;

  beforeAll(async () => {
    const { createApp } = await import("../server/app.js");
    app = createApp();
    authToken = "local-mode-token";
  });

  it("passes conversation tool restrictions into the agent runtime", async () => {
    streamConversationAgentMock.mockResolvedValueOnce("runtime result");

    const createRes = await request(app)
      .post("/api/conversations")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        title: "agent runtime tools",
        tool_names: ["shell_execute"],
      })
      .expect(200);

    const conversationId = String(createRes.body.id);

    await request(app)
      .post(`/api/conversations/${conversationId}/chat`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ message: "hello runtime" })
      .expect(200);

    expect(streamConversationAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId,
        allowedToolNames: ["shell_execute"],
      })
    );
  });
});
