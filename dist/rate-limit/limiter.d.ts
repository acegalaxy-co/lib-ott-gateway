/**
 * @param identityId
 * @param command
 * @returns true if OK (under quota), false if exceeded.
 *                              Backward-compat: ott historically returned plain boolean.
 */
declare function check(identityId: string | null | undefined, command: string | null | undefined): Promise<boolean>;
declare const _default: {
    check: typeof check;
    WINDOW_MS: number;
    MAX_REQUESTS: number;
};
export = _default;
//# sourceMappingURL=limiter.d.ts.map