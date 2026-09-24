interface RateLimiterOptions {
    globalIntervalMs?: number;
    channelIntervalMs?: number;
    channelTtlMs?: number;
}
interface RateLimiter {
    acquireSlot(chatId: string | number): Promise<void>;
}
/**
 * Create a token-bucket rate limiter — per-channel + global.
 * @param opts.globalIntervalMs  min ms between any two sends bot-wide (default 35 ~28/s)
 * @param opts.channelIntervalMs min ms between two sends to the same chat (default 1000 ~1/s)
 * @param opts.channelTtlMs      forget idle channel entries after this long (default 10 min)
 */
declare function createTelegramRateLimiter({ globalIntervalMs, channelIntervalMs, channelTtlMs, }?: RateLimiterOptions): RateLimiter;
interface SendMessageWithRetryOptions {
    apiBase: string;
    token: string;
    chatId: string | number;
    text: string;
    extra?: Record<string, unknown>;
    limiter: RateLimiter;
    maxRetry?: number;
    timeoutMs?: number;
}
/**
 * Send one Telegram message, honoring proactive throttle + 429 retry_after.
 * @returns parsed Telegram response JSON (last successful attempt).
 * @throws on non-429 HTTP error or after exhausting 429 retries.
 */
declare function sendMessageWithRetry({ apiBase, token, chatId, text, extra, limiter, maxRetry, timeoutMs, }: SendMessageWithRetryOptions): Promise<unknown>;
declare const _default: {
    createTelegramRateLimiter: typeof createTelegramRateLimiter;
    sendMessageWithRetry: typeof sendMessageWithRetry;
};
export = _default;
//# sourceMappingURL=rate.d.ts.map