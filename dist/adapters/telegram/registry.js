"use strict";
const { createTelegramClient } = require("./client");
const { createTelegramRateLimiter } = require("./rate");
/**
 * Create a registry of lazily-instantiated, cached Telegram clients keyed by
 * a caller-chosen bot key (e.g. "kane", "nexus"). Each key gets its own
 * rate limiter (via createTelegramRateLimiter(def.rate)) unless def.limiter
 * is explicitly given — so bots sharing a token must share a client/limiter
 * by registering under the same key, per the rate-limit-per-token invariant.
 *
 * Never reads process.env — callers pass env-derived values in `defs`.
 */
function createTelegramRegistry(defs) {
    const cache = new Map();
    function get(key) {
        const cached = cache.get(key);
        if (cached)
            return cached;
        const def = defs[key];
        if (!def)
            throw new Error(`unknown telegram bot: ${key}`);
        const limiter = def.limiter || createTelegramRateLimiter(def.rate);
        const client = createTelegramClient({
            token: def.token,
            apiBase: def.apiBase,
            maxLen: def.maxLen,
            maxRetry429: def.maxRetry429,
            requestTimeoutMs: def.requestTimeoutMs,
            limiter,
        });
        cache.set(key, client);
        return client;
    }
    function has(key) {
        return Object.prototype.hasOwnProperty.call(defs, key);
    }
    function keys() {
        return Object.keys(defs);
    }
    return { get, has, keys };
}
module.exports = { createTelegramRegistry };
//# sourceMappingURL=registry.js.map