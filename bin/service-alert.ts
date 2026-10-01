#!/usr/bin/env node
"use strict";
// CLI for bash services/cron wrappers:
//   tail -15 out.log | service-alert --service seo-google-daily --status fail \
//     --title "Daily report" --field exit=1 [--env-file .env]
// Detail is read from stdin (when piped). Exit 0 always — alerting is best-effort.
const { sendServiceAlert } = require("../service-alert");

function parseArgs(argv: string[]) {
  const out: { fields: Record<string, string>; [k: string]: unknown } = { fields: {} };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "");
    const val = argv[i + 1] ?? "";
    i++;
    if (key === "field") {
      const eq = val.indexOf("=");
      if (eq > 0) out.fields[val.slice(0, eq)] = val.slice(eq + 1);
    } else out[key] = val;
  }
  return out;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const service = String(args.service || "");
  const title = String(args.title || "");
  const status = String(args.status || "info");
  if (!service || !title || !["ok", "fail", "warn", "info"].includes(status)) {
    console.error("usage: service-alert --service <name> --status ok|fail|warn|info --title <text> [--field k=v]... [--env-file path] < detail");
    return;
  }
  if (args["env-file"]) {
    try {
      process.loadEnvFile(String(args["env-file"]));
    } catch {
      console.error("service-alert: env file not readable");
    }
  }
  const detail = await readStdin();
  const r = await sendServiceAlert({ service, status, title, fields: args.fields, detail });
  console.log(r.sent ? "service-alert: sent" : `service-alert: skipped (${r.reason})`);
}

main().catch((err) => console.error("service-alert:", (err as Error)?.message));
