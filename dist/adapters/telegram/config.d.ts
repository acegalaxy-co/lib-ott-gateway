interface RateLimiterLike {
    acquireSlot(chatId: string | number): Promise<void>;
}
interface TelegramClientConfig {
    /**
     * Bot token — a plain string, or a getter invoked on every call (e.g.
     * `() => process.env.MY_BOT_TOKEN`). Using a getter lets a consumer rotate
     * or lazily load the token without recreating the client.
     */
    token?: string | (() => string | undefined);
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
    /**
     * Optional outbound policy pipeline (see policy.ts) — evaluated exactly
     * once per sendText()/sendMessage() call (sendText: on the full,
     * beforeSend-tagged text, BEFORE splitting into chunks). beforeSend
     * always runs first; the pipeline sees its output. Omitted → byte-identical
     * behavior to no policy at all.
     */
    policy?: Parameters<typeof import("./policy").createPolicyPipeline>[0];
}
/**
 * Resolve a TelegramClientConfig, filling in defaults. Options passed in
 * explicitly always win; otherwise falls back to env vars, read lazily at
 * call time (i.e. when createTelegramClient() is invoked) — never at
 * module-load time, so tests can freely mutate process.env between runs.
 */
declare function resolveTelegramConfig(partial?: TelegramClientConfig): Required<Omit<TelegramClientConfig, "token" | "limiter" | "beforeSend" | "policy">> & Pick<TelegramClientConfig, "token" | "limiter" | "beforeSend" | "policy">;
declare const _default: {
    resolveTelegramConfig: typeof resolveTelegramConfig;
};
export = _default;
//# sourceMappingURL=config.d.ts.map