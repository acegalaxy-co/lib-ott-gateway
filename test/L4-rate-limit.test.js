const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const limiterPath = path.resolve(__dirname, "../rate-limit/limiter.ts");
const replayGuardPath = path.resolve(__dirname, "../rate-limit/replay-guard.ts");

function freshLimiter() {
  delete require.cache[limiterPath];
  return require(limiterPath);
}

function freshReplayGuard() {
  delete require.cache[replayGuardPath];
  return require(replayGuardPath);
}

describe("ott-gateway L4 rate limit and replay guard", () => {
  const originalNow = Date.now;

  beforeEach(() => {
    delete require.cache[limiterPath];
    delete require.cache[replayGuardPath];
  });

  afterEach(() => {
    Date.now = originalNow;
    delete require.cache[limiterPath];
    delete require.cache[replayGuardPath];
  });

  it("limiter.check() allows the first request under quota", async () => {
    const limiter = freshLimiter();

    assert.equal(await limiter.check("identity-1", "/status"), true);
  });

  it("limiter.check() allows 30 calls inside the 60 second window", async () => {
    Date.now = () => 1000;
    const limiter = freshLimiter();
    const results = [];

    for (let i = 0; i < 30; i += 1) {
      results.push(await limiter.check("identity-1", "/status"));
    }

    assert.deepEqual(results, Array(30).fill(true));
  });

  it("limiter.check() denies the 31st call in the same 60 second window", async () => {
    Date.now = () => 1000;
    const limiter = freshLimiter();

    for (let i = 0; i < 30; i += 1) {
      assert.equal(await limiter.check("identity-1", "/status"), true);
    }

    assert.equal(await limiter.check("identity-1", "/status"), false);
  });

  it("limiter.check() resets quota after the 60 second window expires", async () => {
    let now = 1000;
    Date.now = () => now;
    const limiter = freshLimiter();

    for (let i = 0; i < 30; i += 1) {
      assert.equal(await limiter.check("identity-1", "/status"), true);
    }
    assert.equal(await limiter.check("identity-1", "/status"), false);

    now += limiter.WINDOW_MS + 1;
    assert.equal(await limiter.check("identity-1", "/status"), true);
  });

  it("limiter.check() keeps separate buckets per command for the same identity", async () => {
    Date.now = () => 1000;
    const limiter = freshLimiter();

    for (let i = 0; i < 30; i += 1) {
      assert.equal(await limiter.check("identity-1", "/status"), true);
      assert.equal(await limiter.check("identity-1", "/report"), true);
    }

    assert.equal(await limiter.check("identity-1", "/status"), false);
    assert.equal(await limiter.check("identity-1", "/report"), false);
  });

  it("replayGuard.seen() returns false on first sighting", async () => {
    const replayGuard = freshReplayGuard();

    assert.equal(await replayGuard.seen("msg-1"), false);
  });

  it("replayGuard.seen() returns true for a duplicate messageId", async () => {
    const replayGuard = freshReplayGuard();

    assert.equal(await replayGuard.seen("msg-1"), false);
    assert.equal(await replayGuard.seen("msg-1"), true);
  });

  it("replayGuard.seen() treats different messageIds as fresh", async () => {
    const replayGuard = freshReplayGuard();

    assert.equal(await replayGuard.seen("msg-1"), false);
    assert.equal(await replayGuard.seen("msg-2"), false);
  });

  it("replayGuard.seen() treats a messageId as fresh after the 1 hour TTL expires", async () => {
    let now = 1000;
    Date.now = () => now;
    const replayGuard = freshReplayGuard();

    assert.equal(await replayGuard.seen("msg-1"), false);

    now += replayGuard.TTL_MS + 1;
    assert.equal(await replayGuard.seen("msg-1"), false);
  });
});
