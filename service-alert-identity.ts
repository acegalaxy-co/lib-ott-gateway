"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/**
 * Auto identity for service alerts: project + service names are suggested from
 * folder names on first use, saved, then reused (edit the saved file to rename).
 *
 *   project = git-root folder (bds-hue -> BdsHue)   | env ALERT_PROJECT wins
 *   service = nearest package.json folder name      | explicit `service` wins
 *   store   = $ALERT_STATE_DIR | ~/.config/acegalaxy / service-alert.json
 */

type Env = Record<string, string | undefined>;
interface Store {
  projects: Record<string, string>;
  services: Record<string, string>;
}

function storeFile(env: Env): string {
  return path.join(env.ALERT_STATE_DIR || path.join(os.homedir(), ".config", "acegalaxy"), "service-alert.json");
}

function readStore(file: string): Store {
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    return { projects: j.projects ?? {}, services: j.services ?? {} };
  } catch {
    return { projects: {}, services: {} };
  }
}

function writeStore(file: string, s: Store): boolean {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(s, null, 2));
    return true;
  } catch {
    return false;
  }
}

function findUp(start: string, marker: string): string | undefined {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, marker))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
}

/** "bds-hue" / "bds_hue" / "bds hue" -> "BdsHue". */
function pascal(name: string): string {
  return name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
}

function suggestProject(cwd: string): { key: string; name: string } {
  const root = findUp(cwd, ".git") ?? path.resolve(cwd);
  return { key: root, name: pascal(path.basename(root)) };
}

function suggestService(cwd: string): { key: string; name: string } {
  const dir = findUp(cwd, "package.json") ?? path.resolve(cwd);
  return { key: dir, name: path.basename(dir) };
}

/**
 * Resolve project/service. Explicit values win; otherwise saved value; otherwise
 * suggest from folder name and save it. Never throws.
 */
function resolveIdentity(opts: { cwd?: string; env?: Env; project?: string; service?: string } = {}): { project: string; service: string } {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  let project = opts.project || env.ALERT_PROJECT || "";
  let service = opts.service || "";
  if (project && service) return { project, service };
  try {
    const file = storeFile(env);
    const store = readStore(file);
    let dirty = false;
    if (!project) {
      const s = suggestProject(cwd);
      project = store.projects[s.key] ?? "";
      if (!project) {
        project = store.projects[s.key] = s.name;
        dirty = true;
        console.error(`service-alert: project suggested "${s.name}" for ${s.key} — saved to ${file} (edit to rename)`);
      }
    }
    if (!service) {
      const s = suggestService(cwd);
      service = store.services[s.key] ?? "";
      if (!service) {
        service = store.services[s.key] = s.name;
        dirty = true;
        console.error(`service-alert: service suggested "${s.name}" for ${s.key} — saved to ${file} (edit to rename)`);
      }
    }
    if (dirty) writeStore(file, store);
  } catch {
    // alerts must never crash a service: fall back to unsaved suggestions
    project = project || suggestProject(cwd).name;
    service = service || suggestService(cwd).name;
  }
  return { project, service };
}

export = { resolveIdentity, suggestProject, suggestService, pascal };
