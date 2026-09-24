// ─────────────────────────────────────────────────────────────────────
// Telegram outbound rate limiter — token-bucket (per-channel + global)
// with 429 retry_after honoring.
//
// Two layers:
//   1. createTelegramRateLimiter().acquireSlot(chatId) — proactive: never
//      send faster than the configured limits.
//   2. sendMessageWithRetry()                          — reactive: on 429,
//      sleep retry_after then retry.
// ─────────────────────────────────────────────────────────────────────
"use strict";

interface RateLimiterOptions {
  globalIntervalMs?: number;
  channelIntervalMs?: number;
  channelTtlMs?: number;
}

interface RateLimiter {
  acquireSlot(chatId: string | number): Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Create a token-bucket rate limiter — per-channel + global.
 * @param opts.globalIntervalMs  min ms between any two sends bot-wide (default 35 ~28/s)
 * @param opts.channelIntervalMs min ms between two sends to the same chat (default 1000 ~1/s)
 * @param opts.channelTtlMs      forget idle channel entries after this long (default 10 min)
 */
function createTelegramRateLimiter({
  globalIntervalMs = 35,
  channelIntervalMs = 1000,
  channelTtlMs = 600000,
}: RateLimiterOptions = {}): RateLimiter {
  let globalNextAt = 0;
  const channelNextAt = new Map<string, number>();

  function cleanup(now: number): void {
    for (const [k, t] of channelNextAt) {
      if (t + channelTtlMs < now) channelNextAt.delete(k);
    }
  }

  async function acquireSlot(chatId: string | number): Promise<void> {
    const key = String(chatId || "*");
    // Per-channel slot
    let now = Date.now();
    if (channelNextAt.size > 64) cleanup(now);
    const chNext = channelNextAt.get(key) || 0;
    let waitCh = 0;
    if (chNext > now) {
      waitCh = chNext - now;
      channelNextAt.set(key, chNext + channelIntervalMs);
    } else {
      channelNextAt.set(key, now + channelIntervalMs);
    }
    // Global slot
    now = Date.now();
    const glNext = globalNextAt;
    let waitGl = 0;
    if (glNext > now) {
      waitGl = glNext - now;
      globalNextAt = glNext + globalIntervalMs;
    } else {
      globalNextAt = now + globalIntervalMs;
    }
    const wait = Math.max(waitCh, waitGl);
    if (wait > 0) await sleep(wait);
  }

  return { acquireSlot };
}

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
async function sendMessageWithRetry({
  apiBase,
  token,
  chatId,
  text,
  extra = {},
  limiter,
  maxRetry = 3,
  timeoutMs = 15000,
}: SendMessageWithRetryOptions): Promise<unknown> {
  if (!token) throw new Error("telegram-rate: token missing");
  const url = `${apiBase}/bot${token}/sendMessage`;
  const payload = { chat_id: String(chatId), text, ...extra };

  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    await limiter.acquireSlot(chatId);
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (resp.ok) return resp.json().catch(() => undefined);

    if (resp.status === 429 && attempt < maxRetry) {
      const body = await resp.json().catch(() => ({}));
      const retryAfter = Number(body?.parameters?.retry_after) || 2;
      console.warn(`⏳ [telegram-rate] 429 chat=${chatId} — retry in ${retryAfter}s (attempt ${attempt + 1}/${maxRetry})`);
      await sleep(retryAfter * 1000 + 250);
      continue;
    }
    const errText = await resp.text().catch(() => "");
    throw new Error(`telegram ${resp.status}: ${errText.slice(0, 200)}`);
  }
  throw new Error(`telegram: exhausted ${maxRetry} retries on 429 (chat=${chatId})`);
}

export = { createTelegramRateLimiter, sendMessageWithRetry };
