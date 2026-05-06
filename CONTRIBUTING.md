# Contributing

Thanks for your interest in `@kanelr/ott-gateway`.

## Dev setup

```bash
git clone https://github.com/acegalaxy-co/ace_commons-ott-gateway-nodejs.git
cd ace_commons-ott-gateway-nodejs
npm install
npm test
```

Node `>=20` required.

## Workflow

1. Open an issue first for non-trivial changes (new layer, new adapter, breaking API).
2. Branch from `main`: `feat/<short-name>` or `fix/<short-name>`.
3. Keep PRs small and focused. One layer or one adapter per PR.
4. Add tests for every new code path — especially deny paths.
5. Update README if user-facing API changes.

## Code style

- ES modules, async/await
- No deps beyond `@acegalaxy-co/security-utils` unless discussed in an issue
- Default-deny everywhere — every layer must have an explicit allow rule

## Security-sensitive PRs

If your PR touches the validator, identity resolver, or audit layer,
flag it in the PR description. These get extra review.

## Reporting bugs

Use [GitHub Issues](https://github.com/acegalaxy-co/ace_commons-ott-gateway-nodejs/issues).
For security issues, see [SECURITY.md](SECURITY.md) — do **not** open a public issue.
