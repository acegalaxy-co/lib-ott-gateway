const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const policyPath = path.resolve(__dirname, "../adapters/telegram/policy.ts");
const clientPath = path.resolve(__dirname, "../adapters/telegram/client.ts");
const registryPath = path.resolve(__dirname, "../adapters/telegram/registry.ts");

function freshPolicyModule() {
  delete require.cache[policyPath];
  return require(policyPath);
}

function freshClientModule() {
  delete require.cache[clientPath];
  delete require.cache[policyPath];
  return require(clientPath);
}

function freshRegistryModule() {
  delete require.cache[registryPath];
  delete require.cache[clientPath];
  delete require.cache[policyPath];
  return require(registryPath);
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

function allowPolicy(name = "always-allow", mode = "enforce") {
  return { name, mode, evaluate: async () => ({ action: "allow" }) };
}

describe("ott-gateway outbound policy pipeline (createPolicyPipeline)", () => {
  it("enforce + allow → passes text/chatId through unchanged", async () => {
    const { createPolicyPipeline } = freshPolicyModule();
    const pipeline = createPolicyPipeline({ policies: [allowPolicy()] });

    const verdict = await pipeline.evaluate("hello", { chatId: "1", method: "sendText" });

    assert.deepEqual(verdict, { ok: true, text: "hello", chatId: "1" });
  });

  it("enforce + transform → rewrites text/chatId, next policy sees the transformed values", async () => {
    const { createPolicyPipeline } = freshPolicyModule();
    const seen = [];
    const policies = [
      {
        name: "rewriter",
        mode: "enforce",
        evaluate: async (text) => ({ action: "transform", text: `${text}-tagged`, chatId: "999" }),
      },
      {
        name: "observer",
        mode: "enforce",
        evaluate: async (text, ctx) => {
          seen.push({ text, chatId: ctx.chatId });
          return { action: "allow" };
        },
      },
    ];
    const pipeline = createPolicyPipeline({ policies });

    const verdict = await pipeline.evaluate("hello", { chatId: "1", method: "sendText" });

    assert.deepEqual(verdict, { ok: true, text: "hello-tagged", chatId: "999" });
    assert.deepEqual(seen, [{ text: "hello-tagged", chatId: "999" }]);
  });

  it("enforce + deny → no fetch (verified at client level), onDeny called, blocked verdict returned", async () => {
    const { createPolicyPipeline } = freshPolicyModule();
    const denyEvents = [];
    const pipeline = createPolicyPipeline({
      policies: [{ name: "blocker", mode: "enforce", evaluate: async () => ({ action: "deny", reason: "nope" }) }],
      onDeny: (ev) => denyEvents.push(ev),
    });

    const verdict = await pipeline.evaluate("hello", { chatId: "1", method: "sendText", meta: { x: 1 } });

    assert.deepEqual(verdict, { ok: false, blocked: true, reason: "nope", policy: "blocker" });
    assert.equal(denyEvents.length, 1);
    assert.deepEqual(denyEvents[0], { policy: "blocker", reason: "nope", chatId: "1", meta: { x: 1 } });
  });

  it("enforce + deny with no reason → defaults to denied:<name>", async () => {
    const { createPolicyPipeline } = freshPolicyModule();
    const pipeline = createPolicyPipeline({
      policies: [{ name: "blocker", mode: "enforce", evaluate: async () => ({ action: "deny" }) }],
    });

    const verdict = await pipeline.evaluate("hello", { chatId: "1", method: "sendText" });

    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, "denied:blocker");
  });

  it("shadow mode → original text/chatId unaffected, onShadowResult called, result never applied", async () => {
    const { createPolicyPipeline } = freshPolicyModule();
    const shadowEvents = [];
    const pipeline = createPolicyPipeline({
      policies: [
        {
          name: "shadow-denier",
          mode: "shadow",
          evaluate: async () => ({ action: "deny", reason: "would-block" }),
        },
      ],
      onShadowResult: (ev) => shadowEvents.push(ev),
    });

    const verdict = await pipeline.evaluate("hello", { chatId: "1", method: "sendMessage" });

    assert.deepEqual(verdict, { ok: true, text: "hello", chatId: "1" });
    assert.equal(shadowEvents.length, 1);
    assert.equal(shadowEvents[0].policy, "shadow-denier");
    assert.equal(shadowEvents[0].result.action, "deny");
    assert.equal(shadowEvents[0].method, "sendMessage");
  });

  it('mode "off" → policy skipped entirely, evaluate() never called', async () => {
    const { createPolicyPipeline } = freshPolicyModule();
    let called = false;
    const pipeline = createPolicyPipeline({
      policies: [{ name: "disabled", mode: "off", evaluate: async () => { called = true; return { action: "deny" }; } }],
    });

    const verdict = await pipeline.evaluate("hello", { chatId: "1", method: "sendText" });

    assert.equal(called, false);
    assert.deepEqual(verdict, { ok: true, text: "hello", chatId: "1" });
  });

  it("policy throws → fail-open (default): logged, treated as allow, pipeline continues", async () => {
    const { createPolicyPipeline } = freshPolicyModule();
    const originalError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args.join(" "));
    try {
      const pipeline = createPolicyPipeline({
        policies: [
          { name: "throws", mode: "enforce", evaluate: async () => { throw new Error("boom"); } },
          allowPolicy("after"),
        ],
      });

      const verdict = await pipeline.evaluate("hello", { chatId: "1", method: "sendText" });

      assert.deepEqual(verdict, { ok: true, text: "hello", chatId: "1" });
      assert.ok(errors.some((l) => l.includes("throws") && l.includes("boom")));
    } finally {
      console.error = originalError;
    }
  });

  it("policy throws + onError: fail-closed → deny reason policy-error:<name>", async () => {
    const { createPolicyPipeline } = freshPolicyModule();
    const originalError = console.error;
    console.error = () => {};
    try {
      const pipeline = createPolicyPipeline({
        policies: [{ name: "throws", mode: "enforce", evaluate: async () => { throw new Error("boom"); } }],
        onError: "fail-closed",
      });

      const verdict = await pipeline.evaluate("hello", { chatId: "1", method: "sendText" });

      assert.deepEqual(verdict, { ok: false, blocked: true, reason: "policy-error:throws", policy: "throws" });
    } finally {
      console.error = originalError;
    }
  });

  it("onShadowResult / onDeny throwing is swallowed and never propagates", async () => {
    const { createPolicyPipeline } = freshPolicyModule();
    const originalError = console.error;
    console.error = () => {};
    try {
      const pipeline = createPolicyPipeline({
        policies: [{ name: "blocker", mode: "enforce", evaluate: async () => ({ action: "deny" }) }],
        onDeny: () => { throw new Error("handler boom"); },
      });

      const verdict = await pipeline.evaluate("hello", { chatId: "1", method: "sendText" });

      assert.equal(verdict.ok, false);
    } finally {
      console.error = originalError;
    }
  });

  it("mode getter → re-read on every evaluate() call, flips behavior without recreating the pipeline", async () => {
    const { createPolicyPipeline } = freshPolicyModule();
    let currentMode = "off";
    let calls = 0;
    const policy = {
      name: "flippable",
      get mode() { return currentMode; },
      evaluate: async () => { calls++; return { action: "deny", reason: "blocked" }; },
    };
    const pipeline = createPolicyPipeline({ policies: [policy] });

    const first = await pipeline.evaluate("hello", { chatId: "1", method: "sendText" });
    assert.deepEqual(first, { ok: true, text: "hello", chatId: "1" });
    assert.equal(calls, 0);

    currentMode = "enforce";
    const second = await pipeline.evaluate("hello", { chatId: "1", method: "sendText" });
    assert.equal(second.ok, false);
    assert.equal(calls, 1);
  });
});

