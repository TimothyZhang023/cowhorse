import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.mock("node-fetch", () => ({
  default: fetchMock,
}));

async function loadUpdateChecker() {
  vi.resetModules();
  return import("../server/services/updateChecker.js");
}

describe("updateChecker", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("checks the renamed GitHub repository for the latest release", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: "v99.0.0",
        html_url:
          "https://github.com/TimothyZhang023/workhorse/releases/tag/v99.0.0",
      }),
    });

    const { checkUpdate } = await loadUpdateChecker();
    const status = await checkUpdate();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/TimothyZhang023/workhorse/releases/latest",
      expect.objectContaining({
        headers: { Accept: "application/vnd.github.v3+json" },
      })
    );
    expect(status).toEqual(
      expect.objectContaining({
        hasUpdate: true,
        latestVersion: "99.0.0",
        releaseUrl:
          "https://github.com/TimothyZhang023/workhorse/releases/tag/v99.0.0",
      })
    );
    expect(status.checkTime).toEqual(expect.any(String));
  });

  it("only triggers one startup check even if started multiple times", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: "v2.0.1",
        html_url:
          "https://github.com/TimothyZhang023/workhorse/releases/tag/v2.0.1",
      }),
    });

    const { startUpdateChecker } = await loadUpdateChecker();
    startUpdateChecker();
    startUpdateChecker();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
