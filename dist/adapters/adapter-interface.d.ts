declare class IOTTAdapter {
    get platform(): string;
    verify(rawPayload: unknown, headers: Record<string, string | string[] | undefined>): Promise<unknown>;
    parse(rawPayload: unknown): Promise<unknown>;
    send(chatId: string, message: unknown, opts?: Record<string, unknown>): Promise<unknown>;
}
declare const _default: {
    IOTTAdapter: typeof IOTTAdapter;
};
export = _default;
//# sourceMappingURL=adapter-interface.d.ts.map