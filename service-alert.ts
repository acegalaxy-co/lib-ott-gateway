"use strict";
const { createTelegramRateLimiter, sendMessageWithRetry } = require("./adapters/telegram/rate");

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

const ICONS: Record<AlertStatus, string> = { ok: "✅", fail: "❌", warn: "⚠️", info: "ℹ️", queued: "⏳", running: "🔄" };
// ponytail: hard cap below Telegram's 4096 limit; long output is truncated, not split.
const MAX_LEN = 3500;

function formatServiceAlert(a: ServiceAlert): string {
  const status: AlertStatus = a.status in ICONS ? a.status : "info";
  const env = `[${a.host || "Local"}]`;
  const project = a.project ? `[${a.project}]` : "";
  const lines = [`${env}${project} [${ICONS[status]} ${status}] Service ${a.service}`];
  if (a.title) lines.push(a.title);
  for (const [k, v] of Object.entries(a.fields ?? {})) {
    if (v !== undefined && v !== null && v !== "") lines.push(`${k}: ${v}`);
  }
  const detail = (a.detail ?? "").trim();
  if (detail) lines.push("---", detail);
  const text = lines.join("\n");
  return text.length > MAX_LEN ? `${text.slice(0, MAX_LEN - 1)}…` : text;
}

/** Resolve bot token / chat / host from env — same var names every service already uses. */
function resolveAlertTarget(env: Record<string, string | undefined> = process.env) {
  return {
    token: env.TELEGRAM_ALERT_BOT_TOKEN || env.NEXUS_TELEGRAM_BOT_TOKEN || "",
    chatId: env.TELEGRAM_ALERT_CHAT_ID || env.NEXUS_TELEGRAM_CHANNEL_STATUS_ALERT || "",
    host: env.HOST_LABEL || "Local",
    project: env.ALERT_PROJECT || "",
  };
}

const limiter = createTelegramRateLimiter();

/**
 * Best-effort send. Never throws (alerts must not crash a service) and never
 * includes the token/URL in the returned reason.
 */
async function sendServiceAlert(
  a: ServiceAlert,
  opts: SendServiceAlertOptions = {}
): Promise<{ sent: boolean; reason?: string }> {
  const target = resolveAlertTarget(opts.env);
  const token = opts.token ?? target.token;
  const chatId = opts.chatId ?? target.chatId;
  if (!token || !chatId) return { sent: false, reason: "telegram not configured" };
  const text = formatServiceAlert({ ...a, host: a.host || target.host, project: a.project || target.project });
  try {
    await sendMessageWithRetry({
      apiBase: opts.apiBase || "https://api.telegram.org",
      token,
      chatId,
      text,
      extra: { disable_web_page_preview: true },
      limiter,
    });
    return { sent: true };
  } catch (err) {
    const msg = String((err as Error)?.message ?? err).split(token).join("<redacted>");
    return { sent: false, reason: msg };
  }
}

export = { formatServiceAlert, sendServiceAlert, resolveAlertTarget };