describe("ott-gateway Telegram client — policy pipeline integration", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete require.cache[clientPath];
    delete require.cache[policyPath];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete require.cache[clientPath];
    delete require.cache[policyPath];
  });

  it("sendText() blocked by an enforce+deny policy → no fetch call, blocked verdict returned", async () => {
    let fetchCalls = 0;
    globalThis.fetch = async () => { fetchCalls++; return jsonResponse(200, { ok: true }); };
    const { createTelegramClient } = freshClientModule();
    const client = createTelegramClient({
      token: "test-token",
      apiBase: "https://api.telegram.org",
      limiter: fakeLimiter(),
      policy: { policies: [{ name: "blocker", mode: "enforce", evaluate: async () => ({ action: "deny", reason: "no" }) }] },
    });

    const result = await client.sendText("hello", "123");

    assert.equal(fetchCalls, 0);
    assert.deepEqual(result, { ok: false, blocked: true, reason: "no", policy: "blocker" });
  });

  it("sendMessage() blocked by an enforce+deny policy → no fetch call, blocked verdict, onDeny called", async () => {
    let fetchCalls = 0;
    globalThis.fetch = async () => { fetchCalls++; return jsonResponse(200, { ok: true }); };
    const denyEvents = [];
    const { createTelegramClient } = freshClientModule();
    const client = createTelegramClient({
      token: "test-token",
      apiBase: "https://api.telegram.org",
      limiter: fakeLimiter(),
      policy: {
        policies: [{ name: "blocker", mode: "enforce", evaluate: async () => ({ action: "deny", reason: "no" }) }],
        onDeny: (ev) => denyEvents.push(ev),
      },
    });

    const result = await client.sendMessage({ chatId: "123", text: "hi" });

    assert.equal(fetchCalls, 0);
    assert.deepEqual(result, { ok: false, blocked: true, reason: "no", policy: "blocker" });
    assert.equal(denyEvents.length, 1);
  });

  it("sendText() with an allow policy → sends normally (transform applied) and reaches fetch", async () => {
    const calls = [];
    globalThis.fetch = async (url, opts) => { calls.push(JSON.parse(opts.body)); return jsonResponse(200, { ok: true, result: { message_id: calls.length } }); };
    const { createTelegramClient } = freshClientModule();
    const client = createTelegramClient({
      token: "test-token",
      apiBase: "https://api.telegram.org",
      limiter: fakeLimiter(),
      policy: { policies: [{ name: "tagger", mode: "enforce", evaluate: async (text) => ({ action: "transform", text: `[tagged] ${text}` }) }] },
    });

    await client.sendText("hello", "123");

    assert.equal(calls.length, 1);
    assert.equal(calls[0].text, "[tagged] hello");
  });

  it("sendText() with a shadow policy → original text still sent unchanged, onShadowResult fires once", async () => {
    const calls = [];
    globalThis.fetch = async (url, opts) => { calls.push(JSON.parse(opts.body)); return jsonResponse(200, { ok: true, result: { message_id: calls.length } }); };
    const shadowEvents = [];
    const { createTelegramClient } = freshClientModule();
    const client = createTelegramClient({
      token: "test-token",
      apiBase: "https://api.telegram.org",
      limiter: fakeLimiter(),
      policy: {
        policies: [{ name: "shadow-blocker", mode: "shadow", evaluate: async () => ({ action: "deny", reason: "would-deny" }) }],
        onShadowResult: (ev) => shadowEvents.push(ev),
      },
    });

    const result = await client.sendText("hello world", "123");

    assert.equal(calls.length, 1);
    assert.equal(calls[0].text, "hello world");
    assert.equal(result.result.message_id, 1);
    assert.equal(shadowEvents.length, 1);
    assert.equal(shadowEvents[0].method, "sendText");
  });

  it("policy mode 'off' → identical to no policy, fetch proceeds unchanged", async () => {
    const calls = [];
    globalThis.fetch = async (url, opts) => { calls.push(JSON.parse(opts.body)); return jsonResponse(200, { ok: true, result: { message_id: 1 } }); };
    const { createTelegramClient } = freshClientModule();
    const client = createTelegramClient({
      token: "test-token",
      apiBase: "https://api.telegram.org",
      limiter: fakeLimiter(),
      policy: { policies: [{ name: "off-policy", mode: "off", evaluate: async () => ({ action: "deny" }) }] },
    });

    await client.sendText("hello", "123");

    assert.equal(calls.length, 1);
    assert.equal(calls[0].text, "hello");
  });

  it("no `policy` configured → byte-identical behavior: sendText/sendMessage work exactly as before", async () => {
    const calls = [];
    globalThis.fetch = async (url, opts) => { calls.push(JSON.parse(opts.body)); return jsonResponse(200, { ok: true, result: { message_id: calls.length } }); };
    const { createTelegramClient } = freshClientModule();
    const client = createTelegramClient({ token: "test-token", apiBase: "https://api.telegram.org", limiter: fakeLimiter() });

    await client.sendText("hello", "123");
    await client.sendMessage({ chatId: "123", text: "hi" });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].text, "hello");
    assert.equal(calls[1].text, "hi");
  });

  it("sendText() with long text split into multiple chunks → policy evaluated exactly ONCE (not per chunk)", async () => {
    let evalCount = 0;
    const calls = [];
    globalThis.fetch = async (url, opts) => { calls.push(JSON.parse(opts.body)); return jsonResponse(200, { ok: true, result: { message_id: calls.length } }); };
    const { createTelegramClient } = freshClientModule();
    const client = createTelegramClient({
      token: "test-token",
      apiBase: "https://api.telegram.org",
      maxLen: 20,
      limiter: fakeLimiter(),
      policy: { policies: [{ name: "counter", mode: "enforce", evaluate: async () => { evalCount++; return { action: "allow" }; } }] },
    });

    const longText = "line one\nline two\nline three\nline four";
    await client.sendText(longText, "123");

    assert.ok(calls.length > 1, "expected the text to be split into multiple chunks");
    assert.equal(evalCount, 1, "policy must be evaluated exactly once for the whole sendText() call, not per chunk");
  });

  it("beforeSend still runs, and runs BEFORE the policy pipeline sees the text", async () => {
    const seenByPolicy = [];
    const calls = [];
    globalThis.fetch = async (url, opts) => { calls.push(JSON.parse(opts.body)); return jsonResponse(200, { ok: true, result: { message_id: calls.length } }); };
    const { createTelegramClient } = freshClientModule();
    const client = createTelegramClient({
      token: "test-token",
      apiBase: "https://api.telegram.org",
      limiter: fakeLimiter(),
      beforeSend: (text) => `[tag] ${text}`,
      policy: { policies: [{ name: "recorder", mode: "enforce", evaluate: async (text) => { seenByPolicy.push(text); return { action: "allow" }; } }] },
    });

    await client.sendText("hello", "123");

    assert.deepEqual(seenByPolicy, ["[tag] hello"]);
    assert.equal(calls[0].text, "[tag] hello");
  });
});

