type PolicyMode = "off" | "shadow" | "enforce";
interface PolicyContext {
    chatId: string | number;
    method: "sendText" | "sendMessage";
    extra?: Record<string, unknown>;
    meta?: Record<string, unknown>;
}
interface PolicyResult {
    action: "allow" | "deny" | "transform";
    text?: string;
    chatId?: string | number;
    reason?: string;
}
interface OutboundPolicy {
    name: string;
    mode: PolicyMode;
    evaluate(text: string, ctx: PolicyContext): PolicyResult | Promise<PolicyResult>;
}
interface ShadowEvent {
    policy: string;
    result: PolicyResult;
    text: string;
    chatId: string | number;
    method: string;
    meta?: Record<string, unknown>;
}
interface PolicyPipelineConfig {
    policies: OutboundPolicy[];
    onShadowResult?: (ev: ShadowEvent) => void;
    onDeny?: (ev: {
        policy: string;
        reason?: string;
        chatId: string | number;
        meta?: Record<string, unknown>;
    }) => void;
    onError?: "fail-open" | "fail-closed";
}
type PipelineVerdict = {
    ok: true;
    text: string;
    chatId: string | number;
} | {
    ok: false;
    blocked: true;
    reason: string;
    policy: string;
};
declare function createPolicyPipeline(cfg: PolicyPipelineConfig): {
    evaluate(text: string, ctx: PolicyContext): Promise<PipelineVerdict>;
};
declare const _default: {
    createPolicyPipeline: typeof createPolicyPipeline;
};
export = _default;
//# sourceMappingURL=policy.d.ts.map