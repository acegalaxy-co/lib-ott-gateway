"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createTelegramRateLimiter, sendMessageWithRetry, sendPhotoWithRetry } = require("./adapters/telegram/rate");
const { resolveIdentity } = require("./service-alert-identity");
const ICONS = { ok: "✅", fail: "❌", warn: "⚠️", info: "ℹ️", queued: "⏳", running: "🔄" };
// ponytail: hard cap below Telegram's 4096 limit; long output is truncated, not split.
const MAX_LEN = 3500;
// Telegram caption limit; longer alerts get a short caption + the full text as a normal message.
const CAPTION_MAX = 1024;
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp" };
const escHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hasLinks = (a) => Object.keys(a.links ?? {}).length > 0;
/** Plain text, or HTML (escaped) when `links` is set — send with parse_mode HTML in that case. */
function formatServiceAlert(a) {
    const html = hasLinks(a);
    const esc = html ? escHtml : (s) => s;
    const status = a.status in ICONS ? a.status : "info";
    const env = `[${a.host || "Local"}]`;
    const project = a.project ? `[${a.project}]` : "";
    const lines = [`${env}${project} [${ICONS[status]} ${status}] Service ${a.service ?? ""}`];
    if (a.title)
        lines.push(a.title);
    for (const [k, v] of Object.entries(a.fields ?? {})) {
        if (v !== undefined && v !== null && v !== "")
            lines.push(`${k}: ${v}`);
    }
    if (html) {
        lines.forEach((l, i) => (lines[i] = escHtml(l)));
        lines.push(Object.entries(a.links).map(([label, url]) => `<a href="${escHtml(url).replace(/"/g, "&quot;")}">${escHtml(label)}</a>`).join(" | "));
    }
    const detail = (a.detail ?? "").trim();
    if (detail)
        lines.push("---", esc(detail));
    const text = lines.join("\n");
    if (text.length <= MAX_LEN)
        return text;
    // ponytail: truncation only cuts detail-area text (links line precedes it); drop a dangling partial entity.
    const cut = text.slice(0, MAX_LEN - 1);
    return `${html ? cut.replace(/&[a-z]*$/, "") : cut}…`;
}
/** Resolve bot token / chat / host from env — same var names every service already uses. */
function resolveAlertTarget(env = process.env) {
    return {
        token: env.TELEGRAM_BOT_TOKEN_ALERT || env.TELEGRAM_BOT_TOKEN_NEXUS || "",
        chatId: env.TELEGRAM_CHAT_ALERT_ID || env.TELEGRAM_CHANNEL_STATUS_ALERT_ID || "",
        host: env.HOST_LABEL || "Local",
        project: env.ALERT_PROJECT || "",
    };
}
const limiter = createTelegramRateLimiter();
/** Short reason safe to show in an alert: no token, no URL. */
function safeReason(err, token) {
    return String(err?.message ?? err)
        .split(token)
        .join("<redacted>")
        .replace(/https?:\/\/\S+/g, "<url>")
        .replace(/\s+/g, " ")
        .slice(0, 100);
}
async function loadPhoto(photoPath) {
    let st;
    try {
        st = await fs.promises.stat(photoPath);
    }
    catch {
        throw new Error("file not found");
    }
    if (!st.isFile())
        throw new Error("not a file");
    if (st.size === 0)
        throw new Error("file empty");
    if (st.size > PHOTO_MAX_BYTES)
        throw new Error("file larger than 10 MB");
    let buf;
    try {
        buf = await fs.promises.readFile(photoPath);
    }
    catch {
        throw new Error("file unreadable");
    }
    const filename = path.basename(photoPath);
    return { blob: new Blob([buf], { type: MIME[path.extname(filename).toLowerCase()] || "application/octet-stream" }), filename };
}
/**
 * Best-effort send. Never throws (alerts must not crash a service) and never
 * includes the token/URL in the returned reason.
 */
async function sendServiceAlert(a, opts = {}) {
    const target = resolveAlertTarget(opts.env);
    const token = opts.token ?? target.token;
    const chatId = opts.chatId ?? target.chatId;
    if (!token || !chatId)
        return { sent: false, reason: "telegram not configured" };
    const id = resolveIdentity({ env: opts.env, project: a.project || target.project, service: a.service });
    const html = hasLinks(a);
    const parse = html ? { parse_mode: "HTML" } : {};
    const extra = { disable_web_page_preview: true, ...parse };
    const base = { ...a, host: a.host || target.host, project: id.project, service: id.service };
    const apiBase = opts.apiBase || "https://api.telegram.org";
    try {
        let photoNote = "";
        let photoSent = false;
        if (opts.photoPath) {
            try {
                const { blob, filename } = await loadPhoto(opts.photoPath);
                const full = formatServiceAlert(base);
                let caption = full;
                if (full.length > CAPTION_MAX) {
                    // header + title only (links/fields/detail dropped); escape ourselves when the message is HTML.
                    const short = formatServiceAlert({ ...base, fields: undefined, links: undefined, detail: undefined }).slice(0, 900);
                    caption = html ? escHtml(short) : short;
                }
                await sendPhotoWithRetry({ apiBase, token, chatId, photo: blob, filename, caption, extra: parse, limiter });
                photoSent = true;
                // photo is out: only the full-text follow-up remains (its failure must not re-send as "not attached").
                if (caption !== full)
                    await sendMessageWithRetry({ apiBase, token, chatId, text: full, extra, limiter });
                return { sent: true };
            }
            catch (err) {
                if (photoSent)
                    throw err;
                photoNote = `photo: not attached (${safeReason(err, token)})`;
            }
        }
        const detail = photoNote ? [(a.detail ?? "").trim(), photoNote].filter(Boolean).join("\n") : a.detail;
        const text = formatServiceAlert({ ...base, detail });
        await sendMessageWithRetry({ apiBase, token, chatId, text, extra, limiter });
        return { sent: true };
    }
    catch (err) {
        const msg = String(err?.message ?? err).split(token).join("<redacted>");
        return { sent: false, reason: msg };
    }
}
module.exports = { formatServiceAlert, sendServiceAlert, resolveAlertTarget };
//# sourceMappingURL=service-alert.js.map