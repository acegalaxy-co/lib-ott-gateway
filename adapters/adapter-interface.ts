"use strict";

// ott-gateway/adapters/adapter-interface.ts
// Abstract base class — every OTT adapter MUST extend this.

class IOTTAdapter {
  get platform(): string {
    throw new Error("abstract");
  }

  // eslint-disable-next-line no-unused-vars
  async verify(rawPayload: unknown, headers: Record<string, string | string[] | undefined>): Promise<unknown> {
    throw new Error("abstract");
  }

  // eslint-disable-next-line no-unused-vars
  async parse(rawPayload: unknown): Promise<unknown> {
    throw new Error("abstract");
  }

  // eslint-disable-next-line no-unused-vars
  async send(chatId: string, message: unknown, opts?: Record<string, unknown>): Promise<unknown> {
    throw new Error("abstract");
  }
}

export = { IOTTAdapter };