"use strict";

import path = require("path");
const { createAuditLogger } = require("@acegalaxy-co/security-utils/audit-log");

const logger = createAuditLogger({
  logPath: path.join(__dirname, "audit.log"),
  tag: "ott-gateway][audit",
  mode: "async",  // ott historically used fs/promises — preserve for behavior parity
});

export = { record: logger.record, LOG_PATH: logger.LOG_PATH };