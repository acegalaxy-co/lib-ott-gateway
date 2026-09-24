"use strict";
const { TelegramAdapter } = require("./adapters/telegram");
const { resolveIdentity } = require("./identity/resolver");
const authz = require("./authz/engine");
const limiter = require("./rate-limit/limiter");
const replayGuard = require("./rate-limit/replay-guard");
const audit = require("./audit/logger");

// Singleton adapter registry (lazy). Extend here when adding platforms.
const _adapters: Map<string, typeof TelegramAdapter | null> = new Map();

function _getAdapter(platform: string): typeof TelegramAdapter | null {
  if (_adapters.has(platform)) return _adapters.get(platform) as typeof TelegramAdapter | null;
  let adapter: typeof TelegramAdapter | null;
  switch (platform) {
    case "telegram":
      adapter = new TelegramAdapter();
      break;
    default:
      return null;
  }
  _adapters.set(platform, adapter);
  return adapter;
}

function _nowIso(): string {
  return new Date().toISOString();
}

interface OutcomeRecord {
  ts: string;
  platform: string;
  messageId: string;
  platformUserId: string;
  identity: string | null;
  command: string | null;
  outcome: "allow" | "deny";
  denyReason: string | null;
  latencyMs: number;
}

interface AuthzResult {
  allow: boolean;
  reason: string;
}

interface ParsedMessage {
  messageId?: string;
  platformUserId?: string;
  command?: string | null;
}

interface Identity {
  id: string;
}

interface DispatchResult {
  outcome: "allow" | "deny";
  denyReason: string | null;
  latencyMs: number;
  message?: ParsedMessage;
  identity?: Identity;
}

/**
 * Dispatch an inbound OTT message through all 5 layers.
 * Never throws — returns outcome + denyReason (if any) + latencyMs.
 *
 * @param rawPayload raw platform payload (e.g. Telegram Update)
 * @param platform
 * @param headers HTTP headers (lowercased keys expected)
 * @returns outcome + denyReason + latencyMs
 */
async function dispatchInbound(
  rawPayload: unknown,
  platform: string = "telegram",
  headers: Record<string, string> = {}
): Promise<DispatchResult> {
  const started: number = Date.now();

  // Partial outcome we accumulate as we go — always audited at the end.
  const outcome: OutcomeRecord = {
    ts: _nowIso(),
    platform,
    messageId: "",
    platformUserId: "",
    identity: null,
    command: null,
    outcome: "deny",
    denyReason: null,
    latencyMs: 0,
  };

  try {
    const adapter: typeof TelegramAdapter | null = _getAdapter(platform);
    if (!adapter) {
      outcome.denyReason = "L1_signature";
      return _finalize(outcome, started);
    }

    // L1 — Adapter verify + parse
    let verified: boolean = false;
    try {
      verified = await adapter.verify(rawPayload, headers);
    } catch (_e: unknown) {
      verified = false;
    }
    if (!verified) {
      outcome.denyReason = "L1_signature";
      return _finalize(outcome, started);
    }

    let msg: ParsedMessage;
    try {
      msg = await adapter.parse(rawPayload);
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.error("[ott-gateway] adapter.parse failed:", err && (err as Error).message);
      outcome.denyReason = "L1_signature";
      return _finalize(outcome, started);
    }
    outcome.messageId = msg.messageId || "";
    outcome.platformUserId = msg.platformUserId || "";
    outcome.command = msg.command || null;

    // L2 — Identity resolver (default-deny)
    let identity: Identity | null = null;
    try {
      identity = await resolveIdentity(msg.platformUserId, platform);
    } catch (_e: unknown) {
      identity = null;
    }
    if (!identity) {
      outcome.denyReason = "L2_unknown_identity";
      return _finalize(outcome, started);
    }
    outcome.identity = identity.id;

    // L3 — Authz (default-deny)
    let authzResult: AuthzResult = { allow: false, reason: "unknown" };
    try {
      authzResult = await authz.check(identity, msg.command, platform);
    } catch (_e: unknown) {
      authzResult = { allow: false, reason: "authz error" };
    }
    if (!authzResult.allow) {
      outcome.denyReason = "L3_authz";
      return _finalize(outcome, started);
    }

    // L4 — Replay guard (check BEFORE rate limit so replays don't consume quota)
    let isReplay: boolean = false;
    try {
      isReplay = await replayGuard.seen(msg.messageId);
    } catch (_e: unknown) {
      isReplay = false;
    }
    if (isReplay) {
      outcome.denyReason = "L4_replay";
      return _finalize(outcome, started);
    }

    let rateOk: boolean = false;
    try {
      rateOk = await limiter.check(identity.id, msg.command);
    } catch (_e: unknown) {
      rateOk = false;
    }
    if (!rateOk) {
      outcome.denyReason = "L4_rate_limit";
      return _finalize(outcome, started);
    }

    // All layers passed → allow. L5 audit will record.
    outcome.outcome = "allow";
    outcome.denyReason = null;
    const finalized: DispatchResult = await _finalize(outcome, started);
    return { ...finalized, message: msg, identity };
  } catch (err: unknown) {
    // Top-level safety net — MUST NOT propagate.
    // eslint-disable-next-line no-console
    console.error("[ott-gateway] dispatchInbound fatal:", err && (err as Error).message);
    outcome.denyReason = outcome.denyReason || "L1_signature";
    return _finalize(outcome, started);
  }
}

async function _finalize(outcome: OutcomeRecord, started: number): Promise<DispatchResult> {
  outcome.latencyMs = Date.now() - started;
  try {
    await audit.record(outcome);
  } catch (_e: unknown) {
    // already swallowed inside audit.record, but double-guard
  }
  return {
    outcome: outcome.outcome,
    denyReason: outcome.denyReason,
    latencyMs: outcome.latencyMs,
  };
}

export = { dispatchInbound };
