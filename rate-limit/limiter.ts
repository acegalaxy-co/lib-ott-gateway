"use strict";

const createSlidingWindow = require("../../security-utils-nodejs/rate-limit");

const WINDOW_MS: number = 60 * 1000;
const MAX_REQUESTS: number = 30;

const limiter = createSlidingWindow({
  windowMs: WINDOW_MS,
  maxRequests: MAX_REQUESTS,
  keyFn: (identityId: string | null | undefined, command: string | null | undefined): string =>
    identityId ? `${identityId}::${command || "*"}` : "",
  reasonOnDeny: "L4_rate_limit",
});

/**
 * @param identityId
 * @param command
 * @returns true if OK (under quota), false if exceeded.
 *                              Backward-compat: ott historically returned plain boolean.
 */
async function check(identityId: string | null | undefined, command: string | null | undefined): Promise<boolean> {
  const result = await limiter.check(identityId, command);
  return result.ok;
}

export = { check, WINDOW_MS, MAX_REQUESTS };