describe("ott-gateway Telegram registry — policy forwarding", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete require.cache[registryPath];
    delete require.cache[clientPath];
    delete require.cache[policyPath];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete require.cache[registryPath];
    delete require.cache[clientPath];
    delete require.cache[policyPath];
  });

  it("registry def.policy is forwarded to the created client — blocked sendText produces no fetch", async () => {
    let fetchCalls = 0;
    globalThis.fetch = async () => { fetchCalls++; return jsonResponse(200, { ok: true }); };
    const { createTelegramRegistry } = freshRegistryModule();
    const registry = createTelegramRegistry({
      nexus: {
        token: "nexus-token",
        policy: { policies: [{ name: "blocker", mode: "enforce", evaluate: async () => ({ action: "deny", reason: "no" }) }] },
      },
    });

    const result = await registry.get("nexus").sendText("hi", "1");

    assert.equal(fetchCalls, 0);
    assert.deepEqual(result, { ok: false, blocked: true, reason: "no", policy: "blocker" });
  });

  it("registry def.beforeSend is forwarded to the created client", async () => {
    const calls = [];
    globalThis.fetch = async (url, opts) => { calls.push(JSON.parse(opts.body)); return jsonResponse(200, { ok: true, result: { message_id: 1 } }); };
    const { createTelegramRegistry } = freshRegistryModule();
    const registry = createTelegramRegistry({
      kane: { token: "kane-token", beforeSend: (text) => `[kane] ${text}` },
    });

    await registry.get("kane").sendText("hello", "1");

    assert.equal(calls[0].text, "[kane] hello");
  });

  it("registry def with no policy/beforeSend → unchanged behavior", async () => {
    const calls = [];
    globalThis.fetch = async (url, opts) => { calls.push(JSON.parse(opts.body)); return jsonResponse(200, { ok: true, result: { message_id: 1 } }); };
    const { createTelegramRegistry } = freshRegistryModule();
    const registry = createTelegramRegistry({ plain: { token: "plain-token" } });

    await registry.get("plain").sendText("hello", "1");

    assert.equal(calls[0].text, "hello");
  });
});
