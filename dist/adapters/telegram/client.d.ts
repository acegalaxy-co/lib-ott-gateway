/**
 * Splits text into chunks by newlines, attempting to keep Markdown blocks intact.
 * @param {string} text
 * @param {number} maxLen - Hard character cap per chunk (Telegram limit guard)
 * @param {number} [maxLines] - Soft cap on lines per chunk; flushes when reached.
 *   When inside a ``` code block, the cap is deferred until the block closes so
 *   we never split mid-block on a line boundary.
 */
declare function splitByNewline(text: string, maxLen: number, maxLines?: number): string[];
interface TelegramClientConfigInput {
    token?: string | (() => string | undefined);
    apiBase?: string;
    maxLen?: number;
    maxRetry429?: number;
    requestTimeoutMs?: number;
    limiter?: {
        acquireSlot(chatId: string | number): Promise<void>;
    };
    beforeSend?: (text: string, chatId: string | number) => string;
}
interface SendTextOptions {
    extra?: Record<string, unknown>;
    streamLines?: number;
}
declare function createTelegramClient(cfgInput?: TelegramClientConfigInput): {
    sendMessage: ({ chatId, text, extra, }: {
        chatId: string | number;
        text: string;
        extra?: Record<string, unknown>;
    }) => Promise<unknown>;
    sendText: (text: string, chatId: string | number, options?: SendTextOptions) => Promise<unknown>;
    call: (method: string, body?: Record<string, unknown>, opts?: {
        signal?: AbortSignal;
    }) => Promise<unknown>;
    editMessageText: (chatId: string | number, messageId: string | number, text: string, opts?: {
        extra?: Record<string, unknown>;
    }) => Promise<unknown>;
    deleteMessage: (chatId: string | number, messageId: string | number) => Promise<unknown>;
    sendChatAction: (chatId: string | number, action: string) => Promise<unknown>;
    getChatMember: (chatId: string | number, userId: string | number) => Promise<unknown>;
    getChat: (chatId: string | number) => Promise<unknown>;
    getMe: (opts?: {
        signal?: AbortSignal;
    }) => Promise<unknown>;
    getUpdates: (params?: Record<string, unknown>, opts?: {
        signal?: AbortSignal;
    }) => Promise<unknown>;
    createChatInviteLink: (chatId: string | number, opts?: {
        memberLimit?: number;
        expireInSeconds?: number;
        name?: string;
    }) => Promise<unknown>;
    banChatMember: (chatId: string | number, userId: string | number) => Promise<unknown>;
    unbanChatMember: (chatId: string | number, userId: string | number) => Promise<unknown>;
    getFile: (fileId: string) => Promise<unknown>;
    downloadFile: (filePath: string, { maxBytes }?: {
        maxBytes?: number;
    }) => Promise<Buffer>;
    answerCallbackQuery: (callbackQueryId: string, opts?: {
        text?: string;
        showAlert?: boolean;
    }) => Promise<unknown>;
};
declare const _default: {
    createTelegramClient: typeof createTelegramClient;
    splitByNewline: typeof splitByNewline;
};
export = _default;
//# sourceMappingURL=client.d.ts.map