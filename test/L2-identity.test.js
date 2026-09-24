const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const resolverPath = path.resolve(__dirname, "../identity/resolver.ts");

const ENV_KEYS = [
  "OTT_IDENTITY_MODE",
  "OTT_IDENTITY_MAP",
  "OTT_LIVE_TELEGRAM_TOKEN",
  "OTT_LIVE_COMPANY_GROUP",
  "OTT_LIVE_ROLE_MAP",
];

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

function freshResolver() {
  delete require.cache[resolverPath];
  return require(resolverPath);
}

async function captureWarn(fn) {
  const originalWarn = console.warn;
  const calls = [];
  console.warn = (...args) => calls.push(args.join(" "));
  try {
    const result = await fn();
    return { result, calls };
  } finally {
    console.warn = originalWarn;
  }
}

describe("ott-gateway L2 identity resolver", () => {
  const originalEnv = snapshotEnv();
  const originalFetch = global.fetch;

  beforeEach(() => {
    restoreEnv(Object.fromEntries(ENV_KEYS.map((key) => [key, undefined])));
    global.fetch = undefined;
    delete require.cache[resolverPath];
  });

  afterEach(() => {
    restoreEnv(originalEnv);
    global.fetch = originalFetch;
    delete require.cache[resolverPath];
  });

  it("resolveIdentity() static mode returns a known identity from OTT_IDENTITY_MAP", async () => {
    process.env.OTT_IDENTITY_MODE = "static";
    process.env.OTT_IDENTITY_MAP = JSON.stringify({
      "telegram:123": { id: "user-alice", roles: ["admin", "viewer"] },
    });
    const { resolveIdentity } = freshResolver();

    const identity = await resolveIdentity("123", "telegram");

    assert.deepEqual(identity, { id: "user-alice", roles: ["admin", "viewer"] });
  });

  it("resolveIdentity() static mode returns null for an unknown identity", async () => {
    process.env.OTT_IDENTITY_MODE = "static";
    process.env.OTT_IDENTITY_MAP = JSON.stringify({
      "telegram:123": { id: "user-alice", roles: ["admin"] },
    });
    const { resolveIdentity } = freshResolver();

    const identity = await resolveIdentity("999", "telegram");

    assert.equal(identity, null);
  });

  it("resolveIdentity() static mode warns and returns null on invalid OTT_IDENTITY_MAP JSON", async () => {
    process.env.OTT_IDENTITY_MODE = "static";
    process.env.OTT_IDENTITY_MAP = "{not-json";
    const { resolveIdentity } = freshResolver();

    const { result, calls } = await captureWarn(() => resolveIdentity("123", "telegram"));

    assert.equal(result, null);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /OTT_IDENTITY_MAP parse error/);
  });

  it("resolveIdentity() live mode resolves Telegram members to viewer identities", async () => {
    process.env.OTT_IDENTITY_MODE = "live";
    process.env.OTT_LIVE_TELEGRAM_TOKEN = "bot-token";
    process.env.OTT_LIVE_COMPANY_GROUP = "-10042";
    const calls = [];
    global.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return {
        json: async () => ({ ok: true, result: { status: "member" } }),
      };
    };
    const { resolveIdentity } = freshResolver();

    const identity = await resolveIdentity("123", "telegram");

    assert.deepEqual(identity, { id: "tg-123", roles: ["viewer"] });
    assert.equal(calls.length, 1);
    assert.match(String(calls[0].url), /getChatMember/);
    assert.ok(calls[0].opts.signal);
  });

  it("resolveIdentity() live mode returns null for users that left or were kicked", async () => {
    process.env.OTT_IDENTITY_MODE = "live";
    process.env.OTT_LIVE_TELEGRAM_TOKEN = "bot-token";
    process.env.OTT_LIVE_COMPANY_GROUP = "-10042";
    const statuses = ["left", "kicked"];
    let fetchCount = 0;
    global.fetch = async () => ({
      json: async () => ({ ok: true, result: { status: statuses[fetchCount++] } }),
    });
    const { resolveIdentity } = freshResolver();

    assert.equal(await resolveIdentity("123", "telegram"), null);
    assert.equal(await resolveIdentity("456", "telegram"), null);
    assert.equal(fetchCount, 2);
  });

  it("resolveIdentity() live mode warns and returns null when token or chatId is missing", async () => {
    process.env.OTT_IDENTITY_MODE = "live";
    const { resolveIdentity } = freshResolver();

    const { result, calls } = await captureWarn(() => resolveIdentity("123", "telegram"));

    assert.equal(result, null);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /missing token\/chatId/);
  });

  it("resolveIdentity() live mode returns null on API timeout via AbortController", async () => {
    process.env.OTT_IDENTITY_MODE = "live";
    process.env.OTT_LIVE_TELEGRAM_TOKEN = "bot-token";
    process.env.OTT_LIVE_COMPANY_GROUP = "-10042";
    global.fetch = async (_url, opts) => {
      assert.ok(opts.signal);
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      throw error;
    };
    const { resolveIdentity } = freshResolver();

    const { result } = await captureWarn(() => resolveIdentity("123", "telegram"));

    assert.equal(result, null);
  });

  it("resolveIdentity() hybrid mode falls back to static identity after a live miss", async () => {
    process.env.OTT_IDENTITY_MODE = "hybrid";
    process.env.OTT_IDENTITY_MAP = JSON.stringify({
      "telegram:123": { id: "user-fallback", roles: ["operator"] },
    });
    process.env.OTT_LIVE_TELEGRAM_TOKEN = "bot-token";
    process.env.OTT_LIVE_COMPANY_GROUP = "-10042";
    global.fetch = async () => ({
      json: async () => ({ ok: true, result: { status: "left" } }),
    });
    const { resolveIdentity } = freshResolver();

    const identity = await resolveIdentity("123", "telegram");

    assert.deepEqual(identity, { id: "user-fallback", roles: ["operator"] });
  });

  it("resolveIdentity() negative cache skips the second live deny inside 10 seconds", async () => {
    process.env.OTT_IDENTITY_MODE = "live";
    process.env.OTT_LIVE_TELEGRAM_TOKEN = "bot-token";
    process.env.OTT_LIVE_COMPANY_GROUP = "-10042";
    let fetchCount = 0;
    global.fetch = async () => {
      fetchCount += 1;
      return {
        json: async () => ({ ok: true, result: { status: "kicked" } }),
      };
    };
    const { resolveIdentity } = freshResolver();

    assert.equal(await resolveIdentity("123", "telegram"), null);
    assert.equal(await resolveIdentity("123", "telegram"), null);
    assert.equal(fetchCount, 1);
  });
});
