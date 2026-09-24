"use strict";
// ── Static map cache ────────────────────────────────────────────────────────
let _cache = null;
let _cacheRaw = null;
function _loadStaticMap() {
    const raw = process.env.OTT_IDENTITY_MAP || "";
    if (raw === _cacheRaw && _cache !== null)
        return _cache;
    _cacheRaw = raw;
    if (!raw) {
        _cache = {};
        return _cache;
    }
    try {
        const parsed = JSON.parse(raw);
        _cache = parsed && typeof parsed === "object" ? parsed : {};
    }
    catch (_e) {
        // eslint-disable-next-line no-console
        console.warn("[ott-gateway][resolver] OTT_IDENTITY_MAP parse error — treat as empty");
        _cache = {};
    }
    return _cache;
}
function _resolveStatic(platformUserId, platform) {
    const map = _loadStaticMap();
    const key = `${platform}:${platformUserId}`;
    const entry = map[key];
    if (!entry)
        return null;
    if (typeof entry === "string")
        return { id: entry, roles: [] };
    if (typeof entry === "object" && entry !== null && entry.id) {
        const entryObj = entry;
        return {
            id: String(entryObj.id),
            roles: Array.isArray(entryObj.roles) ? entryObj.roles : [],
        };
    }
    return null;
}
// ── Role map cache (live mode) ──────────────────────────────────────────────
const DEFAULT_ROLE_MAP = {
    creator: "admin",
    administrator: "admin",
    member: "viewer",
    restricted: "viewer",
};
let _roleMapCache = null;
let _roleMapRaw = null;
function _loadRoleMap() {
    const raw = process.env.OTT_LIVE_ROLE_MAP || "";
    if (raw === _roleMapRaw && _roleMapCache !== null)
        return _roleMapCache;
    _roleMapRaw = raw;
    if (!raw) {
        _roleMapCache = { ...DEFAULT_ROLE_MAP };
        return _roleMapCache;
    }
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
            _roleMapCache = { ...DEFAULT_ROLE_MAP, ...parsed };
        }
        else {
            _roleMapCache = { ...DEFAULT_ROLE_MAP };
        }
    }
    catch (_e) {
        // eslint-disable-next-line no-console
        console.warn("[ott-gateway][resolver] OTT_LIVE_ROLE_MAP parse error — using defaults");
        _roleMapCache = { ...DEFAULT_ROLE_MAP };
    }
    return _roleMapCache;
}
// ── Negative cache for live mode ────────────────────────────────────────────
// Keyed by `<platform>:<platformUserId>`; value = { deniedAt } (expires after TTL).
// Positive outcomes intentionally NOT cached — membership change must propagate immediately.
const DENY_CACHE_TTL_MS = 10 * 1000;
const _negCache = new Map();
function _negHit(key) {
    const entry = _negCache.get(key);
    if (!entry)
        return false;
    if (Date.now() - entry.deniedAt > DENY_CACHE_TTL_MS) {
        _negCache.delete(key);
        return false;
    }
    return true;
}
function _negSet(key) {
    _negCache.set(key, { deniedAt: Date.now() });
    // Opportunistic GC — bound memory when many distinct denies.
    if (_negCache.size > 1024) {
        const now = Date.now();
        for (const [k, v] of _negCache) {
            if (now - v.deniedAt > DENY_CACHE_TTL_MS)
                _negCache.delete(k);
        }
    }
}
// ── Live mode: Telegram getChatMember ───────────────────────────────────────
const LIVE_API_TIMEOUT_MS = 5000;
async function _resolveLiveTelegram(platformUserId) {
    const token = process.env.OTT_LIVE_TELEGRAM_TOKEN;
    const chatId = process.env.OTT_LIVE_COMPANY_GROUP || "";
    if (!token || !chatId) {
        // eslint-disable-next-line no-console
        console.warn("[ott-gateway][resolver] live mode missing token/chatId — cannot resolve");
        return null;
    }
    const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/getChatMember` +
        `?chat_id=${encodeURIComponent(chatId)}` +
        `&user_id=${encodeURIComponent(platformUserId)}`;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller
        ? setTimeout(() => controller.abort(), LIVE_API_TIMEOUT_MS)
        : null;
    let res;
    try {
        res = await fetch(url, controller ? { signal: controller.signal } : undefined);
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[ott-gateway][resolver] live fetch error user=${platformUserId}: ${err && err.message}`);
        return null;
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
    let data;
    try {
        data = await res.json();
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[ott-gateway][resolver] live parse error user=${platformUserId}: ${err && err.message}`);
        return null;
    }
    const dataObj = data;
    if (!dataObj || dataObj.ok !== true || !dataObj.result) {
        // Non-ok response from Telegram (user not found / chat not found / etc.)
        return null;
    }
    const resultObj = dataObj.result;
    const status = String(resultObj.status || "");
    // Explicit deny statuses → return null (L2 deny).
    if (status === "left" || status === "kicked")
        return null;
    const roleMap = _loadRoleMap();
    const mappedRole = roleMap[status];
    if (!mappedRole)
        return null;
    return {
        id: `tg-${platformUserId}`,
        roles: [mappedRole],
    };
}
// ── Public API ──────────────────────────────────────────────────────────────
function _getMode() {
    const raw = (process.env.OTT_IDENTITY_MODE || "static").trim().toLowerCase();
    if (raw === "live" || raw === "hybrid" || raw === "static")
        return raw;
    return "static";
}
/**
 * @param platformUserId
 * @param platform
 * @returns
 */
async function resolveIdentity(platformUserId, platform) {
    if (!platformUserId || !platform)
        return null;
    const mode = _getMode();
    // STATIC — backward compatible path.
    if (mode === "static") {
        try {
            return _resolveStatic(platformUserId, platform);
        }
        catch (err) {
            // eslint-disable-next-line no-console
            console.warn(`[ott-gateway][resolver] static resolve error: ${err && err.message}`);
            return null;
        }
    }
    // LIVE / HYBRID — live path currently supports telegram only.
    if (platform !== "telegram") {
        if (mode === "hybrid") {
            try {
                return _resolveStatic(platformUserId, platform);
            }
            catch (_) {
                return null;
            }
        }
        // pure live + unsupported platform → default-deny.
        return null;
    }
    const negKey = `${platform}:${platformUserId}`;
    if (_negHit(negKey))
        return null;
    let identity = null;
    try {
        identity = await _resolveLiveTelegram(platformUserId);
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[ott-gateway][resolver] live resolve unexpected error: ${err && err.message}`);
        identity = null;
    }
    if (identity) {
        // Positive: do NOT cache (kick must propagate immediately).
        return identity;
    }
    // Live miss/failure.
    if (mode === "hybrid") {
        let staticHit = null;
        try {
            staticHit = _resolveStatic(platformUserId, platform);
        }
        catch (_) {
            staticHit = null;
        }
        if (staticHit)
            return staticHit;
    }
    // Cache the negative for short TTL so we don't hammer the API on repeated denies.
    _negSet(negKey);
    return null;
}
module.exports = { resolveIdentity };
//# sourceMappingURL=resolver.js.map