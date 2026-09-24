const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const gatewayPath = path.resolve(__dirname, "../index.ts");
const adapterPath = path.resolve(__dirname, "../adapters/telegram.ts");
const resolverPath = path.resolve(__dirname, "../identity/resolver.ts");
const authzPath = path.resolve(__dirname, "../authz/engine.ts");
const limiterPath = path.resolve(__dirname, "../rate-limit/limiter.ts");
const replayGuardPath = path.resolve(__dirname, "../rate-limit/replay-guard.ts");
const auditPath = path.resolve(__dirname, "../audit/logger.ts");
const policyPath = path.resolve(__dirname, "../authz/policies/telegram.json");

const ENV_KEYS = [
  "TELEGRAM_WEBHOOK_SECRET",
  "OTT_TELEGRAM_ALLOW_UNSIGNED",
  "OTT_IDENTITY_MODE",
  "OTT_IDENTITY_MAP",
  "OTT_AUDIT_LOG_PATH",
  "OTT_LIVE_TELEGRAM_TOKEN",
  "OTT_LIVE_COMPANY_GROUP",
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

function clearGatewayModules() {
  for (const modulePath of [
    gatewayPath,
    adapterPath,
    resolverPath,
    authzPath,
    limiterPath,
    replayGuardPath,
    auditPath,
    policyPath,
  ]) {
    delete require.cache[modulePath];
  }
}

function installStub(modulePath, exports) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
}

function freshGateway(stubs = {}) {
  clearGatewayModules();
  for (const [modulePath, exports] of Object.entries(stubs)) {
    installStub(modulePath, exports);
  }
  return require(gatewayPath);
}

function headers(token = "secret-token") {
  return { "x-telegram-bot-api-secret-token": token };
}

function update({ messageId = "1", userId = "123", chatId = "-10042", text = "/status" } = {}) {
  return {
    update_id: Number(messageId) || 1,
    message: {
      message_id: messageId,
      from: { id: userId },
      chat: { id: chatId },
      text,
    },
  };
}

function setStaticIdentityMap(map) {
  process.env.OTT_IDENTITY_MODE = "static";
  process.env.OTT_IDENTITY_MAP = JSON.stringify(map);
}

