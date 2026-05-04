"use strict";
const { IOTTAdapter } = require("./adapter-interface");

interface TelegramAdapterOptions {
  token?: string;
  webhookSecret?: string;
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

  /**
   * @param opts
   * @param opts.token          Telegram bot token (env: TELEGRAM_BOT_TOKEN)
   * @param opts.webhookSecret  Webhook secret token (env: TELEGRAM_WEBHOOK_SECRET)
   */
  constructor({ token, webhookSecret }: TelegramAdapterOptions = {}) {
    super();
    this.token = token || process.env.TELEGRAM_BOT_TOKEN || null;
    this.webhookSecret = webhookSecret || process.env.TELEGRAM_WEBHOOK_SECRET || null;
  }

  get platform(): string {
    return "telegram";
  }

  /**
   * Verify inbound Telegram webhook via secret token header.
   * Header name: x-telegram-bot-api-secret-token (lowercase as Node normalizes).
   * If no secret configured → DEV MODE: log warn + allow (must be flagged explicitly).
   *
   * @param _rawPayload unused for Telegram signature verification
   * @param headers request headers (lowercased keys expected)
   * @returns Promise<boolean>
   */
  async verify(_rawPayload: unknown, headers: Record<string, string | undefined> = {}): Promise<boolean> {
    if (!this.webhookSecret) {
      // eslint-disable-next-line no-console
      console.warn(
        "[ott-gateway][telegram] TELEGRAM_WEBHOOK_SECRET not set — DEV MODE (verify bypassed)"
      );
      return true;
    }
    const provided: string | null =
      headers["x-telegram-bot-api-secret-token"] ||
      headers["X-Telegram-Bot-Api-Secret-Token"] ||
      null;
    return provided === this.webhookSecret;
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