# Security Policy

## Reporting a vulnerability

**Do not open a public GitHub issue for security problems.**

Email **security@acegalaxy.co** with:

- description of the issue
- reproduction steps or PoC
- affected version(s)
- your contact for follow-up

We will acknowledge within **3 business days** and aim to ship a fix or
mitigation within **30 days** for high-severity issues.

## Scope

This package is an **inbound security gateway**. We treat the following as
in-scope:

- bypass of any of the 5 layers (validator, identity, rate-limit, audit, forward)
- privilege escalation via spoofed platform fields
- audit log evasion or tampering
- DoS via expensive operations in the validator chain
- secret leakage in logs / error paths

Out of scope:

- vulnerabilities in upstream bot SDKs (report to that project)
- weaknesses in your own `identityMap` / `auditSink` implementations
- social engineering of your bot operators

## Supported versions

Only the latest minor on `main` receives security fixes during `0.x`.
A formal support matrix lands at `1.0`.