function readAuditRecords(logPath) {
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("ott-gateway dispatchInbound", () => {
  const originalEnv = snapshotEnv();
  const originalNow = Date.now;
  const originalError = console.error;
  let tempDir;
  let logPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ott-dispatch-audit-"));
    logPath = path.join(tempDir, "audit.log");
    restoreEnv(Object.fromEntries(ENV_KEYS.map((key) => [key, undefined])));
    process.env.TELEGRAM_WEBHOOK_SECRET = "secret-token";
    process.env.OTT_AUDIT_LOG_PATH = logPath;
    clearGatewayModules();
  });

  afterEach(() => {
    Date.now = originalNow;
    console.error = originalError;
    restoreEnv(originalEnv);
    clearGatewayModules();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("happy path passes all five layers and returns allow with message and identity", async () => {
    let now = 1000;
    Date.now = () => now++;
    setStaticIdentityMap({
      "telegram:123": { id: "user-123", roles: ["admin"] },
    });
    const { dispatchInbound } = freshGateway();

    const result = await dispatchInbound(update({ messageId: "101" }), "telegram", headers());

    assert.equal(result.outcome, "allow");
    assert.equal(result.denyReason, null);
    assert.ok(result.latencyMs > 0);
    assert.equal(result.message.messageId, "101");
    assert.deepEqual(result.identity, { id: "user-123", roles: ["admin"] });
  });

  it("denies at L1 for an invalid signature", async () => {
    setStaticIdentityMap({
      "telegram:123": { id: "user-123", roles: ["admin"] },
    });
    const { dispatchInbound } = freshGateway();

    const result = await dispatchInbound(update({ messageId: "102" }), "telegram", headers("wrong"));

    assert.equal(result.outcome, "deny");
    assert.equal(result.denyReason, "L1_signature");
  });

  it("denies at L2 for an unknown identity", async () => {
    setStaticIdentityMap({});
    const { dispatchInbound } = freshGateway();

    const result = await dispatchInbound(update({ messageId: "103" }), "telegram", headers());

    assert.equal(result.outcome, "deny");
    assert.equal(result.denyReason, "L2_unknown_identity");
  });

  it("denies at L3 when authz rejects the identity role", async () => {
    setStaticIdentityMap({
      "telegram:123": { id: "user-123", roles: ["viewer"] },
    });
    const { dispatchInbound } = freshGateway();

    const result = await dispatchInbound(update({ messageId: "104" }), "telegram", headers());

    assert.equal(result.outcome, "deny");
    assert.equal(result.denyReason, "L3_authz");
  });

  it("denies at L4 when replayGuard detects a duplicate message", async () => {
    setStaticIdentityMap({
      "telegram:123": { id: "user-123", roles: ["admin"] },
    });
    const { dispatchInbound } = freshGateway();
    const raw = update({ messageId: "105" });

    assert.equal((await dispatchInbound(raw, "telegram", headers())).outcome, "allow");
    const result = await dispatchInbound(raw, "telegram", headers());

    assert.equal(result.outcome, "deny");
    assert.equal(result.denyReason, "L4_replay");
  });

  it("denies at L4 when the rate limit is exceeded", async () => {
    Date.now = () => 1000;
    setStaticIdentityMap({
      "telegram:123": { id: "user-123", roles: ["admin"] },
    });
    const { dispatchInbound } = freshGateway();
    let result;

    for (let i = 0; i < 31; i += 1) {
      result = await dispatchInbound(update({ messageId: `rate-${i}` }), "telegram", headers());
    }

    assert.equal(result.outcome, "deny");
    assert.equal(result.denyReason, "L4_rate_limit");
  });

  it("catches adapter.parse exceptions, returns deny, and logs to console", async () => {
    const errors = [];
    console.error = (...args) => errors.push(args.join(" "));
    const auditRecords = [];
    class ThrowingAdapter {
      async verify() {
        return true;
      }

      async parse() {
        throw new Error("parse boom");
      }
    }
    const { dispatchInbound } = freshGateway({
      [adapterPath]: { TelegramAdapter: ThrowingAdapter },
      [auditPath]: { record: async (record) => auditRecords.push(record), LOG_PATH: "stub" },
    });

    const result = await dispatchInbound(update({ messageId: "106" }), "telegram", headers());

    assert.equal(result.outcome, "deny");
    assert.equal(result.denyReason, "L1_signature");
    assert.equal(auditRecords.length, 1);
    assert.match(errors.join("\n"), /adapter\.parse failed/);
  });

  it("writes L5 audit records for both allow and deny outcomes", async () => {
    setStaticIdentityMap({
      "telegram:123": { id: "user-123", roles: ["admin"] },
    });
    const { dispatchInbound } = freshGateway();

    await dispatchInbound(update({ messageId: "107", userId: "123" }), "telegram", headers());
    process.env.OTT_IDENTITY_MAP = JSON.stringify({});
    await dispatchInbound(update({ messageId: "108", userId: "999" }), "telegram", headers());

    const records = readAuditRecords(logPath);
    assert.deepEqual(records.map((record) => record.outcome), ["allow", "deny"]);
    assert.deepEqual(records.map((record) => record.denyReason), [null, "L2_unknown_identity"]);
  });

  it("measures latencyMs from dispatch start to _finalize", async () => {
    const auditRecords = [];
    let index = 0;
    const times = [1000, 1123];
    Date.now = () => times[index++] ?? 1123;
    class PassingAdapter {
      async verify() {
        return true;
      }

      async parse() {
        return {
          messageId: "latency-1",
          platformUserId: "123",
          command: "/status",
        };
      }
    }
    const { dispatchInbound } = freshGateway({
      [adapterPath]: { TelegramAdapter: PassingAdapter },
      [resolverPath]: { resolveIdentity: async () => ({ id: "user-123", roles: ["admin"] }) },
      [authzPath]: { check: async () => ({ allow: true }) },
      [replayGuardPath]: { seen: async () => false },
      [limiterPath]: { check: async () => true },
      [auditPath]: { record: async (record) => auditRecords.push({ ...record }), LOG_PATH: "stub" },
    });

    const result = await dispatchInbound(update({ messageId: "109" }), "telegram", headers());

    assert.equal(result.outcome, "allow");
    assert.equal(result.latencyMs, 123);
    assert.equal(auditRecords[0].latencyMs, 123);
  });

  it("denies with L1_signature when no webhook secret is configured and no unsigned opt-in", async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.OTT_TELEGRAM_ALLOW_UNSIGNED;
    clearGatewayModules();
    const { dispatchInbound } = freshGateway();

    const result = await dispatchInbound(update({ messageId: "110" }), "telegram", headers());

    assert.equal(result.outcome, "deny");
    assert.equal(result.denyReason, "L1_signature");
  });
});
