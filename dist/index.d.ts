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
declare function dispatchInbound(rawPayload: unknown, platform?: string, headers?: Record<string, string>): Promise<DispatchResult>;
declare const _default: {
    dispatchInbound: typeof dispatchInbound;
};
export = _default;
//# sourceMappingURL=index.d.ts.map