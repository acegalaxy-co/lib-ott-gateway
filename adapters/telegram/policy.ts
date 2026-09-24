// ─────────────────────────────────────────────────────────────────────
// Outbound policy pipeline — runs OutboundPolicy[] in order against a
// message's text before it hits Telegram. Three modes per policy:
//   "off"     — skipped entirely.
//   "shadow"  — evaluated, result reported via onShadowResult, NEVER applied.
//   "enforce" — result applied: allow (next), transform (rewrite text/chatId,
//               next policy sees the new values), deny (stop, blocked).
// Consumer-specific business logic (whitelist, DM authz, ...) lives in the
// policies passed in `cfg.policies` — this pipeline itself stays generic.
// ─────────────────────────────────────────────────────────────────────
"use strict";

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
  // `mode` may be a getter (e.g. `get mode() { return resolveMode(); }`) so
  // consumers can flip off/shadow/enforce via env without recreating the
  // pipeline — read fresh on EVERY evaluate(), never cached.
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
  onDeny?: (ev: { policy: string; reason?: string; chatId: string | number; meta?: Record<string, unknown> }) => void;
  // "fail-open" (default): a policy that throws is logged and treated as
  // allow (pipeline continues to the next policy). "fail-closed": treated
  // as a deny with reason `policy-error:<name>`.
  onError?: "fail-open" | "fail-closed";
}

type PipelineVerdict =
  | { ok: true; text: string; chatId: string | number }
  | { ok: false; blocked: true; reason: string; policy: string };

function safeCall(fn: (() => void) | undefined, label: string): void {
  if (!fn) return;
  try {
    fn();
  } catch (err) {
    console.error(`[ott-gateway] ${label} threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function createPolicyPipeline(cfg: PolicyPipelineConfig): { evaluate(text: string, ctx: PolicyContext): Promise<PipelineVerdict> } {
  const failClosed = cfg.onError === "fail-closed";
  const policies = cfg.policies || [];

  function deny(policyName: string, reason: string, chatId: string | number, meta?: Record<string, unknown>): PipelineVerdict {
    safeCall(() => cfg.onDeny && cfg.onDeny({ policy: policyName, reason, chatId, meta }), "onDeny");
    return { ok: false, blocked: true, reason, policy: policyName };
  }

  async function evaluate(text: string, ctx: PolicyContext): Promise<PipelineVerdict> {
    let currentText = text;
    let currentChatId = ctx.chatId;

    for (const policy of policies) {
      const mode = policy.mode; // read fresh every time — may be a getter
      if (mode === "off") continue;

      let result: PolicyResult;
      try {
        result = await policy.evaluate(currentText, { ...ctx, chatId: currentChatId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[ott-gateway] policy "${policy.name}" threw: ${message}`);
        if (failClosed) return deny(policy.name, `policy-error:${policy.name}`, currentChatId, ctx.meta);
        continue; // fail-open: treat this policy as allow, keep evaluating the rest
      }

      if (mode === "shadow") {
        safeCall(
          () =>
            cfg.onShadowResult &&
            cfg.onShadowResult({
              policy: policy.name,
              result,
              text: currentText,
              chatId: currentChatId,
              method: ctx.method,
              meta: ctx.meta,
            }),
          "onShadowResult"
        );
        continue; // shadow result is never applied
      }

      // mode === "enforce"
      if (result.action === "deny") {
        return deny(policy.name, result.reason || `denied:${policy.name}`, currentChatId, ctx.meta);
      }
      if (result.action === "transform") {
        if (result.text !== undefined) currentText = result.text;
        if (result.chatId !== undefined) currentChatId = result.chatId;
      }
      // "allow" (or transform, already applied above) — fall through to the next policy
    }

    return { ok: true, text: currentText, chatId: currentChatId };
  }

  return { evaluate };
}

export = { createPolicyPipeline };
