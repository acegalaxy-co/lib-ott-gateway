"use strict";

// ott-gateway/identity/resolver.ts
// L2 — Identity Resolver.
//
// Supports 3 modes (env OTT_IDENTITY_MODE):
//   - "static" (default, backward compat): read OTT_IDENTITY_MAP env JSON only.
//   - "live": call Telegram getChatMember realtime; identity derived from chat membership.
//   - "hybrid": try live first, fallback to static on error/miss.
//
// Static env format (JSON string):
//   OTT_IDENTITY_MAP='{"telegram:123456":{"id":"user-alice","roles":["admin"]}, ...}'
// Shorthand (string value) supported:
//   OTT_IDENTITY_MAP='{"telegram:123456":"user-alice"}' → roles default = [].
//
// Live mode env:
//   OTT_LIVE_TELEGRAM_TOKEN — bot token used to call Telegram API.
//   OTT_LIVE_COMPANY_GROUP  — chat_id of the company group (getChatMember against this chat).
//   OTT_LIVE_ROLE_MAP       — JSON mapping Telegram chat-member status → internal role.
//                              Default: {"creator":"admin","administrator":"admin",
//                                        "member":"viewer","restricted":"viewer"}.
//
// Semantics:
//   - Positive outcomes are NEVER cached (user kicked from group must lose access immediately).
//   - Negative outcomes cached briefly (DENY_CACHE_TTL = 10s) to avoid API spam on denied users.
//   - Any error in live path → log warn + (hybrid: fallback static) | (live: return null).
//
// Returns: identity object `{ id, roles: string[] }` or null (→ L2 deny).

interface Identity {
  id: string;
  roles: string[];
}

interface NegCacheEntry {
  deniedAt: number;
}

type IdentityMode = "static" | "live" | "hybrid";

// ── Static map cache ────────────────────────────────────────────────────────
let _cache: Record<string, unknown> | null = null;
let _cacheRaw: string | null = null;

function _loadStaticMap(): Record<string, unknown> {
  const raw: string = process.env.OTT_IDENTITY_MAP || "";
  if (raw === _cacheRaw && _cache !== null) return _cache;
  _cacheRaw = raw;
  if (!raw) {
    _cache = {};
    return _cache;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    _cache = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch (_e: unknown) {
    // eslint-disable-next-line no-console
    console.warn("[ott-gateway][resolver] OTT_IDENTITY_MAP parse error — treat as empty");
    _cache = {};
  }
  return _cache;
}

function _resolveStatic(platformUserId: string, platform: string): Identity | null {
  const map: Record<string, unknown> = _loadStaticMap();
  const key: string = `${platform}:${platformUserId}`;
  const entry: unknown = map[key];
  if (!entry) return null;
  if (typeof entry === "string") return { id: entry, roles: [] };
  if (typeof entry === "object" && entry !== null && (entry as Record<string, unknown>).id) {
    const entryObj = entry as Record<string, unknown>;
    return {
      id: String(entryObj.id),
      roles: Array.isArray(entryObj.roles) ? (entryObj.roles as string[]) : [],
    };
  }
  return null;
}

// ── Role map cache (live mode) ──────────────────────────────────────────────
const DEFAULT_ROLE_MAP: Record<string, string> = {
  creator: "admin",
  administrator: "admin",
  member: "viewer",
  restricted: "viewer",
};

let _roleMapCache: Record<string, string> | null = null;
let _roleMapRaw: string | null = null;

function _loadRoleMap(): Record<string, string> {
  const raw: string = process.env.OTT_LIVE_ROLE_MAP || "";
  if (raw === _roleMapRaw && _roleMapCache !== null) return _roleMapCache;
  _roleMapRaw = raw;
  if (!raw) {
    _roleMapCache = { ...DEFAULT_ROLE_MAP };
    return _roleMapCache;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      _roleMapCache = { ...DEFAULT_ROLE_MAP, ...(parsed as Record<string, string>) };
    } else {
      _roleMapCache = { ...DEFAULT_ROLE_MAP };
    }
  } catch (_e: unknown) {
    // eslint-disable-next-line no-console
    console.warn("[ott-gateway][resolver] OTT_LIVE_ROLE_MAP parse error — using defaults");
    _roleMapCache = { ...DEFAULT_ROLE_MAP };
  }
  return _roleMapCache;
}

// ── Negative cache for live mode ────────────────────────────────────────────
// Keyed by `<platform>:<platformUserId>`; value = { deniedAt } (expires after TTL).
// Positive outcomes intentionally NOT cached — membership change must propagate immediately.
const DENY_CACHE_TTL_MS: number = 10 * 1000;
const _negCache: Map<string, NegCacheEntry> = new Map();

