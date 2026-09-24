"use strict";

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

function numEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Resolve a TelegramClientConfig, filling in defaults. Options passed in
 * explicitly always win; otherwise falls back to env vars, read lazily at
 * call time (i.e. when createTelegramClient() is invoked) — never at
 * module-load time, so tests can freely mutate process.env between runs.
 */
function resolveTelegramConfig(partial: TelegramClientConfig = {}): Required<
  Omit<TelegramClientConfig, "token" | "limiter" | "beforeSend">
> &
  Pick<TelegramClientConfig, "token" | "limiter" | "beforeSend"> {
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

export = { resolveTelegramConfig };
