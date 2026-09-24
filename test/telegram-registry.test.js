const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const registryPath = path.resolve(__dirname, "../adapters/telegram/registry.ts");

function freshRegistryModule() {
  delete require.cache[registryPath];
  return require(registryPath);
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("ott-gateway Telegram registry", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete require.cache[registryPath];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete require.cache[registryPath];
  });

  it("get() lazily creates a client per key and caches it (same instance on repeat get)", () => {
    const { createTelegramRegistry } = freshRegistryModule();
    const registry = createTelegramRegistry({
      kane: { token: "kane-token" },
      nexus: { token: "nexus-token" },
    });

    const kaneClientFirst = registry.get("kane");
    const kaneClientSecond = registry.get("kane");
    const nexusClient = registry.get("nexus");

    assert.equal(kaneClientFirst, kaneClientSecond, "expected cached instance for the same key");
    assert.notEqual(kaneClientFirst, nexusClient, "expected distinct clients per key");
    assert.deepEqual(registry.keys().sort(), ["kane", "nexus"]);
    assert.equal(registry.has("kane"), true);
    assert.equal(registry.has("missing"), false);
  });

  it("gives each key its own rate limiter — throttling one key does not block another", async () => {
    globalThis.fetch = async () => jsonResponse(200, { ok: true, result: {} });
    const { createTelegramRegistry } = freshRegistryModule();
    const registry = createTelegramRegistry({
      kane: { token: "kane-token", rate: { globalIntervalMs: 300, channelIntervalMs: 300 } },
      nexus: { token: "nexus-token", rate: { globalIntervalMs: 300, channelIntervalMs: 300 } },
    });

    // Saturate kane's global slot (sendMessage is the path that goes through
    // the limiter's acquireSlot(); call() does not).
    await registry.get("kane").sendMessage({ chatId: "1", text: "hi" });
    // nexus has an independent limiter — should NOT wait behind kane's slot.
    const start = Date.now();
    await registry.get("nexus").sendMessage({ chatId: "1", text: "hi" });
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 150, `expected nexus call to skip kane's throttle, took ${elapsed}ms`);
  });

  it("uses a shared limiter when def.limiter is explicitly given, instead of creating one", async () => {
    const acquireCalls = [];
    const sharedLimiter = {
      acquireSlot: async (chatId) => {
        acquireCalls.push(chatId);
      },
    };
    globalThis.fetch = async () => jsonResponse(200, { ok: true, result: {} });
    const { createTelegramRegistry } = freshRegistryModule();
    const registry = createTelegramRegistry({
      kane: { token: "kane-token", limiter: sharedLimiter },
    });

    await registry.get("kane").sendMessage({ chatId: "1", text: "hi" });

    assert.deepEqual(acquireCalls, ["1"]);
  });

  it("unknown key throws 'unknown telegram bot: <key>'", () => {
    const { createTelegramRegistry } = freshRegistryModule();
    const registry = createTelegramRegistry({ kane: { token: "kane-token" } });

    assert.throws(() => registry.get("ghost"), /unknown telegram bot: ghost/);
  });

  it("supports a per-def token getter, resolved on every call", async () => {
    let currentToken = "rot-1";
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(url);
      return jsonResponse(200, { ok: true, result: {} });
    };
    const { createTelegramRegistry } = freshRegistryModule();
    const registry = createTelegramRegistry({
      kane: { token: () => currentToken },
    });

    await registry.get("kane").call("getMe");
    currentToken = "rot-2";
    await registry.get("kane").call("getMe");

    assert.match(calls[0], /\/botrot-1\//);
    assert.match(calls[1], /\/botrot-2\//);
  });
});
