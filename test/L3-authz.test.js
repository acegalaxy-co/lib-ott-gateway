const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");
const path = require("path");

const authzPath = path.resolve(__dirname, "../authz/engine.ts");
const policyDir = path.resolve(__dirname, "../authz/policies");

function freshAuthz() {
  delete require.cache[authzPath];
  return require(authzPath);
}

async function withPolicy(platform, policy, fn) {
  const policyPath = path.join(policyDir, `${platform}.json`);
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === policyPath) return policy;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const authz = freshAuthz();
    return await fn(authz);
  } finally {
    Module._load = originalLoad;
    delete require.cache[authzPath];
    delete require.cache[policyPath];
  }
}

describe("ott-gateway L3 authz", () => {
  afterEach(() => {
    delete require.cache[authzPath];
  });

  it("authz.check() denies identity=null", async () => {
    const authz = freshAuthz();

    const result = await authz.check(null, "/status", "telegram");

    assert.deepEqual(result, { allow: false, reason: "no identity" });
  });

  it("authz.check() default-denies when policy JSON is missing for the platform", async () => {
    const authz = freshAuthz();

    const result = await authz.check({ id: "u1", roles: ["admin"] }, "/status", "missing-platform");

    assert.deepEqual(result, { allow: false, reason: "no policy for platform" });
  });

  it("authz.check() uses wildcard '*' when the command is not in policy", async () => {
    await withPolicy("test-wildcard-fallback", {
      commands: {
        "*": { roles: ["admin"] },
      },
    }, async (authz) => {
      const result = await authz.check({ id: "u1", roles: ["admin"] }, "/not-configured", "test-wildcard-fallback");

      assert.deepEqual(result, { allow: true });
    });
  });

  it("authz.check() allows wildcard '*' for an identity with a permitted role", async () => {
    await withPolicy("test-wildcard-admin", {
      commands: {
        "*": { roles: ["admin"] },
      },
    }, async (authz) => {
      const result = await authz.check({ id: "u1", roles: ["admin"] }, null, "test-wildcard-admin");

      assert.deepEqual(result, { allow: true });
    });
  });

  it("authz.check() allows command-specific policy when identity roles match", async () => {
    await withPolicy("test-command-match", {
      commands: {
        "/status": { roles: ["viewer", "admin"] },
      },
    }, async (authz) => {
      const result = await authz.check({ id: "u1", roles: ["viewer"] }, "/status", "test-command-match");

      assert.deepEqual(result, { allow: true });
    });
  });

  it("authz.check() denies command-specific policy when identity roles do not match", async () => {
    await withPolicy("test-command-deny", {
      commands: {
        "/status": { roles: ["admin"] },
      },
    }, async (authz) => {
      const result = await authz.check({ id: "u1", roles: ["viewer"] }, "/status", "test-command-deny");

      assert.deepEqual(result, { allow: false, reason: "role not permitted" });
    });
  });

  it("authz.check() default-denies policy rules with empty roles", async () => {
    await withPolicy("test-empty-roles", {
      commands: {
        "/status": { roles: [] },
      },
    }, async (authz) => {
      const result = await authz.check({ id: "u1", roles: ["admin"] }, "/status", "test-empty-roles");

      assert.equal(result.allow, false);
    });
  });
});
