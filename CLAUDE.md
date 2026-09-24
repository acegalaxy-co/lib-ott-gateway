# @acegalaxy/lib-ott-gateway

> **Private git-dependency library** — Cross-project inbound OTT gateway: 5-layer default-deny (telegram/whatsapp/teams/slack) with platform policy + audit log + rate limit + identity resolution.
> Cross-cutting rules: see framework `../../rules/00-index.md`.
> ⭐⭐⭐ **Harness Architecture (P0)**: Mọi feature mới BẮT BUỘC route qua 1 trong 5 surfaces (slash command / hook / subagent / MCP / permission). Đọc `../../rules/meta/02-harness-architecture.md`. KHÔNG add ad-hoc scripts.

## Module purpose

Unified inbound message gateway across OTT platforms. Project-agnostic; consumers inject identity map + audit sink + bot tokens via opts.

## Key files

- `index.js` — entry point, `dispatchInbound()`
- `adapters/` — telegram / whatsapp / teams / slack
- `authz/`, `audit/`, `rate-limit/`, `identity/` — 5-layer guards
- `types.js` — shared types

## Install

Private git-dependency — consumers add
`"@acegalaxy/lib-ott-gateway": "github:acegalaxy-co/lib-ott-gateway#v0.2.0"` to
`package.json` and `require("@acegalaxy/lib-ott-gateway")` like any other npm package. Not
published to the npm registry. No copy-paste of source into consumer repos.

## Tests

`npm test` (runs `node --test test/`).
