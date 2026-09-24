"use strict";
const { createReplayGuard } = require("@acegalaxy/lib-security-utils/rate-limit");
const TTL_MS = 60 * 60 * 1000;
const guard = createReplayGuard({ ttlMs: TTL_MS });
/**
 * @param {string} messageId
 * @returns {Promise<boolean>} true if already seen (= replay), false if fresh.
 *                              Async kept for API parity (shared lib is sync).
 */
async function seen(messageId) {
    return guard.seen(messageId);
}
module.exports = { seen, TTL_MS };
//# sourceMappingURL=replay-guard.js.map