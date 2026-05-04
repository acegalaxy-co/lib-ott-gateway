# @acegalaxy/ott-gateway

> **NPM commons library** — Cross-project inbound OTT gateway: 5-layer default-deny (telegram/whatsapp/teams/slack) with platform policy + audit log + rate limit + identity resolution.
> Cross-cutting rules: see framework `../../rules/00-index.md`.
> ⭐⭐⭐ **Harness Architecture (P0)**: Mọi feature mới BẮT BUỘC route qua 1 trong 5 surfaces (slash command / hook / subagent / MCP / permission). Đọc `../../rules/meta/02-harness-architecture.md`. KHÔNG add ad-hoc scripts.

## Module purpose

Unified inbound message gateway across OTT platforms. Project-agnostic; consumers inject identity map + audit sink + bot tokens via opts.

## Key files

- `index.js` — entry point
- `adapters/` — telegram / whatsapp / teams / slack
- `authz/`, `audit/`, `rate-limit/`, `identity/` — 5-layer guards
- `types.js` — shared types

## Embedded vs imported

Per `rules/system/ott-gateway-mandatory.md`: per-project independence — KHÔNG `require()` module này từ project khác. Copy code OK, scope isolation.

## Tests

`npm test` (runs `node --test test/`).
