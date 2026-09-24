declare const createTelegramClient: any;
interface RateLimiterLike {
    acquireSlot(chatId: string | number): Promise<void>;
}
interface RateOptions {
    globalIntervalMs?: number;
    channelIntervalMs?: number;
}
interface TelegramRegistryDef {
    token?: string | (() => string | undefined);
    apiBase?: string;
    maxLen?: number;
    maxRetry429?: number;
    requestTimeoutMs?: number;
    limiter?: RateLimiterLike;
    rate?: RateOptions;
    beforeSend?: (text: string, chatId: string | number) => string;
    policy?: Parameters<typeof import("./policy").createPolicyPipeline>[0];
}
/**
 * Create a registry of lazily-instantiated, cached Telegram clients keyed by
 * a caller-chosen bot key (e.g. "kane", "nexus"). Each key gets its own
 * rate limiter (via createTelegramRateLimiter(def.rate)) unless def.limiter
 * is explicitly given — so bots sharing a token must share a client/limiter
 * by registering under the same key, per the rate-limit-per-token invariant.
 *
 * Never reads process.env — callers pass env-derived values in `defs`.
 */
declare function createTelegramRegistry(defs: Record<string, TelegramRegistryDef>): {
    get: (key: string) => ReturnType<typeof createTelegramClient>;
    has: (key: string) => boolean;
    keys: () => string[];
};
declare const _default: {
    createTelegramRegistry: typeof createTelegramRegistry;
};
export = _default;
//# sourceMappingURL=registry.d.ts.map