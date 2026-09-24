"use strict";
const fs = require("fs");
const path = require("path");
const { createAuditLogger } = require("@acegalaxy/lib-security-utils/audit-log");
const LOG_PATH = process.env.OTT_AUDIT_LOG_PATH || path.join(process.cwd(), "logs", "ott-gateway-audit.log");
// Ensure the target directory exists before the first write — the default
// path (process.cwd()/logs) is not guaranteed to exist. Never derive this
// from __dirname (that would point inside node_modules when consumed as a
// dependency).
fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
const logger = createAuditLogger({
    logPath: LOG_PATH,
    tag: "ott-gateway][audit",
    mode: "async", // ott historically used fs/promises — preserve for behavior parity
});
module.exports = { record: logger.record, LOG_PATH: logger.LOG_PATH };
//# sourceMappingURL=logger.js.map