const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const auditPath = path.resolve(__dirname, "../audit/logger.ts");

function freshAudit(logPath) {
  process.env.OTT_AUDIT_LOG_PATH = logPath;
  delete require.cache[auditPath];
  return require(auditPath);
}

function sampleRecord(overrides = {}) {
  return {
    ts: "2026-05-25T00:00:00.000Z",
    platform: "telegram",
    messageId: "msg-1",
    platformUserId: "123",
    identity: "user-123",
    command: "/status",
    outcome: "allow",
    denyReason: null,
    latencyMs: 12,
    ...overrides,
  };
}

function readJsonLines(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("ott-gateway L5 audit logger", () => {
  const originalAuditPath = process.env.OTT_AUDIT_LOG_PATH;
  let tempDir;
  let logPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ott-audit-"));
    logPath = path.join(tempDir, "audit.log");
    delete require.cache[auditPath];
  });

  afterEach(() => {
    if (originalAuditPath === undefined) delete process.env.OTT_AUDIT_LOG_PATH;
    else process.env.OTT_AUDIT_LOG_PATH = originalAuditPath;
    delete require.cache[auditPath];
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("audit.record() appends one JSONL line for an allow outcome", async () => {
    const audit = freshAudit(logPath);

    await audit.record(sampleRecord({ outcome: "allow", denyReason: null }));

    const records = readJsonLines(logPath);
    assert.equal(records.length, 1);
    assert.equal(records[0].outcome, "allow");
  });

  it("audit.record() preserves denyReason for a deny outcome", async () => {
    const audit = freshAudit(logPath);

    await audit.record(sampleRecord({
      outcome: "deny",
      denyReason: "L1_signature",
      identity: null,
    }));

    const records = readJsonLines(logPath);
    assert.equal(records[0].outcome, "deny");
    assert.equal(records[0].denyReason, "L1_signature");
  });

  it("audit.record() writes the OutcomeRecord shape from the spec", async () => {
    const audit = freshAudit(logPath);

    await audit.record(sampleRecord({ latencyMs: 34 }));

    const [record] = readJsonLines(logPath);
    assert.equal(new Date(record.ts).toISOString(), record.ts);
    assert.equal(record.platform, "telegram");
    assert.equal(record.messageId, "msg-1");
    assert.equal(record.platformUserId, "123");
    assert.equal(record.identity, "user-123");
    assert.equal(record.command, "/status");
    assert.equal(record.latencyMs, 34);
  });

  it("audit.record() swallows serialization errors for invalid records", async () => {
    const audit = freshAudit(logPath);
    const originalError = console.error;
    console.error = () => {};
    const invalid = {};
    invalid.self = invalid;

    try {
      await assert.doesNotReject(() => audit.record(invalid));
    } finally {
      console.error = originalError;
    }
  });

  it("audit.record() appends JSONL records without overwriting previous entries", async () => {
    const audit = freshAudit(logPath);

    await audit.record(sampleRecord({ messageId: "msg-1" }));
    await audit.record(sampleRecord({ messageId: "msg-2", outcome: "deny", denyReason: "L4_replay" }));

    const records = readJsonLines(logPath);
    assert.equal(records.length, 2);
    assert.deepEqual(records.map((record) => record.messageId), ["msg-1", "msg-2"]);
  });
});
