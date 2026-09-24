# Changelog

All notable changes to @acegalaxy/lib-ott-gateway will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-09-24

### Added
- `createPolicyPipeline(cfg)` (`adapters/telegram/policy.ts`) — outbound policy
  pipeline for `sendText()`/`sendMessage()`. Runs `cfg.policies` (array of
  `OutboundPolicy { name, mode, evaluate(text, ctx) }`) in order; per-policy
  `mode` (`"off" | "shadow" | "enforce"`) is re-read on every `evaluate()` call
  (may be a getter) so apps can flip it via env without recreating the client.
  `"off"` skips the policy; `"shadow"` evaluates and reports via
  `cfg.onShadowResult` but never applies the result; `"enforce"` applies it:
  `allow` continues to the next policy, `transform` rewrites `text`/`chatId`
  for the rest of the chain, `deny` stops the chain, calls `cfg.onDeny`, and
  returns a blocked verdict. A policy that throws is fail-open by default
  (logged, treated as allow) or fail-closed with `cfg.onError: "fail-closed"`
  (denied with reason `policy-error:<name>`). `onShadowResult`/`onDeny`
  errors are swallowed. Re-exported from `adapters/telegram/index.ts`.
- `createTelegramClient({ policy })` — optional `PolicyPipelineConfig` wired
  into `sendText()`/`sendMessage()`. `sendText()` evaluates the policy
  **exactly once**, on the full `beforeSend`-tagged text, BEFORE splitting
  into chunks; `sendMessage()` evaluates once on its own text. A blocked
  verdict returns `{ ok: false, blocked: true, reason, policy }` (no throw,
  no send) instead of the raw Telegram response. `call()` and every other
  client method never go through the pipeline. Omitting `policy` keeps
  behavior byte-identical to 0.4.0. `beforeSend` keeps working unchanged and
  still runs before the pipeline sees the text.
- `createTelegramRegistry()` defs now also forward `beforeSend` and `policy`
  to the client they create (previously only token/apiBase/maxLen/etc. were
  forwarded).

## [0.4.0] - 2026-09-24

### Added
- `createTelegramRegistry(defs)` (`adapters/telegram/registry.ts`) — a registry of
  lazily-instantiated, cached `createTelegramClient()` instances keyed by a
  caller-chosen bot key (e.g. `"kane"`, `"nexus"`). `get(key)` returns the cached
  client on repeat calls; `has(key)` / `keys()` inspect the registered defs.
  Each key gets its own `createTelegramRateLimiter(def.rate)` unless `def.limiter`
  is explicitly given — bots sharing a token must register under the same key to
  share a limiter. Unknown key → throws `unknown telegram bot: <key>`. Never
  reads `process.env` — callers pass env-derived values in `defs`. Re-exported
  from `adapters/telegram/index.ts`.
- `createTelegramClient({ token })` now also accepts a **token getter**
  (`() => string | undefined`) in addition to a plain string — resolved on
  every call (not cached at client creation), so a consumer can rotate or
  lazily load the token without recreating the client. Plain-string and env
  fallback (`TELEGRAM_BOT_TOKEN`) behavior is unchanged.
- `client.call(method, body?, opts?)` now accepts `opts.signal` (`AbortSignal`),
  forwarded to the underlying `fetch()`.
- `client.getChat(chatId)` — `GET getChat?chat_id=<id>` (read).

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
