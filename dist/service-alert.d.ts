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
    service: string;
    status: AlertStatus;
    title: string;
    host?: string;
    /** Short project name shown as the 2nd bracket, e.g. "Crawler". Omitted when empty. */
    project?: string;
    fields?: Record<string, string | number | undefined | null>;
    detail?: string;
}
interface SendServiceAlertOptions {
    token?: string;
    chatId?: string;
    env?: Record<string, string | undefined>;
    apiBase?: string;
}
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