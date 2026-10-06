/**
 * Auto identity for service alerts: project + service names are suggested from
 * folder names on first use, saved, then reused (edit the saved file to rename).
 *
 *   project = git-root folder (bds-hue -> BdsHue)   | env ALERT_PROJECT wins
 *   service = nearest package.json folder name      | explicit `service` wins
 *   store   = $ALERT_STATE_DIR | ~/.config/acegalaxy / service-alert.json
 */
type Env = Record<string, string | undefined>;
/** "bds-hue" / "bds_hue" / "bds hue" -> "BdsHue". */
declare function pascal(name: string): string;
declare function suggestProject(cwd: string): {
    key: string;
    name: string;
};
declare function suggestService(cwd: string): {
    key: string;
    name: string;
};
/**
 * Resolve project/service. Explicit values win; otherwise saved value; otherwise
 * suggest from folder name and save it. Never throws.
 */
declare function resolveIdentity(opts?: {
    cwd?: string;
    env?: Env;
    project?: string;
    service?: string;
}): {
    project: string;
    service: string;
};
declare const _default: {
    resolveIdentity: typeof resolveIdentity;
    suggestProject: typeof suggestProject;
    suggestService: typeof suggestService;
    pascal: typeof pascal;
};
export = _default;
//# sourceMappingURL=service-alert-identity.d.ts.map