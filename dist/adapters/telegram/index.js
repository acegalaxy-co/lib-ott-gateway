"use strict";
const { TelegramAdapter } = require("./inbound");
const { createTelegramClient, splitByNewline } = require("./client");
const { createTelegramRateLimiter, sendMessageWithRetry } = require("./rate");
const { resolveTelegramConfig } = require("./config");
const { createTelegramRegistry } = require("./registry");
module.exports = {
    TelegramAdapter,
    createTelegramClient,
    createTelegramRateLimiter,
    sendMessageWithRetry,
    splitByNewline,
    resolveTelegramConfig,
    createTelegramRegistry,
};
//# sourceMappingURL=index.js.map