const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { formatServiceAlert, sendServiceAlert, resolveAlertTarget } = require("../service-alert.ts");
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

  it("links → HTML-escaped text + <a> line before detail", () => {
    const text = formatServiceAlert({
      service: "s", status: "ok", title: "a<b>&c", host: "H",
      fields: { month: "2026-10" },
      links: { Invoices: "https://x.test/p?v=1&q=\"" },
      detail: "1 < 2",
    });
    assert.equal(text, '[H] [✅ ok] Service s\na&lt;b&gt;&amp;c\nmonth: 2026-10\n<a href="https://x.test/p?v=1&amp;q=&quot;">Invoices</a>\n---\n1 &lt; 2');
  });

  it("sends parse_mode HTML only when links set", async () => {
    const bodies = [];
    globalThis.fetch = async (_url, init) => (bodies.push(JSON.parse(init.body)), new Response("{}", { status: 200 }));
    const env = { TELEGRAM_BOT_TOKEN_NEXUS: "t", TELEGRAM_CHANNEL_STATUS_ALERT_ID: "c", ALERT_PROJECT: "P", ALERT_STATE_DIR: tmp() };
    await sendServiceAlert({ service: "s", status: "ok", title: "t" }, { env });
    await sendServiceAlert({ service: "s", status: "ok", title: "t", links: { L: "https://x.test" } }, { env });
    assert.equal(bodies[0].parse_mode, undefined);
    assert.equal(bodies[1].parse_mode, "HTML");
  });

  it("no-op when token/chat missing", async () => {
    let called = false;
    globalThis.fetch = async () => ((called = true), new Response("{}"));
    const r = await sendServiceAlert({ service: "s", status: "ok", title: "t" }, { env: {} });
    assert.equal(r.sent, false);
    assert.equal(called, false);
  });

  it("chat/email default to org channel + contact mail, env overrides", async () => {
    let body;
    globalThis.fetch = async (_url, init) => ((body = JSON.parse(init.body)), new Response("{}", { status: 200 }));
    const r = await sendServiceAlert({ service: "s", status: "ok", title: "t" }, { env: { TELEGRAM_BOT_TOKEN_ALERT: "t", ALERT_PROJECT: "P", ALERT_STATE_DIR: tmp() } });
    assert.equal(r.sent, true);
    assert.equal(body.chat_id, "-1004454440769");
    assert.equal(resolveAlertTarget({}).email, "contact@acegalaxy.co");
    const o = resolveAlertTarget({ TELEGRAM_CHAT_ALERT_ID: "c2", ALERT_EMAIL: "x@example.com" });
    assert.equal(o.chatId, "c2");
    assert.equal(o.email, "x@example.com");
  });

  it("old env names are no longer read (treated as not configured)", async () => {
    let called = false;
    globalThis.fetch = async () => ((called = true), new Response("{}"));
    const env = { NEXUS_TELEGRAM_BOT_TOKEN: "t", NEXUS_TELEGRAM_CHANNEL_STATUS_ALERT: "c", TELEGRAM_ALERT_BOT_TOKEN: "t", TELEGRAM_ALERT_CHAT_ID: "c", ALERT_PROJECT: "P", ALERT_STATE_DIR: tmp() };
    const r = await sendServiceAlert({ service: "s", status: "ok", title: "t" }, { env });
    assert.equal(r.sent, false);
    assert.equal(called, false);
  });

  it("sends via env fallback and never leaks token on error", async () => {
    let body;
    globalThis.fetch = async (_url, init) => ((body = JSON.parse(init.body)), new Response("{}", { status: 200 }));
    const env = { TELEGRAM_BOT_TOKEN_NEXUS: "tok-secret-1", TELEGRAM_CHANNEL_STATUS_ALERT_ID: "chat1", HOST_LABEL: "MacMini2", ALERT_PROJECT: "P", ALERT_STATE_DIR: tmp() };
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

describe("service-alert photo", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
  const dir = tmp();
  const png = path.join(dir, "shot.png");
  fs.writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
  const env = () => ({ TELEGRAM_BOT_TOKEN_NEXUS: "SECRETTOKEN", TELEGRAM_CHANNEL_STATUS_ALERT_ID: "c", ALERT_PROJECT: "P", ALERT_STATE_DIR: tmp() });
  const alert = { service: "s", status: "ok", title: "t", host: "H", detail: "d" };
  const mockFetch = (calls, photoStatus = 200) => {
    globalThis.fetch = async (url, init) => {
      const isPhoto = String(url).endsWith("/sendPhoto");
      calls.push({ method: isPhoto ? "sendPhoto" : "sendMessage", body: init.body });
      return isPhoto && photoStatus !== 200 ? new Response('{"ok":false}', { status: photoStatus }) : new Response("{}", { status: 200 });
    };
  };

  it("photo happy path: one sendPhoto with caption + file, no sendMessage", async () => {
    const calls = [];
    mockFetch(calls);
    const r = await sendServiceAlert(alert, { env: env(), photoPath: png });
    assert.equal(r.sent, true);
    assert.deepEqual(calls.map((c) => c.method), ["sendPhoto"]);
    const f = calls[0].body;
    assert.equal(f.get("chat_id"), "c");
    assert.equal(f.get("caption"), "[H][P] [✅ ok] Service s\nt\n---\nd");
    assert.equal(f.get("photo").name, "shot.png");
    assert.equal(f.get("photo").size, 7);
  });

  it("long text: sendPhoto with short caption then full sendMessage", async () => {
    const calls = [];
    mockFetch(calls);
    const long = { ...alert, detail: "x".repeat(2000) };
    await sendServiceAlert(long, { env: env(), photoPath: png });
    assert.deepEqual(calls.map((c) => c.method), ["sendPhoto", "sendMessage"]);
    assert.equal(calls[0].body.get("caption"), "[H][P] [✅ ok] Service s\nt");
    assert.ok(JSON.parse(calls[1].body).text.length > 1024);
  });

  it("missing file: text-only with 'photo: not attached' line", async () => {
    const calls = [];
    mockFetch(calls);
    const r = await sendServiceAlert(alert, { env: env(), photoPath: path.join(dir, "nope.png") });
    assert.equal(r.sent, true);
    assert.deepEqual(calls.map((c) => c.method), ["sendMessage"]);
    const text = JSON.parse(calls[0].body).text;
    assert.ok(text.endsWith("d\nphoto: not attached (file not found)"));
  });

  it("empty file: text-only fallback", async () => {
    const calls = [];
    mockFetch(calls);
    const empty = path.join(dir, "empty.png");
    fs.writeFileSync(empty, "");
    await sendServiceAlert(alert, { env: env(), photoPath: empty });
    assert.deepEqual(calls.map((c) => c.method), ["sendMessage"]);
    assert.match(JSON.parse(calls[0].body).text, /photo: not attached \(file empty\)/);
  });

  it("sendPhoto error: text-only fallback, no token/url in reason", async () => {
    const calls = [];
    mockFetch(calls, 400);
    const r = await sendServiceAlert({ ...alert, detail: "" }, { env: env(), photoPath: png });
    assert.equal(r.sent, true);
    assert.deepEqual(calls.map((c) => c.method), ["sendPhoto", "sendMessage"]);
    const text = JSON.parse(calls[1].body).text;
    assert.match(text, /---\nphoto: not attached \(telegram 400/);
    assert.ok(!text.includes("SECRETTOKEN") && !text.includes("api.telegram.org"));
  });

  it("text-only call without photoPath is unchanged (no photo line)", async () => {
    const calls = [];
    mockFetch(calls);
    await sendServiceAlert(alert, { env: env() });
    assert.deepEqual(calls.map((c) => c.method), ["sendMessage"]);
    assert.equal(JSON.parse(calls[0].body).text, "[H][P] [✅ ok] Service s\nt\n---\nd");
  });
});
