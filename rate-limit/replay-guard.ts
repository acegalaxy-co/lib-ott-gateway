"use strict";

const { createReplayGuard } = require("@acegalaxy/security-utils/rate-limit");

const TTL_MS: number = 60 * 60 * 1000;

const guard: ReturnType<typeof createReplayGuard> = createReplayGuard({ ttlMs: TTL_MS });

/**
 * @param {string} messageId
 * @returns {Promise<boolean>} true if already seen (= replay), false if fresh.
 *                              Async kept for API parity (shared lib is sync).
 */
async function seen(messageId: string): Promise<boolean> {
  return guard.seen(messageId);
}

export = { seen, TTL_MS };