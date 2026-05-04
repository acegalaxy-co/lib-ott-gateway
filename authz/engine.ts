"use strict";
import path = require("path");

interface Identity {
  id: string;
  roles: string[];
}

interface PolicyRule {
  roles: string[];
}

interface Policy {
  commands: Record<string, PolicyRule>;
}

interface CheckResult {
  allow: boolean;
  reason?: string;
}

async function check(
  identity: Identity | null,
  command: string | null,
  platform: string
): Promise<CheckResult> {
  if (!identity) return { allow: false, reason: "no identity" };
  if (!platform) return { allow: false, reason: "no platform" };

  let policy: Policy | undefined;
  try {
    // Load per-platform policy. require cache is OK — reload = PM2 restart.
    policy = require(path.join(__dirname, "policies", `${platform}.json`)) as Policy;
  } catch (_e: unknown) {
    return { allow: false, reason: `no policy for platform: ${platform}` };
  }

  const cmds = (policy && policy.commands) || {};
  const rule = (command && cmds[command]) || cmds["*"] || null;
  if (!rule) return { allow: false, reason: "no matching policy" };

  const allowedRoles = Array.isArray(rule.roles) ? rule.roles : [];
  if (allowedRoles.length === 0) return { allow: false, reason: "no matching policy" };

  const identityRoles = Array.isArray(identity.roles) ? identity.roles : [];
  const hit = identityRoles.some((r: string) => allowedRoles.includes(r));
  if (!hit) return { allow: false, reason: "role not permitted" };

  return { allow: true };
}

export = { check };