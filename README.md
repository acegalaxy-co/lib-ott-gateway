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

`adapter.send()` (the `IOTTAdapter` L1 hook used by `dispatchInbound`) intentionally
throws — inbound dispatch never sends. For actual outbound sending, use the
Telegram transport client directly:

```js
const { createTelegramClient } = require("@acegalaxy/lib-ott-gateway/adapters/telegram");

// Token/apiBase/etc are optional — falls back to TELEGRAM_BOT_TOKEN /
// TELEGRAM_API_BASE / TELEGRAM_MAX_LEN / TELEGRAM_MAX_RETRY_429 /
// TELEGRAM_REQUEST_TIMEOUT_MS env vars when omitted. Config is resolved lazily,
// at createTelegramClient() call time — never at module load.
const bot = createTelegramClient({
  // token: "...",                    // overrides TELEGRAM_BOT_TOKEN
  // token: () => getRotatedToken(),  // or a getter — resolved on EVERY call, not cached
  // beforeSend: (text, chatId) => `[MyApp] ${text}`, // optional prefix/transform hook
});

await bot.sendText("hello world", chatId);       // auto-splits on maxLen, honors 429 retry_after
await bot.sendMessage({ chatId, text: "hi" });    // single call, no splitting
await bot.editMessageText(chatId, messageId, "edited");
await bot.deleteMessage(chatId, messageId);
await bot.getChatMember(chatId, userId);          // + getChat, getMe, getUpdates, getFile/downloadFile,
                                                   //   createChatInviteLink, ban/unbanChatMember,
                                                   //   answerCallbackQuery, sendChatAction
await bot.call("someMethod", { foo: "bar" }, { signal: controller.signal }); // raw call, any method
```

Outbound throttling: `createTelegramClient()` builds its own
`createTelegramRateLimiter()` (per-channel + global token bucket) unless you pass
a shared `limiter`. This client stays generic — whitelist/authz/env-prefix/testMode
business logic belongs in the consuming app, not here; use `beforeSend` for simple
text transforms only.

### Multi-bot registry

When an app talks to more than one Telegram bot (e.g. a "kane" ops bot and a
"nexus" customer bot), use `createTelegramRegistry()` to get one lazily-created,
cached client per bot key instead of managing `createTelegramClient()` calls by
hand:

```js
const { createTelegramRegistry } = require("@acegalaxy/lib-ott-gateway/adapters/telegram");

// Never reads process.env — pass env-derived values in per callers.
const bots = createTelegramRegistry({
  kane: { token: () => process.env.KANE_HOOK_BOT_TOKEN },
  nexus: { token: () => process.env.NEXUS_BOT_TOKEN, rate: { globalIntervalMs: 50 } },
});

await bots.get("kane").sendText("deploy done", chatId);
bots.has("nexus");   // true
bots.keys();          // ["kane", "nexus"]
bots.get("ghost");    // throws "unknown telegram bot: ghost"
```

Each key gets its own rate limiter (`createTelegramRateLimiter(def.rate)`) unless
`def.limiter` is given explicitly — bots that share a token should register under
the same key so they share one client/limiter.

## Layout

```
lib-ott-gateway/
├── index.ts                 dispatchInbound() entry point
├── types.ts                 InboundMessage, OutcomeRecord typedefs
├── adapters/
│   ├── adapter-interface.ts IOTTAdapter abstract base
│   └── telegram/
│       ├── inbound.ts       L1 — Telegram webhook verify + parse (TelegramAdapter)
│       ├── client.ts        Outbound — createTelegramClient (send/edit/delete/...)
│       ├── registry.ts      Outbound — createTelegramRegistry (lazy, cached, per-bot-key)
│       ├── rate.ts          Outbound — token-bucket limiter + 429-retry sendMessageWithRetry
│       ├── config.ts        Outbound — resolveTelegramConfig (opts > env, lazy)
│       └── index.ts         Re-exports all of the above
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

- **0.4.0** — `createTelegramRegistry()` for multi-bot apps; `createTelegramClient({ token })`
  now also accepts a token getter function (resolved on every call); `client.call()` accepts
  `opts.signal`; added `client.getChat()`. See "Multi-bot registry" above.
- **0.3.0** — outbound Telegram transport client ported from Nexus
  `commons/ott-gateway/adapters/telegram/`: `createTelegramClient`,
  `createTelegramRateLimiter`, `sendMessageWithRetry`; `adapters/telegram.ts` moved to
  `adapters/telegram/inbound.ts` to share the directory. See "Outbound" above.
- **0.2.0** — migrated from Nexus `commons/ott-gateway`; renamed `@acegalaxy/ott-gateway` →
  `@acegalaxy/lib-ott-gateway`; private git-dep (no npm publish); shared security primitives
  now consumed from `@acegalaxy/lib-security-utils` instead of an inlined `lib/` copy; audit
  log default path moved from `__dirname`-relative to `<cwd>/logs/` (env `OTT_AUDIT_LOG_PATH`
  overrides); authz policy dir now overridable via `OTT_POLICY_DIR`.
- 0.1.2 — prior public npm package `@acegalaxy/ott-gateway` (deprecated).
