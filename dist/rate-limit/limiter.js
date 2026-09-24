"use strict";
const { createSlidingWindow } = require("@acegalaxy/lib-security-utils/rate-limit");
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 30;
const limiter = createSlidingWindow({
    windowMs: WINDOW_MS,
    maxRequests: MAX_REQUESTS,
    keyFn: (identityId, command) => identityId ? `${identityId}::${command || "*"}` : "",
    reasonOnDeny: "L4_rate_limit",
});
/**
 * @param identityId
 * @param command
 * @returns true if OK (under quota), false if exceeded.
 *                              Backward-compat: ott historically returned plain boolean.
 */
async function check(identityId, command) {
    const result = await limiter.check(identityId, command);
    return result.ok;
}
module.exports = { check, WINDOW_MS, MAX_REQUESTS };
//# sourceMappingURL=limiter.js.map