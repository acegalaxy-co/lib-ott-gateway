# @kanelr/ott-gateway

[![npm version](https://img.shields.io/npm/v/@acegalaxy%2Fott-gateway.svg)](https://www.npmjs.com/package/@kanelr/ott-gateway)
[![npm downloads](https://img.shields.io/npm/dm/@acegalaxy%2Fott-gateway.svg)](https://www.npmjs.com/package/@kanelr/ott-gateway)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/node/v/@acegalaxy%2Fott-gateway.svg)](https://nodejs.org)


**Inbound message security gateway for bots — 5 layers, default-deny.**

Stop bot framework abuse. Most Telegram/WhatsApp/WeChat bot frameworks treat
*"can the bot read this message?"* as the only access check. That's not authz —
that's just delivery. `ott-gateway` sits between your bot transport and your
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

`ott-gateway` gives you all five as composable layers.

## The 5 layers

Every inbound message walks the chain top-to-bottom. Any layer can `deny`.

1. **caller-validator** — platform policy. Reject bots-talking-to-bots,
   disallowed chat types, missing fields, suspicious forwards.
2. **identity-resolver** — map platform principal (e.g. `telegram:user_id`)
   to your internal identity + role. Unknown principal → deny.
3. **rate-limit** — token bucket per resolved identity (not per chat),
   so one user can't burn quota by switching groups.
4. **audit** — structured log of `{ts, platform, principal, identity, decision, reason}`
   for every message, accept or deny. Pluggable sink.
5. **forward** — only here does your handler see the message, with
   resolved identity attached.

Default at every layer is **deny**. You allowlist explicitly.

## Install

```bash
npm install @kanelr/ott-gateway
```

## Quick start (Telegram)

```js
import { createGateway } from '@kanelr/ott-gateway';

const gateway = createGateway({
  platform: 'telegram',
  identityMap: async (principal) => {
    // your DB lookup; return null to deny
    return await db.users.findByTelegramId(principal.userId);
  },
  rateLimit: { perMinute: 30 },
  auditSink: async (record) => log.info(record),
  handler: async (msg, identity) => {
    // only reaches here if all 5 layers passed
    await myBot.dispatch(msg, identity);
  },
});

telegramBot.on('message', (msg) => gateway.ingest(msg));
```

## vs raw bot framework

| | raw `node-telegram-bot-api` | `ott-gateway` |
|---|---|---|
| who can talk to bot | anyone in any chat | allowlisted identities only |
| rate limit | none (or per-chat) | per-identity, cross-chat |
| audit trail | you write it | built-in, structured |
| identity in handler | raw `user_id` | resolved internal user + role |
| add WhatsApp later | rewrite handlers | swap adapter, keep chain |

## Status

`0.1.x` — API may shift. Used in production internally at ACE Galaxy across
multiple bots. Telegram adapter ships; WhatsApp/WeChat adapters in progress.

## License

MIT (c) 2026 ACE Galaxy. See [LICENSE](LICENSE).

Security issues -> [SECURITY.md](SECURITY.md).
Contributions -> [CONTRIBUTING.md](CONTRIBUTING.md).
