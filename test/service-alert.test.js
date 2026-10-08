const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { formatServiceAlert, sendServiceAlert } = require("../service-alert.ts");
const { resolveIdentity, pascal, kebab } = require("../service-alert-identity.ts");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sa-"));

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
      host: "MacMini2",
      project: "Crawler",
      fields: { exit: 1, skipped: undefined },
      detail: "line1\nline2",
    });
    assert.equal(text, "[MacMini2][Crawler] [❌ fail] Service seo-google-daily\nDaily report\nexit: 1\n---\nline1\nline2");
  });

  it("queued status, no project bracket when project empty", () => {
    const text = formatServiceAlert({ service: "nhadathue-tiktok", status: "queued", title: "", host: "MacMini2" });
    assert.equal(text, "[MacMini2] [⏳ queued] Service nhadathue-tiktok");
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
    const env = { NEXUS_TELEGRAM_BOT_TOKEN: "tok-secret-1", NEXUS_TELEGRAM_CHANNEL_STATUS_ALERT: "chat1", HOST_LABEL: "MacMini2", ALERT_PROJECT: "P", ALERT_STATE_DIR: tmp() };
    const ok = await sendServiceAlert({ service: "s", status: "ok", title: "t" }, { env });
    assert.equal(ok.sent, true);
    assert.equal(body.chat_id, "chat1");
    assert.ok(body.text.startsWith("[MacMini2][P] [✅ ok] Service s"));

    globalThis.fetch = async () => {
      throw new Error("connect failed https://api.telegram.org/bottok-secret-1/sendMessage");
    };
    const bad = await sendServiceAlert({ service: "s", status: "fail", title: "t" }, { env });
    assert.equal(bad.sent, false);
    assert.ok(!bad.reason.includes("tok-secret-1"));
  });
});

describe("service-alert identity", () => {
  it("pascal-cases folder names", () => {
    assert.equal(pascal("bds-hue"), "BdsHue");
    assert.equal(pascal("share_fp2g tiktok"), "ShareFp2gTiktok");
  });

  it("suggests project from git root and service from package.json folder, saves, then reuses", () => {
    const state = tmp();
    const root = tmp();
    const repo = path.join(root, "my-repo");
    const svc = path.join(repo, "src", "services", "nhadathue-tiktok");
    fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".git", "HEAD"), "ref: refs/heads/main");
    fs.mkdirSync(path.join(repo, "src", ".git", "hooks"), { recursive: true }); // stray .git dir must be ignored
    fs.mkdirSync(svc, { recursive: true });
    fs.writeFileSync(path.join(svc, "package.json"), "{}");
    const env = { ALERT_STATE_DIR: state };
    const first = resolveIdentity({ cwd: svc, env });
    assert.deepEqual(first, { project: "MyRepo", service: "nhadathue-tiktok" });
    // user renames in the saved file -> reused on next call
    const file = path.join(state, "service-alert.json");
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    saved.projects[Object.keys(saved.projects)[0]] = "Crawler";
    fs.writeFileSync(file, JSON.stringify(saved));
    assert.equal(resolveIdentity({ cwd: svc, env }).project, "Crawler");
  });

  it("explicit service and env ALERT_PROJECT win and nothing is saved", () => {
    const state = tmp();
    const id = resolveIdentity({ cwd: tmp(), env: { ALERT_STATE_DIR: state, ALERT_PROJECT: "X" }, service: "svc" });
    assert.deepEqual(id, { project: "X", service: "svc" });
    assert.equal(fs.existsSync(path.join(state, "service-alert.json")), false);
  });

  it("falls back to suggestion when the state dir is unwritable", () => {
    const id = resolveIdentity({ cwd: "/tmp", env: { ALERT_STATE_DIR: "/dev/null/x" } });
    assert.ok(id.project && id.service);
  });
});

describe("service-alert init", () => {
  it("peek + save persist chosen names", () => {
    const { peekIdentity, saveIdentity } = require("../service-alert-identity.ts");
    const state = tmp();
    const env = { ALERT_STATE_DIR: state };
    const cwd = tmp();
    assert.ok(peekIdentity({ cwd, env }).project);
    assert.equal(saveIdentity({ cwd, env, project: "Crawler", service: "tiktok" }), true);
    assert.deepEqual(resolveIdentity({ cwd, env }), { project: "Crawler", service: "tiktok" });
  });
});

describe("service-alert name shortening", () => {
  it("leaves names <= 16 chars untouched", () => {
    assert.equal(pascal("bds-hue"), "BdsHue");
    assert.equal(kebab("seo-google-daily"), "seo-google-daily");
  });

  it("trims longest words first, keeps short words whole, never below 3 chars per word", () => {
    const k = kebab("share-fp2group-fb-personal");
    assert.ok(k.length <= 16, k);
    assert.ok(k.split("-").includes("fb"));
    assert.ok(k.split("-").every((w) => w.length >= 2));
    assert.ok(pascal("nhadathue-realestate-crawler-platform").length <= 16);
    assert.equal(kebab("a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-r"), "a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-r");
  });
});
