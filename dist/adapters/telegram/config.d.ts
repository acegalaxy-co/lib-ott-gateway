interface RateLimiterLike {
    acquireSlot(chatId: string | number): Promise<void>;
}
interface TelegramClientConfig {
    token?: string;
    apiBase?: string;
    maxLen?: number;
    maxRetry429?: number;
    requestTimeoutMs?: number;
    limiter?: RateLimiterLike;
    /**
     * Optional hook invoked on the full text right before it is split into
     * chunks and sent (e.g. to prepend an env/project tag). Consumer-specific
     * business logic (whitelist, DM authz, testMode redirect, ...) does NOT
     * belong here — keep that in the calling app, this lib stays generic.
     */
    beforeSend?: (text: string, chatId: string | number) => string;
}
/**
 * Resolve a TelegramClientConfig, filling in defaults. Options passed in
 * explicitly always win; otherwise falls back to env vars, read lazily at
 * call time (i.e. when createTelegramClient() is invoked) — never at
 * module-load time, so tests can freely mutate process.env between runs.
 */
declare function resolveTelegramConfig(partial?: TelegramClientConfig): Required<Omit<TelegramClientConfig, "token" | "limiter" | "beforeSend">> & Pick<TelegramClientConfig, "token" | "limiter" | "beforeSend">;
declare const _default: {
    resolveTelegramConfig: typeof resolveTelegramConfig;
};
export = _default;
//# sourceMappingURL=config.d.ts.map