interface Identity {
    id: string;
    roles: string[];
}
/**
 * @param platformUserId
 * @param platform
 * @returns
 */
declare function resolveIdentity(platformUserId: string, platform: string): Promise<Identity | null>;
declare const _default: {
    resolveIdentity: typeof resolveIdentity;
};
export = _default;
//# sourceMappingURL=resolver.d.ts.map