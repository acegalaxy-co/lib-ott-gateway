const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const clientPath = path.resolve(__dirname, "../adapters/telegram/client.ts");

function freshClientModule() {
  delete require.cache[clientPath];
  return require(clientPath);
}

function fakeLimiter() {
  return { acquireSlot: async () => {} };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("ott-gateway Telegram outbound client", () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;

  beforeEach(() => {
    delete require.cache[clientPath];
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete require.cache[clientPath];
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
  });

  it("sendMessage() posts to the sendMessage endpoint and returns the parsed JSON (happy path)", async () => {
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return jsonResponse(200, { ok: true, result: { message_id: 42 } });
    };
    const { createTelegramClient } = freshClientModule();
    const client = createTelegramClient({
      token: "test-token",
      apiBase: "https://api.telegram.org",
      limiter: fakeLimiter(),
    });

    const result = await client.sendMessage({ chatId: "123", text: "hello" });

    assert.equal(result.ok, true);
    assert.equal(result.result.message_id, 42);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/bottest-token\/sendMessage$/);
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.chat_id, "123");
    assert.equal(body.text, "hello");
  });

  it("retries on 429 honoring retry_after, then succeeds", async () => {
    let attempt = 0;
    globalThis.fetch = async () => {
      attempt++;
      if (attempt === 1) {
        return jsonResponse(429, { ok: false, parameters: { retry_after: 0 } });
      }
      return jsonResponse(200, { ok: true, result: { message_id: 7 } });
    };
    const { createTelegramClient } = freshClientModule();
    const client = createTelegramClient({
      token: "test-token",
      apiBase: "https://api.telegram.org",
      limiter: fakeLimiter(),
      maxRetry429: 3,
    });

    const result = await client.sendMessage({ chatId: "123", text: "retry me" });

    assert.equal(attempt, 2);
    assert.equal(result.ok, true);
    assert.equal(result.result.message_id, 7);
  });

  it("throws on a persistent 5xx (no retry — 429 is the only retried status)", async () => {
    globalThis.fetch = async () => jsonResponse(503, { ok: false, description: "Service Unavailable" });
    const { createTelegramClient } = freshClientModule();
    const client = createTelegramClient({
      token: "test-token",
      apiBase: "https://api.telegram.org",
      limiter: fakeLimiter(),
    });

    await assert.rejects(
      () => client.sendMessage({ chatId: "123", text: "hi" }),
      /telegram 503/
    );
  });

  it("propagates a network error (fetch rejects)", async () => {
    globalThis.fetch = async () => {
      throw new Error("ECONNRESET");
    };
    const { createTelegramClient } = freshClientModule();
    const client = createTelegramClient({
      token: "test-token",
      apiBase: "https://api.telegram.org",
      limiter: fakeLimiter(),
    });

    await assert.rejects(
      () => client.sendMessage({ chatId: "123", text: "hi" }),
      /ECONNRESET/
    );
  });

  it("throws a clear error when no token is available (option nor env)", async () => {
    globalThis.fetch = async () => {
      throw new Error("fetch should not be called when token is missing");
    };
    const { createTelegramClient } = freshClientModule();
    const client = createTelegramClient({ apiBase: "https://api.telegram.org", limiter: fakeLimiter() });

    await assert.rejects(
      () => client.sendMessage({ chatId: "123", text: "hi" }),
      /TELEGRAM_BOT_TOKEN not set/
    );
  });

  it("falls back to TELEGRAM_BOT_TOKEN env var when no token option is passed", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "env-token";
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(url);
      return jsonResponse(200, { ok: true, result: { message_id: 1 } });
    };
    const { createTelegramClient } = freshClientModule();
    const client = createTelegramClient({ apiBase: "https://api.telegram.org", limiter: fakeLimiter() });

    await client.sendMessage({ chatId: "123", text: "hi" });

    assert.match(calls[0], /\/botenv-token\/sendMessage$/);
  });

  it("an explicit token option overrides the TELEGRAM_BOT_TOKEN env var", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "env-token";
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(url);
      return jsonResponse(200, { ok: true, result: { message_id: 1 } });
    };
    const { createTelegramClient } = freshClientModule();
    const client = createTelegramClient({
      token: "opt-token",
      apiBase: "https://api.telegram.org",
      limiter: fakeLimiter(),
    });

    await client.sendMessage({ chatId: "123", text: "hi" });

    assert.match(calls[0], /\/botopt-token\/sendMessage$/);
  });

  it("sendText() splits long text into multiple chunks and sends each in order", async () => {
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push(JSON.parse(opts.body));
      return jsonResponse(200, { ok: true, result: { message_id: calls.length } });
    };
    const { createTelegramClient } = freshClientModule();
    const client = createTelegramClient({
      token: "test-token",
      apiBase: "https://api.telegram.org",
      maxLen: 20,
      limiter: fakeLimiter(),
    });

    const longText = "line one\nline two\nline three\nline four";
    const lastJson = await client.sendText(longText, "123");

    assert.ok(calls.length > 1, "expected text to be split into multiple chunks");
    assert.equal(lastJson.result.message_id, calls.length);
    const seen = calls.map((c) => c.text).join("\n");
    assert.ok(seen.includes("line one"));
    assert.ok(seen.includes("line four"));
  });

  it("sendText() applies the beforeSend hook to the whole text before splitting", async () => {
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push(JSON.parse(opts.body));
      return jsonResponse(200, { ok: true, result: { message_id: calls.length } });
    };
    const { createTelegramClient } = freshClientModule();
    const client = createTelegramClient({
      token: "test-token",
      apiBase: "https://api.telegram.org",
      limiter: fakeLimiter(),
      beforeSend: (text) => `[tag] ${text}`,
    });

    await client.sendText("hello", "123");

    assert.equal(calls[0].text, "[tag] hello");
  });

  it("editMessageText() throws a descriptive error on non-ok HTTP response", async () => {
    globalThis.fetch = async () => jsonResponse(400, { ok: false, description: "Bad Request: message not found" });
    const { createTelegramClient } = freshClientModule();
    const client = createTelegramClient({
      token: "test-token",
      apiBase: "https://api.telegram.org",
      limiter: fakeLimiter(),
    });

    await assert.rejects(
      () => client.editMessageText("123", 999, "new text"),
      /Telegram editMessageText error: 400/
    );
  });
});
