interface Identity {
    id: string;
    roles: string[];
}
interface CheckResult {
    allow: boolean;
    reason?: string;
}
declare function check(identity: Identity | null, command: string | null, platform: string): Promise<CheckResult>;
declare const _default: {
    check: typeof check;
};
export = _default;
//# sourceMappingURL=engine.d.ts.map