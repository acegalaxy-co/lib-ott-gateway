/**
 * @typedef {Object} InboundMessage
 * @property {string} platform        "telegram" | "whatsapp" | ...
 * @property {string} messageId       platform-specific id (for replay guard)
 * @property {string} platformUserId  raw user id from platform
 * @property {string} chatId          raw chat/channel id
 * @property {string} text            normalized text content
 * @property {string|null} command    parsed command (e.g. "/status") or null
 * @property {Object} raw             original payload (for adapter-specific needs)
 * @property {number} ts              Unix ms
 */
/**
 * @typedef {Object} OutcomeRecord
 * @property {string} ts              ISO timestamp
 * @property {string} platform
 * @property {string} messageId
 * @property {string} platformUserId
 * @property {string|null} identity   internal identity id, null if L2 fail
 * @property {string|null} command
 * @property {"allow"|"deny"} outcome
 * @property {string|null} denyReason "L1_signature" | "L2_unknown_identity" |
 *                                     "L3_authz" | "L4_rate_limit" | "L4_replay"
 * @property {number} latencyMs
 */
export interface InboundMessage {
    platform: string;
    messageId: string;
    platformUserId: string;
    chatId: string;
    text: string;
    command: string | null;
    raw: Record<string, unknown>;
    ts: number;
}
export interface OutcomeRecord {
    ts: string;
    platform: string;
    messageId: string;
    platformUserId: string;
    identity: string | null;
    command: string | null;
    outcome: "allow" | "deny";
    denyReason: "L1_signature" | "L2_unknown_identity" | "L3_authz" | "L4_rate_limit" | "L4_replay" | null;
    latencyMs: number;
}
declare const _default: {};
export = _default;
//# sourceMappingURL=types.d.ts.map