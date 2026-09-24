"use strict";
// ott-gateway/adapters/adapter-interface.ts
// Abstract base class — every OTT adapter MUST extend this.
class IOTTAdapter {
    get platform() {
        throw new Error("abstract");
    }
    // eslint-disable-next-line no-unused-vars
    async verify(rawPayload, headers) {
        throw new Error("abstract");
    }
    // eslint-disable-next-line no-unused-vars
    async parse(rawPayload) {
        throw new Error("abstract");
    }
    // eslint-disable-next-line no-unused-vars
    async send(chatId, message, opts) {
        throw new Error("abstract");
    }
}
module.exports = { IOTTAdapter };
//# sourceMappingURL=adapter-interface.js.map