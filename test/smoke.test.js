// Smoke test for @acegalaxy/ott-gateway — no network calls, just verify package loads + exports.
// Run: npm test
const test = require("node:test");
const assert = require("node:assert/strict");

test("@acegalaxy/ott-gateway: dist/index.js loads + primary exports present", () => {
  const m = require("../dist/index.js");
  assert.equal(typeof m.dispatchInbound, "function", "dispatchInbound should be exported");
});
