"use strict";
const crypto = require("crypto");
const { IOTTAdapter } = require("./adapter-interface");

interface TelegramAdapterOptions {
  token?: string;
  webhookSecret?: string;
  allowUnsigned?: boolean;
}

interface TelegramUser {
  id?: number;
  [key: string]: unknown;
}

interface TelegramChat {
  id?: number;
  [key: string]: unknown;
}

interface TelegramMessage {
  message_id?: number;
  from?: TelegramUser;
  chat?: TelegramChat;
  text?: string;
  [key: string]: unknown;
}

interface TelegramUpdate {
  message?: TelegramMessage;
  [key: string]: unknown;
}

interface InboundMessage {
  platform: string;
  messageId: string;
  platformUserId: string;
  chatId: string;
  text: string;
  command: string | null;
  raw: unknown;
  ts: number;
}

class TelegramAdapter extends IOTTAdapter {
  private token: string | null;
  private webhookSecret: string | null;
  private allowUnsigned: boolean;

  /**
   * @param opts
   * @param opts.token          Telegram bot token (env: TELEGRAM_BOT_TOKEN)
   * @param opts.webhookSecret  Webhook secret token (env: TELEGRAM_WEBHOOK_SECRET)
   * @param opts.allowUnsigned  Explicit opt-in to accept unsigned inbound when no
   *                            secret is configured (env: OTT_TELEGRAM_ALLOW_UNSIGNED,
   *                            "1"/"true" → enabled). Long-polling / dev only.
   */
  constructor({ token, webhookSecret, allowUnsigned }: TelegramAdapterOptions = {}) {
    super();
    this.token = token || process.env.TELEGRAM_BOT_TOKEN || null;
    this.webhookSecret = webhookSecret || process.env.TELEGRAM_WEBHOOK_SECRET || null;
    this.allowUnsigned =
      allowUnsigned ?? /^(1|true)$/i.test(process.env.OTT_TELEGRAM_ALLOW_UNSIGNED || "");
  }

  get platform(): string {
    return "telegram";
  }

  /**
   * Verify inbound Telegram webhook via secret token header.
   * Header name: x-telegram-bot-api-secret-token (lowercase as Node normalizes).
   * Fail-closed by default: if no secret is configured, verification denies
   * unless `allowUnsigned` (opt.allowUnsigned / OTT_TELEGRAM_ALLOW_UNSIGNED)
   * is explicitly enabled — long-polling / dev only.
   *
   * @param _rawPayload unused for Telegram signature verification
   * @param headers request headers (lowercased keys expected)
   * @returns Promise<boolean>
   */
  async verify(_rawPayload: unknown, headers: Record<string, string | undefined> = {}): Promise<boolean> {
    if (!this.webhookSecret) {
      if (this.allowUnsigned) {
        // eslint-disable-next-line no-console
        console.warn(
          "[ott-gateway][telegram] TELEGRAM_WEBHOOK_SECRET not set — UNSIGNED MODE (verify bypassed; polling/dev only)"
        );
        return true;
      }
      // eslint-disable-next-line no-console
      console.warn(
        "[ott-gateway][telegram] TELEGRAM_WEBHOOK_SECRET not set — fail-closed (verify denied; set OTT_TELEGRAM_ALLOW_UNSIGNED=1 to opt in)"
      );
      return false;
    }
    const provided: string | undefined =
      headers["x-telegram-bot-api-secret-token"] || headers["X-Telegram-Bot-Api-Secret-Token"];
    if (typeof provided !== "string") return false;

    const expected: Buffer = Buffer.from(this.webhookSecret);
    const actual: Buffer = Buffer.from(provided);
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  }

  /**
   * Transform Telegram Update → normalized InboundMessage.
   * See: https://core.telegram.org/bots/api#update
   *
   * @param rawPayload Telegram Update object
   * @returns Promise<InboundMessage>
   */
  async parse(rawPayload: TelegramUpdate): Promise<InboundMessage> {
    const msg: TelegramMessage = rawPayload && rawPayload.message ? rawPayload.message : {};
    const text: string = typeof msg.text === "string" ? msg.text : "";
    const command: string | null = text.startsWith("/") ? text.split(/\s+/)[0] : null;

    return {
      platform: "telegram",
      messageId: msg.message_id != null ? String(msg.message_id) : "",
      platformUserId: msg.from && msg.from.id != null ? String(msg.from.id) : "",
      chatId: msg.chat && msg.chat.id != null ? String(msg.chat.id) : "",
      text,
      command,
      raw: rawPayload,
      ts: Date.now(),
    };
  }

  /**
   * Outbound send — intentionally NOT implemented here.
   * Rule 07: outbound notify stays on project's existing `notify/` layer.
   */
  async send(_chatId: string, _message: string, _opts: unknown): Promise<void> {
    throw new Error("not implemented, use existing notify/ layer");
  }
}

export = { TelegramAdapter };