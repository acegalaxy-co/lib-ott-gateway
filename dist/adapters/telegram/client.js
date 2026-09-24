"use strict";
const { resolveTelegramConfig } = require("./config");
const { createTelegramRateLimiter, sendMessageWithRetry } = require("./rate");
/**
 * Splits text into chunks by newlines, attempting to keep Markdown blocks intact.
 * @param {string} text
 * @param {number} maxLen - Hard character cap per chunk (Telegram limit guard)
 * @param {number} [maxLines] - Soft cap on lines per chunk; flushes when reached.
 *   When inside a ``` code block, the cap is deferred until the block closes so
 *   we never split mid-block on a line boundary.
 */
function splitByNewline(text, maxLen, maxLines) {
    const chunks = [];
    let current = "";
    let lineCount = 0;
    // Basic check for code block status
    let inCodeBlock = false;
    const flush = (reopenCodeBlock) => {
        if (inCodeBlock) {
            current += "\n```";
            chunks.push(current);
            current = reopenCodeBlock ? "```" : "";
        }
        else {
            chunks.push(current);
            current = "";
        }
        lineCount = 0;
    };
    for (const line of text.split("\n")) {
        // Toggle code block state
        if (line.trim().startsWith("```"))
            inCodeBlock = !inCodeBlock;
        const overLen = current.length + line.length + 1 > maxLen && current.length > 0;
        if (overLen) {
            flush(true);
        }
        current += (current ? "\n" : "") + line;
        lineCount++;
        // Line-cap flush only when outside a code block (so we never end a chunk mid-block).
        // Evaluated after appending so the closing ``` of a just-finished block stays attached.
        if (maxLines && lineCount >= maxLines && !inCodeBlock) {
            flush(false);
        }
    }
    if (current)
        chunks.push(current);
    return chunks;
}
function createTelegramClient(cfgInput = {}) {
    const cfg = resolveTelegramConfig(cfgInput);
    const limiter = cfg.limiter || createTelegramRateLimiter();
    // Token resolved at EVERY call (not cached at client creation) — cfg.token
    // may be a getter (e.g. () => process.env.X) so callers can rotate/lazily
    // load the token without recreating the client.
    function resolveToken() {
        return typeof cfg.token === "function" ? cfg.token() : cfg.token;
    }
    function requireToken() {
        const token = resolveToken();
        if (!token)
            throw new Error("TELEGRAM_BOT_TOKEN not set");
        return token;
    }
    function apiUrl(method) {
        return `${cfg.apiBase}/bot${requireToken()}/${method}`;
    }
    async function call(method, body, opts = {}) {
        const fetchOpts = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body || {}),
        };
        if (opts.signal)
            fetchOpts.signal = opts.signal;
        const resp = await fetch(apiUrl(method), fetchOpts);
        return resp.json().catch(() => ({}));
    }
    async function sendMessage({ chatId, text, extra = {}, }) {
        const token = requireToken();
        return sendMessageWithRetry({
            apiBase: cfg.apiBase,
            token,
            chatId,
            text,
            extra,
            limiter,
            maxRetry: cfg.maxRetry429,
            timeoutMs: cfg.requestTimeoutMs,
        });
    }
    /**
     * Sends a message to Telegram, automatically splitting it into chunks if it exceeds the character limit.
     * @param text - Message text
     * @param chatId - Target chat ID
     * @param options - Optional flags
     * @param options.extra - Additional fields merged into the sendMessage payload
     * @param options.streamLines - If set (>0), split into blocks of ~N lines each.
     * @returns Raw Telegram response of the LAST chunk (JSON)
     */
    async function sendText(text, chatId, options = {}) {
        const streamLines = options.streamLines && options.streamLines > 0 ? options.streamLines : undefined;
        // Optional consumer hook (e.g. env/project prefix) — applied to the full
        // text BEFORE splitting so a prefix never lands mid-chunk.
        const taggedText = cfg.beforeSend ? cfg.beforeSend(text, chatId) : text;
        const chunks = splitByNewline(taggedText, cfg.maxLen, streamLines);
        const extra = options.extra || {};
        let lastJson;
        for (const chunk of chunks) {
            // Default: plain text. Caller opts in parse_mode via extra.
            const sendExtra = { ...extra };
            if (!sendExtra.parse_mode)
                delete sendExtra.parse_mode;
            lastJson = await sendMessage({ chatId, text: chunk, extra: sendExtra });
        }
        if (chunks.length > 1) {
            console.log(`✅ Sent to Telegram (${chunks.length} message chunks)`);
        }
        return lastJson;
    }
    /**
     * Edit message text via Telegram API.
     */
    async function editMessageText(chatId, messageId, text, opts = {}) {
        requireToken();
        const body = { chat_id: chatId, message_id: messageId, text, ...(opts.extra || {}) };
        const resp = await fetch(apiUrl("editMessageText"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`Telegram editMessageText error: ${resp.status} ${errText}`);
        }
        return resp.json().catch(() => ({}));
    }
    /**
     * Delete a Telegram message.
     */
    async function deleteMessage(chatId, messageId) {
        requireToken();
        const resp = await fetch(apiUrl("deleteMessage"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
        });
        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`Telegram deleteMessage error: ${resp.status} ${errText}`);
        }
        return resp.json().catch(() => ({}));
    }
    /**
     * Send a chat action (e.g., "typing").
     */
    async function sendChatAction(chatId, action) {
        requireToken();
        const resp = await fetch(apiUrl("sendChatAction"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, action }),
        });
        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`Telegram sendChatAction error: ${resp.status} ${errText}`);
        }
        return resp.json().catch(() => ({}));
    }
    /**
     * Get a chat member's info (read).
     */
    async function getChatMember(chatId, userId) {
        requireToken();
        const url = `${apiUrl("getChatMember")}?chat_id=${encodeURIComponent(String(chatId))}&user_id=${encodeURIComponent(String(userId))}`;
        const resp = await fetch(url);
        return resp.json();
    }
    /**
     * Get chat info (read).
     */
    async function getChat(chatId) {
        requireToken();
        const url = `${apiUrl("getChat")}?chat_id=${encodeURIComponent(String(chatId))}`;
        const resp = await fetch(url);
        return resp.json();
    }
    /**
     * Get bot's own info (read).
     */
    async function getMe(opts = {}) {
        requireToken();
        const fetchOpts = {};
        if (opts.signal)
            fetchOpts.signal = opts.signal;
        const resp = await fetch(apiUrl("getMe"), fetchOpts);
        return resp.json();
    }
    /**
     * Long-poll for updates (read).
     */
    async function getUpdates(params = {}, opts = {}) {
        requireToken();
        const qs = Object.entries(params)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join("&");
        const url = qs ? `${apiUrl("getUpdates")}?${qs}` : apiUrl("getUpdates");
        const fetchOpts = {};
        if (opts.signal)
            fetchOpts.signal = opts.signal;
        const resp = await fetch(url, fetchOpts);
        return resp.json();
    }
    /**
     * Create a single-use invite link for a chat.
     */
    async function createChatInviteLink(chatId, opts = {}) {
        requireToken();
        const body = {
            chat_id: chatId,
            member_limit: opts.memberLimit ?? 1,
            expire_date: Math.floor(Date.now() / 1000) + (opts.expireInSeconds ?? 3600),
        };
        if (opts.name)
            body.name = opts.name;
        const resp = await fetch(apiUrl("createChatInviteLink"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        return resp.json();
    }
    /**
     * Ban (permanent) a user from chat.
     */
    async function banChatMember(chatId, userId) {
        requireToken();
        const resp = await fetch(apiUrl("banChatMember"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, user_id: userId }),
        });
        return resp.json();
    }
    /**
     * Unban user. Combined with banChatMember, acts as "kick without ban".
     */
    async function unbanChatMember(chatId, userId) {
        requireToken();
        const resp = await fetch(apiUrl("unbanChatMember"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, user_id: userId, only_if_banned: true }),
        });
        return resp.json();
    }
    async function getFile(fileId) {
        requireToken();
        const url = `${apiUrl("getFile")}?file_id=${encodeURIComponent(fileId)}`;
        const resp = await fetch(url);
        return resp.json();
    }
    async function downloadFile(filePath, { maxBytes } = {}) {
        const url = `${cfg.apiBase}/file/bot${requireToken()}/${filePath}`;
        const resp = await fetch(url);
        if (!resp.ok)
            throw new Error(`Telegram download error: ${resp.status}`);
        if (maxBytes) {
            const len = Number(resp.headers.get("content-length") || 0);
            if (len && len > maxBytes)
                throw new Error(`file too large: ${len} > ${maxBytes}`);
        }
        const buf = Buffer.from(await resp.arrayBuffer());
        if (maxBytes && buf.length > maxBytes)
            throw new Error(`file too large: ${buf.length} > ${maxBytes}`);
        return buf;
    }
    async function answerCallbackQuery(callbackQueryId, opts = {}) {
        requireToken();
        const body = { callback_query_id: callbackQueryId };
        if (opts.text)
            body.text = opts.text;
        if (opts.showAlert)
            body.show_alert = true;
        const resp = await fetch(apiUrl("answerCallbackQuery"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        return resp.json().catch(() => ({}));
    }
    return {
        sendMessage,
        sendText,
        call,
        editMessageText,
        deleteMessage,
        sendChatAction,
        getChatMember,
        getChat,
        getMe,
        getUpdates,
        createChatInviteLink,
        banChatMember,
        unbanChatMember,
        getFile,
        downloadFile,
        answerCallbackQuery,
    };
}
module.exports = { createTelegramClient, splitByNewline };
//# sourceMappingURL=client.js.map