function _negHit(key: string): boolean {
  const entry: NegCacheEntry | undefined = _negCache.get(key);
  if (!entry) return false;
  if (Date.now() - entry.deniedAt > DENY_CACHE_TTL_MS) {
    _negCache.delete(key);
    return false;
  }
  return true;
}

function _negSet(key: string): void {
  _negCache.set(key, { deniedAt: Date.now() });
  // Opportunistic GC — bound memory when many distinct denies.
  if (_negCache.size > 1024) {
    const now: number = Date.now();
    for (const [k, v] of _negCache) {
      if (now - v.deniedAt > DENY_CACHE_TTL_MS) _negCache.delete(k);
    }
  }
}

// ── Live mode: Telegram getChatMember ───────────────────────────────────────
const LIVE_API_TIMEOUT_MS: number = 5000;

async function _resolveLiveTelegram(platformUserId: string): Promise<Identity | null> {
  const token: string | undefined = process.env.OTT_LIVE_TELEGRAM_TOKEN;
  const chatId: string = process.env.OTT_LIVE_COMPANY_GROUP || "";
  if (!token || !chatId) {
    // eslint-disable-next-line no-console
    console.warn(
      "[ott-gateway][resolver] live mode missing token/chatId — cannot resolve"
    );
    return null;
  }

  const url: string =
    `https://api.telegram.org/bot${encodeURIComponent(token)}/getChatMember` +
    `?chat_id=${encodeURIComponent(chatId)}` +
    `&user_id=${encodeURIComponent(platformUserId)}`;

  const controller: AbortController | null =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer: ReturnType<typeof setTimeout> | null = controller
    ? setTimeout(() => controller.abort(), LIVE_API_TIMEOUT_MS)
    : null;

  let res: Response;
  try {
    res = await fetch(url, controller ? { signal: controller.signal } : undefined);
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ott-gateway][resolver] live fetch error user=${platformUserId}: ${err && (err as Error).message}`
    );
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ott-gateway][resolver] live parse error user=${platformUserId}: ${err && (err as Error).message}`
    );
    return null;
  }

  const dataObj = data as Record<string, unknown> | null;
  if (!dataObj || dataObj.ok !== true || !dataObj.result) {
    // Non-ok response from Telegram (user not found / chat not found / etc.)
    return null;
  }

  const resultObj = dataObj.result as Record<string, unknown>;
  const status: string = String(resultObj.status || "");
  // Explicit deny statuses → return null (L2 deny).
  if (status === "left" || status === "kicked") return null;

  const roleMap: Record<string, string> = _loadRoleMap();
  const mappedRole: string | undefined = roleMap[status];
  if (!mappedRole) return null;

  return {
    id: `tg-${platformUserId}`,
    roles: [mappedRole],
  };
}

// ── Public API ──────────────────────────────────────────────────────────────
function _getMode(): IdentityMode {
  const raw: string = (process.env.OTT_IDENTITY_MODE || "static").trim().toLowerCase();
  if (raw === "live" || raw === "hybrid" || raw === "static") return raw;
  return "static";
}

/**
 * @param platformUserId
 * @param platform
 * @returns
 */
async function resolveIdentity(platformUserId: string, platform: string): Promise<Identity | null> {
  if (!platformUserId || !platform) return null;

  const mode: IdentityMode = _getMode();

  // STATIC — backward compatible path.
  if (mode === "static") {
    try {
      return _resolveStatic(platformUserId, platform);
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.warn(
        `[ott-gateway][resolver] static resolve error: ${err && (err as Error).message}`
      );
      return null;
    }
  }

  // LIVE / HYBRID — live path currently supports telegram only.
  if (platform !== "telegram") {
    if (mode === "hybrid") {
      try {
        return _resolveStatic(platformUserId, platform);
      } catch (_: unknown) {
        return null;
      }
    }
    // pure live + unsupported platform → default-deny.
    return null;
  }

  const negKey: string = `${platform}:${platformUserId}`;
  if (_negHit(negKey)) return null;

  let identity: Identity | null = null;
  try {
    identity = await _resolveLiveTelegram(platformUserId);
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ott-gateway][resolver] live resolve unexpected error: ${err && (err as Error).message}`
    );
    identity = null;
  }

  if (identity) {
    // Positive: do NOT cache (kick must propagate immediately).
    return identity;
  }

  // Live miss/failure.
  if (mode === "hybrid") {
    let staticHit: Identity | null = null;
    try {
      staticHit = _resolveStatic(platformUserId, platform);
    } catch (_: unknown) {
      staticHit = null;
    }
    if (staticHit) return staticHit;
  }

  // Cache the negative for short TTL so we don't hammer the API on repeated denies.
  _negSet(negKey);
  return null;
}

export = { resolveIdentity };