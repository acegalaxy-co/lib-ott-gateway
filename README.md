# @acegalaxy/lib-ott-gateway

**Inbound message security gateway for bots — 5 layers, default-deny.**

Stop bot framework abuse. Most Telegram/WhatsApp/WeChat bot frameworks treat
*"can the bot read this message?"* as the only access check. That's not authz —
that's just delivery. `lib-ott-gateway` sits between your bot transport and your
handler and enforces real authorization on every inbound message.

## Why

A raw bot token says nothing about *who* is on the other end. Anyone who can
DM your bot, or get added to a group with it, can hit your handlers. Real
products need:

- per-platform policy (block bots, block forwarded floods, block unknown chats)
- mapped identity (Telegram user_id → your internal user/role)
- rate limits per identity, not per IP
- audit log of every accept/deny decision
- a single forward point so handlers never see un-vetted input

`lib-ott-gateway` gives you all five as composable layers.

## The 5 layers

Every inbound message walks the chain top-to-bottom. Any layer can `deny`.

1. **L1 — Adapter (verify + parse)** — platform signature check, normalize payload.
2. **L2 — Identity resolver** — map platform principal (e.g. `telegram:user_id`)
   to your internal identity + role. Unknown principal → deny.
3. **L3 — Authz** — role-based ACL per command/chat/platform (default-deny).
4. **L4 — Rate limit + replay guard** — sliding window per identity + message-id
   dedup so replays don't consume quota.
5. **L5 — Audit** — append-only JSONL of every allow/deny decision.

Default at every layer is **deny**. You allowlist explicitly.

## Install

```json
"dependencies": {
  "@acegalaxy/lib-ott-gateway": "github:acegalaxy-co/lib-ott-gateway#v0.2.0"
}
```

Private git-dependency — requires SSH access to `acegalaxy-co/lib-ott-gateway`.
Depends on `@acegalaxy/lib-security-utils` (audit-log + rate-limit primitives),
also consumed as a private git-dependency.

CI (this repo and any consumer that installs private `lib-*` git-deps) needs
the org secret `LIB_DEPS_TOKEN` — a read-only fine-grained GitHub PAT — so
`npm ci`/`npm install` can resolve `github:acegalaxy-co/...` deps over HTTPS
instead of SSH.

## API

```js
const { dispatchInbound } = require("@acegalaxy/lib-ott-gateway");

const result = await dispatchInbound(telegramUpdate, "telegram", headers);
if (result.outcome === "allow") {
  // result.message + result.identity attached
  await myBot.dispatch(result.message, result.identity);
} else {
  console.warn("denied:", result.denyReason);
}
```

`dispatchInbound(rawPayload, platform, headers)` never throws — always returns
`{ outcome, denyReason, latencyMs }` (plus `message` + `identity` on allow).

## Env config

| Var | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | bot token (also used by adapter if live mode) |
| `TELEGRAM_WEBHOOK_SECRET` | secret token for webhook verify (no secret = deny (fail-closed) unless OTT_TELEGRAM_ALLOW_UNSIGNED=1) |
| `OTT_TELEGRAM_ALLOW_UNSIGNED` | `1`/`true` → accept unsigned inbound when no secret (long-polling / dev only) |
| `OTT_IDENTITY_MODE` | `static` (default) \| `live` \| `hybrid` |
| `OTT_IDENTITY_MAP` | JSON `{"telegram:123":{"id":"alice","roles":["admin"]}}` |
| `OTT_LIVE_TELEGRAM_TOKEN` | bot token for `getChatMember` (live mode) |
| `OTT_LIVE_COMPANY_GROUP` | chat_id to check membership against |
| `OTT_LIVE_ROLE_MAP` | JSON mapping member status → internal role |
| `OTT_AUDIT_LOG_PATH` | audit JSONL path (default `<cwd>/logs/ott-gateway-audit.log`, created on demand) |
| `OTT_POLICY_DIR` | dir holding `<platform>.json` authz policies (default bundled `dist/authz/policies/`) |

## Outbound

`adapter.send()` intentionally throws — outbound stays on the consuming
project's own notification layer.

## Layout

```
lib-ott-gateway/
├── index.ts                 dispatchInbound() entry point
├── types.ts                 InboundMessage, OutcomeRecord typedefs
├── adapters/
│   ├── adapter-interface.ts IOTTAdapter abstract base
│   └── telegram.ts          Telegram webhook verify + parse
├── identity/resolver.ts     L2 — static | live | hybrid
├── authz/
│   ├── engine.ts            L3 — role check
│   └── policies/telegram.json
├── rate-limit/
│   ├── limiter.ts           L4 — sliding window (via @acegalaxy/lib-security-utils)
│   └── replay-guard.ts      L4 — message-id dedup (via @acegalaxy/lib-security-utils)
└── audit/logger.ts          L5 — append-only JSONL (via @acegalaxy/lib-security-utils)
```

## License

MIT (c) 2026 ACE Galaxy.

## Changelog

- **0.2.0** — migrated from Nexus `commons/ott-gateway`; renamed `@acegalaxy/ott-gateway` →
  `@acegalaxy/lib-ott-gateway`; private git-dep (no npm publish); shared security primitives
  now consumed from `@acegalaxy/lib-security-utils` instead of an inlined `lib/` copy; audit
  log default path moved from `__dirname`-relative to `<cwd>/logs/` (env `OTT_AUDIT_LOG_PATH`
  overrides); authz policy dir now overridable via `OTT_POLICY_DIR`.
- 0.1.2 — prior public npm package `@acegalaxy/ott-gateway` (deprecated).
