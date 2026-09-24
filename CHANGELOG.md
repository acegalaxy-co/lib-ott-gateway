# Changelog

All notable changes to @acegalaxy/lib-ott-gateway will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-09-24

### Added
- Outbound Telegram transport client, ported from Nexus `commons/ott-gateway/adapters/telegram/`:
  `createTelegramClient` (sendMessage/sendText with auto-chunking, editMessageText,
  deleteMessage, sendChatAction, getChatMember, getMe, getUpdates, createChatInviteLink,
  banChatMember/unbanChatMember, getFile/downloadFile, answerCallbackQuery),
  `createTelegramRateLimiter` (token-bucket, per-channel + global) and
  `sendMessageWithRetry` (429 `retry_after` honoring), plus `resolveTelegramConfig` and
  `splitByNewline`, all re-exported from `adapters/telegram/index.ts` alongside the
  existing `TelegramAdapter`.
- `createTelegramClient()` resolves its config lazily (at call time, not module load):
  an explicit option always wins, otherwise falls back to `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_API_BASE`, `TELEGRAM_MAX_LEN`, `TELEGRAM_MAX_RETRY_429`,
  `TELEGRAM_REQUEST_TIMEOUT_MS` env vars.
- Optional `beforeSend(text, chatId)` hook on `createTelegramClient()` — lets a consumer
  tag/transform outbound text (e.g. an env/project prefix) without this lib knowing about
  that business logic.

### Changed
- `adapters/telegram.ts` moved to `adapters/telegram/inbound.ts` (content unchanged besides
  the relative `adapter-interface` import) to make room for the new outbound modules
  (`client.ts`, `config.ts`, `rate.ts`) under the same directory.
- `package.json#exports` gained explicit `./adapters/telegram` and `./adapters/telegram/*`
  entries pointing at `dist/adapters/telegram/index.js` / `dist/adapters/telegram/*.js` —
  non-breaking, `require("@acegalaxy/lib-ott-gateway/adapters/telegram")` and the root
  `dispatchInbound` import both keep working.

## [0.2.0] - 2026-09-24

### Changed
- **BREAKING**: renamed package `@acegalaxy/ott-gateway` → `@acegalaxy/lib-ott-gateway`; repo
  renamed `ace_commons-ott-gateway-nodejs` → `lib-ott-gateway`. No longer published to npm —
  consumed as a private git-dependency: `github:acegalaxy-co/lib-ott-gateway#v0.2.0`.
- Generalized gateway to a platform-agnostic `dispatchInbound(rawPayload, platform, headers)`.
- Depends on `@acegalaxy/lib-security-utils` v0.3.0 (shared rate-limit + audit primitives)
  instead of an inlined `lib/` copy.
- **BREAKING**: Telegram adapter `verify()` now fails **closed** when
  `TELEGRAM_WEBHOOK_SECRET` is unset (previously fail-open). Set
  `OTT_TELEGRAM_ALLOW_UNSIGNED=1` to opt into accepting unsigned inbound (long-polling / dev
  only). Signature comparison uses `crypto.timingSafeEqual`.
- CI installs private git-deps via `LIB_DEPS_TOKEN` org secret; npm publish workflow removed.

## [0.1.0] - 2026-05-06

### Added
- Initial public release.
- OTT messaging inbound 5-layer security gateway.
- TypeScript source with `.d.ts` declarations shipped in `dist/`.
- MIT license.

[Unreleased]: https://github.com/acegalaxy-co/lib-ott-gateway/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/acegalaxy-co/lib-ott-gateway/releases/tag/v0.1.0
