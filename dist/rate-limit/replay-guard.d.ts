/**
 * @param {string} messageId
 * @returns {Promise<boolean>} true if already seen (= replay), false if fresh.
 *                              Async kept for API parity (shared lib is sync).
 */
declare function seen(messageId: string): Promise<boolean>;
declare const _default: {
    seen: typeof seen;
    TTL_MS: number;
};
export = _default;
//# sourceMappingURL=replay-guard.d.ts.map