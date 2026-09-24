declare const IOTTAdapter: any;
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
declare class TelegramAdapter extends IOTTAdapter {
    private token;
    private webhookSecret;
    private allowUnsigned;
    /**
     * @param opts
     * @param opts.token          Telegram bot token (env: TELEGRAM_BOT_TOKEN)
     * @param opts.webhookSecret  Webhook secret token (env: TELEGRAM_WEBHOOK_SECRET)
     * @param opts.allowUnsigned  Explicit opt-in to accept unsigned inbound when no
     *                            secret is configured (env: OTT_TELEGRAM_ALLOW_UNSIGNED,
     *                            "1"/"true" → enabled). Long-polling / dev only.
     */
    constructor({ token, webhookSecret, allowUnsigned }?: TelegramAdapterOptions);
    get platform(): string;
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
    verify(_rawPayload: unknown, headers?: Record<string, string | undefined>): Promise<boolean>;
    /**
     * Transform Telegram Update → normalized InboundMessage.
     * See: https://core.telegram.org/bots/api#update
     *
     * @param rawPayload Telegram Update object
     * @returns Promise<InboundMessage>
     */
    parse(rawPayload: TelegramUpdate): Promise<InboundMessage>;
    /**
     * Outbound send — intentionally NOT implemented here.
     * Rule 07: outbound notify stays on project's existing `notify/` layer.
     */
    send(_chatId: string, _message: string, _opts: unknown): Promise<void>;
}
declare const _default: {
    TelegramAdapter: typeof TelegramAdapter;
};
export = _default;
//# sourceMappingURL=inbound.d.ts.map