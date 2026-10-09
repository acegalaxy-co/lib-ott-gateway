/**
 * Shared Telegram alert format for background services (pm2 workers, cron jobs).
 * Every service MUST send status alerts through this module so the channel reads
 * uniformly:
 *
 *   [<Env>][<Project>] [<icon> <status>] Service <service>
 *   <title>
 *   <key>: <value>
 *   ---
 *   <detail>
 */
type AlertStatus = "ok" | "fail" | "warn" | "info" | "queued" | "running";
interface ServiceAlert {
    /** Service name; when omitted it is suggested from the nearest package.json folder and saved. */
    service?: string;
    status: AlertStatus;
    title: string;
    host?: string;
    /** Short project name (2nd bracket). Order: this > env ALERT_PROJECT > saved/suggested from git-root folder. */
    project?: string;
    fields?: Record<string, string | number | undefined | null>;
    detail?: string;
    /** Clickable links `{ label: url }`, rendered on one line before detail. Switches message to HTML parse mode. */
    links?: Record<string, string>;
}
interface SendServiceAlertOptions {
    token?: string;
    chatId?: string;
    env?: Record<string, string | undefined>;
    apiBase?: string;
}
/** Plain text, or HTML (escaped) when `links` is set — send with parse_mode HTML in that case. */
declare function formatServiceAlert(a: ServiceAlert): string;
/** Resolve bot token / chat / host from env — same var names every service already uses. */
declare function resolveAlertTarget(env?: Record<string, string | undefined>): {
    token: string;
    chatId: string;
    host: string;
    project: string;
};
/**
 * Best-effort send. Never throws (alerts must not crash a service) and never
 * includes the token/URL in the returned reason.
 */
declare function sendServiceAlert(a: ServiceAlert, opts?: SendServiceAlertOptions): Promise<{
    sent: boolean;
    reason?: string;
}>;
declare const _default: {
    formatServiceAlert: typeof formatServiceAlert;
    sendServiceAlert: typeof sendServiceAlert;
    resolveAlertTarget: typeof resolveAlertTarget;
};
export = _default;
//# sourceMappingURL=service-alert.d.ts.map