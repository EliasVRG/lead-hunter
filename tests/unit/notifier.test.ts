import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createNotifier } from "@lead-hunter/notifier";

describe("createNotifier", () => {
  it("returns a no-op notifier when disabled", async () => {
    const notifier = createNotifier({ driver: "none", webhookUrl: "" });
    expect(notifier.driver).toBe("none");
    await expect(notifier.send({ title: "x", body: "y" })).resolves.toBeUndefined();
  });

  it("falls back to no-op when the webhook driver has no URL", () => {
    // Melhor não notificar do que estourar a cada vaga aprovada por config
    // incompleta.
    expect(createNotifier({ driver: "webhook", webhookUrl: "" }).driver).toBe("none");
  });

  it("selects the webhook driver when a URL is set", () => {
    expect(createNotifier({ driver: "webhook", webhookUrl: "https://x.test/h" }).driver).toBe(
      "webhook",
    );
  });
});

describe("webhook notifier", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("posts a flattened `text` field alongside the structured payload", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await createNotifier({ driver: "webhook", webhookUrl: "https://x.test/h" }).send({
      title: "Vaga compatível (82)",
      body: "Skills: Node.js",
      url: "https://99freelas.com.br/project/x-1",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://x.test/h");
    const payload = JSON.parse(init.body);
    // Slack, Discord e Telegram leem `text`; os campos soltos ficam para quem
    // consome o payload estruturado.
    expect(payload.text).toBe(
      "Vaga compatível (82)\nSkills: Node.js\nhttps://99freelas.com.br/project/x-1",
    );
    expect(payload.title).toBe("Vaga compatível (82)");
  });

  it("omits a missing url from the flattened text", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await createNotifier({ driver: "webhook", webhookUrl: "https://x.test/h" }).send({
      title: "t",
      body: "b",
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).toBe("t\nb");
  });

  it("throws on a non-2xx response so the caller can log it", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(
      createNotifier({ driver: "webhook", webhookUrl: "https://x.test/h" }).send({
        title: "t",
        body: "b",
      }),
    ).rejects.toThrow("webhook responded 500");
  });
});

/**
 * Quem chama `notifyQuietly` está num job cujo resultado já foi persistido.
 * Propagar a falha marcaria o job como falho e provocaria retry — reprocessando
 * a vaga e gastando cota de IA de novo por causa de um aviso.
 */
describe("notifyQuietly", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("swallows a failing send and reports false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );
    vi.doMock("@lead-hunter/config/notifier.js", () => ({
      notifierConfig: { driver: "webhook", webhookUrl: "https://x.test/h" },
    }));

    const { notifyQuietly } = await import("@lead-hunter/notifier");
    await expect(notifyQuietly({ title: "t", body: "b" })).resolves.toBe(false);
  });

  it("reports false without sending when the driver is none", async () => {
    vi.doMock("@lead-hunter/config/notifier.js", () => ({
      notifierConfig: { driver: "none", webhookUrl: "" },
    }));

    const { notifyQuietly } = await import("@lead-hunter/notifier");
    await expect(notifyQuietly({ title: "t", body: "b" })).resolves.toBe(false);
  });

  it("reports true when the send succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    vi.doMock("@lead-hunter/config/notifier.js", () => ({
      notifierConfig: { driver: "webhook", webhookUrl: "https://x.test/h" },
    }));

    const { notifyQuietly } = await import("@lead-hunter/notifier");
    await expect(notifyQuietly({ title: "t", body: "b" })).resolves.toBe(true);
  });
});
