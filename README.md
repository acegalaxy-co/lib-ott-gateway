# ott-gateway/

Per-project OTT inbound gateway for ACE Nexus One. Source of truth for the spec:
`rules/system/07-ott-gateway-mandatory.md`.

## What it is

A thin, in-project module that funnels **every inbound OTT message** (Telegram, and
future WhatsApp/Teams/Slack/Discord/WeChat) through 5 mandatory, default-deny
security layers before handoff to business logic.

Outbound notify continues to use the existing `notify/` channel layer — this module
does **not** replace it.

## 5 layers → folder map

| Layer | Purpose                                  | Folder / file                              |
| ----- | ---------------------------------------- | ------------------------------------------ |
| L1    | Adapter verify + parse (platform)        | `adapters/<platform>.js`                   |
| L2    | Identity resolver (platform id → user)   | `identity/resolver.js`                     |
| L3    | Authz (role-based, per-platform policy)  | `authz/engine.js` + `authz/policies/*.json`|
| L4    | Rate limit + replay guard                | `rate-limit/limiter.js` + `replay-guard.js`|
| L5    | Append-only audit log (allow AND deny)   | `audit/logger.js` → `audit/audit.log`      |

Entry: `require('./ott-gateway').dispatchInbound(rawPayload, platform, headers)`.
Returns `{ outcome, denyReason, latencyMs, message?, identity? }`. Never throws.

## Env knobs

- `TELEGRAM_BOT_TOKEN` — bot token (outbound; adapter reads for future send()).
- `TELEGRAM_WEBHOOK_SECRET` — expected value of `x-telegram-bot-api-secret-token`
  header. If unset → **DEV MODE** (verify bypassed, warn logged).
- `OTT_IDENTITY_MAP` — JSON map, e.g.
  `'{"telegram:123456":{"id":"user-alice","roles":["admin"]}}'`.

## Wiring into legacy code — NOT done yet (Phase 2)

Legacy inbound handler `src/app/llm/telegram-bot.js` still runs as-is. Per rule 07
migration path, Phase 1 (this skeleton) is intentionally parallel. Phase 2 will
migrate handlers one command at a time; Phase 3 enforces grep to ban SDK imports
outside `ott-gateway/adapters/`.

## Sanity check (pre-commit)

```bash
grep -rn "node-telegram-bot-api\|@slack/bolt\|@microsoft/teams" . \
  --include="*.js" \
  --exclude-dir=ott-gateway/adapters \
  --exclude-dir=node_modules
```

Must be empty once Phase 3 lands.
