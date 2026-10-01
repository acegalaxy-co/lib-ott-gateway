"use strict";
const { createTelegramRateLimiter, sendMessageWithRetry } = require("./adapters/telegram/rate");
const ICONS = { ok: "✅", fail: "❌", warn: "⚠️", info: "ℹ️" };
// ponytail: hard cap below Telegram's 4096 limit; long output is truncated, not split.
const MAX_LEN = 3500;
const TZ = "Asia/Ho_Chi_Minh";
function formatTime(d) {
    // sv-SE locale renders "YYYY-MM-DD HH:mm".
    return d.toLocaleString("sv-SE", { timeZone: TZ, hour12: false }).slice(0, 16);
}
function formatServiceAlert(a) {
    const icon = ICONS[a.status] ?? ICONS.info;
    const lines = [`${icon} [${a.service}] ${a.title}`, `Host: ${a.host || "Local"} · ${formatTime(a.time ?? new Date())}`];
    for (const [k, v] of Object.entries(a.fields ?? {})) {
        if (v !== undefined && v !== null && v !== "")
            lines.push(`${k}: ${v}`);
    }
    const detail = (a.detail ?? "").trim();
    if (detail)
        lines.push("---", detail);
    const text = lines.join("\n");
    return text.length > MAX_LEN ? `${text.slice(0, MAX_LEN - 1)}…` : text;
}
/** Resolve bot token / chat / host from env — same var names every service already uses. */
function resolveAlertTarget(env = process.env) {
    return {
        token: env.TELEGRAM_ALERT_BOT_TOKEN || env.NEXUS_TELEGRAM_BOT_TOKEN || "",
        chatId: env.TELEGRAM_ALERT_CHAT_ID || env.NEXUS_TELEGRAM_CHANNEL_STATUS_ALERT || "",
        host: env.HOST_LABEL || "Local",
    };
}
const limiter = createTelegramRateLimiter();
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
    const text = formatServiceAlert({ ...a, host: a.host || target.host });
    try {
        await sendMessageWithRetry({
            apiBase: opts.apiBase || "https://api.telegram.org",
            token,
            chatId,
            text,
            extra: { disable_web_page_preview: true },
            limiter,
        });
        return { sent: true };
    }
    catch (err) {
        const msg = String(err?.message ?? err).split(token).join("<redacted>");
        return { sent: false, reason: msg };
    }
}
module.exports = { formatServiceAlert, sendServiceAlert, resolveAlertTarget };
//# sourceMappingURL=service-alert.js.map