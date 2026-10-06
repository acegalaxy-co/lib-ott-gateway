const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { formatServiceAlert, sendServiceAlert } = require("../service-alert.ts");

describe("service-alert", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("formats [Env][Project] [icon status] Service header, title, fields and detail", () => {
    const text = formatServiceAlert({
      service: "seo-google-daily",
      status: "fail",
      title: "Daily report",
      host: "Mac255",
      project: "Crawler",
      fields: { exit: 1, skipped: undefined },
      detail: "line1\nline2",
    });
    assert.equal(text, "[Mac255][Crawler] [❌ fail] Service seo-google-daily\nDaily report\nexit: 1\n---\nline1\nline2");
  });

  it("queued status, no project bracket when project empty", () => {
    const text = formatServiceAlert({ service: "nhadathue-tiktok", status: "queued", title: "", host: "Mac255" });
    assert.equal(text, "[Mac255] [⏳ queued] Service nhadathue-tiktok");
  });

  it("caps long text at 3500 chars", () => {
    const text = formatServiceAlert({ service: "s", status: "ok", title: "t", detail: "x".repeat(5000) });
    assert.equal(text.length, 3500);
    assert.ok(text.endsWith("…"));
  });

  it("no-op when token/chat missing", async () => {
    let called = false;
    globalThis.fetch = async () => ((called = true), new Response("{}"));
    const r = await sendServiceAlert({ service: "s", status: "ok", title: "t" }, { env: {} });
    assert.equal(r.sent, false);
    assert.equal(called, false);
  });

  it("sends via env fallback and never leaks token on error", async () => {
    let body;
    globalThis.fetch = async (_url, init) => ((body = JSON.parse(init.body)), new Response("{}", { status: 200 }));
    const env = { NEXUS_TELEGRAM_BOT_TOKEN: "tok-secret-1", NEXUS_TELEGRAM_CHANNEL_STATUS_ALERT: "chat1", HOST_LABEL: "Mac255" };
    const ok = await sendServiceAlert({ service: "s", status: "ok", title: "t" }, { env });
    assert.equal(ok.sent, true);
    assert.equal(body.chat_id, "chat1");
    assert.ok(body.text.startsWith("[Mac255] [✅ ok] Service s"));

    globalThis.fetch = async () => {
      throw new Error("connect failed https://api.telegram.org/bottok-secret-1/sendMessage");
    };
    const bad = await sendServiceAlert({ service: "s", status: "fail", title: "t" }, { env });
    assert.equal(bad.sent, false);
    assert.ok(!bad.reason.includes("tok-secret-1"));
  });
});
