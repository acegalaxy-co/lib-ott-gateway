"use strict";
const path = require("path");
async function check(identity, command, platform) {
    if (!identity)
        return { allow: false, reason: "no identity" };
    if (!platform)
        return { allow: false, reason: "no platform" };
    let policy;
    try {
        // Load per-platform policy. require cache is OK — reload = PM2 restart.
        // OTT_POLICY_DIR overrides the bundled default (dist/authz/policies/ once built).
        const policyDir = process.env.OTT_POLICY_DIR || path.join(__dirname, "policies");
        policy = require(path.join(policyDir, `${platform}.json`));
    }
    catch (_e) {
        return { allow: false, reason: "no policy for platform" };
    }
    const cmds = (policy && policy.commands) || {};
    const rule = (command && cmds[command]) || cmds["*"] || null;
    if (!rule)
        return { allow: false, reason: "no matching policy" };
    const allowedRoles = Array.isArray(rule.roles) ? rule.roles : [];
    if (allowedRoles.length === 0)
        return { allow: false, reason: "no matching policy" };
    const identityRoles = Array.isArray(identity.roles) ? identity.roles : [];
    const hit = identityRoles.some((r) => allowedRoles.includes(r));
    if (!hit)
        return { allow: false, reason: "role not permitted" };
    return { allow: true };
}
module.exports = { check };
//# sourceMappingURL=engine.js.map