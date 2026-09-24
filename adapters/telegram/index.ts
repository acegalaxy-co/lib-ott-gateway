"use strict";
const { TelegramAdapter } = require("./inbound");
const { createTelegramClient, splitByNewline } = require("./client");
const { createTelegramRateLimiter, sendMessageWithRetry } = require("./rate");
const { resolveTelegramConfig } = require("./config");
const { createTelegramRegistry } = require("./registry");
const { createPolicyPipeline } = require("./policy");

export = {
  TelegramAdapter,
  createTelegramClient,
  createTelegramRateLimiter,
  sendMessageWithRetry,
  splitByNewline,
  resolveTelegramConfig,
  createTelegramRegistry,
  createPolicyPipeline,
};
