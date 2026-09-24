const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const telegramPath = path.resolve(__dirname, "../adapters/telegram/inbound.ts");

function freshTelegramAdapter() {
  delete require.cache[telegramPath];
  return require(telegramPath).TelegramAdapter;
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

describe("ott-gateway L1 Telegram adapter", () => {
  const originalSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const originalAllowUnsigned = process.env.OTT_TELEGRAM_ALLOW_UNSIGNED;

  beforeEach(() => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.OTT_TELEGRAM_ALLOW_UNSIGNED;
    delete require.cache[telegramPath];
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = originalSecret;
    if (originalAllowUnsigned === undefined) delete process.env.OTT_TELEGRAM_ALLOW_UNSIGNED;
    else process.env.OTT_TELEGRAM_ALLOW_UNSIGNED = originalAllowUnsigned;
    delete require.cache[telegramPath];
  });

  it("TelegramAdapter.verify() returns true for a valid secret token", async () => {
    const TelegramAdapter = freshTelegramAdapter();
    const adapter = new TelegramAdapter({ webhookSecret: "secret-token" });

    const ok = await adapter.verify({}, {
      "x-telegram-bot-api-secret-token": "secret-token",
    });

    assert.equal(ok, true);
  });

  it("TelegramAdapter.verify() returns false for an invalid secret token (different length)", async () => {
    const TelegramAdapter = freshTelegramAdapter();
    const adapter = new TelegramAdapter({ webhookSecret: "secret-token" });

    const ok = await adapter.verify({}, {
      "x-telegram-bot-api-secret-token": "wrong-token",
    });

    assert.equal(ok, false);
  });

  it("TelegramAdapter.verify() returns false for a wrong token of the same length", async () => {
    const TelegramAdapter = freshTelegramAdapter();
    const adapter = new TelegramAdapter({ webhookSecret: "secret-token" });

    const ok = await adapter.verify({}, {
      "x-telegram-bot-api-secret-token": "wr0ng-t0ken!",
    });

    assert.equal(ok, false);
  });

  it("TelegramAdapter.verify() returns false when the header is missing", async () => {
    const TelegramAdapter = freshTelegramAdapter();
    const adapter = new TelegramAdapter({ webhookSecret: "secret-token" });

    const ok = await adapter.verify({}, {});

    assert.equal(ok, false);
  });

  it("TelegramAdapter.verify() fail-closed by default when no secret is configured, and warns", async () => {
    const TelegramAdapter = freshTelegramAdapter();
    const adapter = new TelegramAdapter();

    const { result, calls } = await captureWarn(() => adapter.verify({}, {}));

    assert.equal(result, false);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /fail-closed/);
  });

  it("TelegramAdapter.verify() allows unsigned via allowUnsigned option when no secret configured, and warns UNSIGNED MODE", async () => {
    const TelegramAdapter = freshTelegramAdapter();
    const adapter = new TelegramAdapter({ allowUnsigned: true });

    const { result, calls } = await captureWarn(() => adapter.verify({}, {}));

    assert.equal(result, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /UNSIGNED MODE/);
  });

  it("TelegramAdapter.verify() allows unsigned via OTT_TELEGRAM_ALLOW_UNSIGNED=1 env when no secret configured", async () => {
    process.env.OTT_TELEGRAM_ALLOW_UNSIGNED = "1";
    const TelegramAdapter = freshTelegramAdapter();
    const adapter = new TelegramAdapter();

    const ok = await adapter.verify({}, {});

    assert.equal(ok, true);
  });

  it("TelegramAdapter.verify() treats a garbage OTT_TELEGRAM_ALLOW_UNSIGNED value as disabled", async () => {
    process.env.OTT_TELEGRAM_ALLOW_UNSIGNED = "yes-please";
    const TelegramAdapter = freshTelegramAdapter();
    const adapter = new TelegramAdapter();

    const ok = await adapter.verify({}, {});

    assert.equal(ok, false);
  });

  it("TelegramAdapter.verify() treats OTT_TELEGRAM_ALLOW_UNSIGNED=0 as disabled", async () => {
    process.env.OTT_TELEGRAM_ALLOW_UNSIGNED = "0";
    const TelegramAdapter = freshTelegramAdapter();
    const adapter = new TelegramAdapter();

    const ok = await adapter.verify({}, {});

    assert.equal(ok, false);
  });

  it("TelegramAdapter.verify() option allowUnsigned:false overrides env OTT_TELEGRAM_ALLOW_UNSIGNED=1", async () => {
    process.env.OTT_TELEGRAM_ALLOW_UNSIGNED = "1";
    const TelegramAdapter = freshTelegramAdapter();
    const adapter = new TelegramAdapter({ allowUnsigned: false });

    const ok = await adapter.verify({}, {});

    assert.equal(ok, false);
  });

  it("TelegramAdapter.verify() warn text never contains the configured secret", async () => {
    const TelegramAdapter = freshTelegramAdapter();
    const adapter = new TelegramAdapter({ allowUnsigned: true });

    const { calls } = await captureWarn(() => adapter.verify({}, {}));

    for (const call of calls) {
      assert.doesNotMatch(call, /secret-token/);
    }
  });

  it("TelegramAdapter.parse() returns the normalized InboundMessage shape", async () => {
    const TelegramAdapter = freshTelegramAdapter();
    const adapter = new TelegramAdapter({ webhookSecret: "secret-token" });
    const raw = {
      update_id: 1001,
      message: {
        message_id: 55,
        from: { id: 12345 },
        chat: { id: -9988 },
        text: "hello",
      },
    };

    const message = await adapter.parse(raw);

    assert.equal(message.platform, "telegram");
    assert.equal(message.messageId, "55");
    assert.equal(message.platformUserId, "12345");
    assert.equal(message.chatId, "-9988");
    assert.equal(message.text, "hello");
    assert.equal(message.command, null);
    assert.equal(message.raw, raw);
    assert.equal(typeof message.ts, "number");
  });

  it("TelegramAdapter.parse() extracts slash commands from text", async () => {
    const TelegramAdapter = freshTelegramAdapter();
    const adapter = new TelegramAdapter({ webhookSecret: "secret-token" });

    const message = await adapter.parse({
      message: {
        message_id: 56,
        from: { id: 12345 },
        chat: { id: -9988 },
        text: "/status now",
      },
    });

    assert.equal(message.command, "/status");
  });

  it("TelegramAdapter.parse() defaults missing message fields to empty strings", async () => {
    const TelegramAdapter = freshTelegramAdapter();
    const adapter = new TelegramAdapter({ webhookSecret: "secret-token" });
    const raw = { update_id: 1002 };

    const message = await adapter.parse(raw);

    assert.equal(message.platform, "telegram");
    assert.equal(message.messageId, "");
    assert.equal(message.platformUserId, "");
    assert.equal(message.chatId, "");
    assert.equal(message.text, "");
    assert.equal(message.command, null);
    assert.equal(message.raw, raw);
  });
});
