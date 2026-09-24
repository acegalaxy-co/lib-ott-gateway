"use strict";
const { createTelegramClient } = require("./client");
const { createTelegramRateLimiter } = require("./rate");

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
function createTelegramRegistry(defs: Record<string, TelegramRegistryDef>) {
  const cache = new Map<string, ReturnType<typeof createTelegramClient>>();

  function get(key: string): ReturnType<typeof createTelegramClient> {
    const cached = cache.get(key);
    if (cached) return cached;

    const def = defs[key];
    if (!def) throw new Error(`unknown telegram bot: ${key}`);

    const limiter = def.limiter || createTelegramRateLimiter(def.rate);
    const client = createTelegramClient({
      token: def.token,
      apiBase: def.apiBase,
      maxLen: def.maxLen,
      maxRetry429: def.maxRetry429,
      requestTimeoutMs: def.requestTimeoutMs,
      limiter,
      beforeSend: def.beforeSend,
      policy: def.policy,
    });
    cache.set(key, client);
    return client;
  }

  function has(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(defs, key);
  }

  function keys(): string[] {
    return Object.keys(defs);
  }

  return { get, has, keys };
}

export = { createTelegramRegistry };
