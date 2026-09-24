"use strict";
function numEnv(name) {
    const raw = process.env[name];
    if (!raw)
        return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
}
/**
 * Resolve a TelegramClientConfig, filling in defaults. Options passed in
 * explicitly always win; otherwise falls back to env vars, read lazily at
 * call time (i.e. when createTelegramClient() is invoked) — never at
 * module-load time, so tests can freely mutate process.env between runs.
 */
function resolveTelegramConfig(partial = {}) {
    return {
        token: partial.token || process.env.TELEGRAM_BOT_TOKEN || undefined,
        apiBase: partial.apiBase || process.env.TELEGRAM_API_BASE || "https://api.telegram.org",
        maxLen: partial.maxLen ?? numEnv("TELEGRAM_MAX_LEN") ?? 4000,
        maxRetry429: partial.maxRetry429 ?? numEnv("TELEGRAM_MAX_RETRY_429") ?? 3,
        requestTimeoutMs: partial.requestTimeoutMs ?? numEnv("TELEGRAM_REQUEST_TIMEOUT_MS") ?? 15000,
        limiter: partial.limiter,
        beforeSend: partial.beforeSend,
    };
}
module.exports = { resolveTelegramConfig };
//# sourceMappingURL=config.js.map