import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.join(__dirname, "../../..");

export function clientConfigPath(clientId) {
  return path.join(ROOT, "installer", "clients", `${clientId}.json`);
}

export function outputDir(clientId) {
  return path.join(ROOT, "installer", "output", clientId);
}

export function statePath(clientId) {
  return path.join(outputDir(clientId), "install-state.json");
}

export function jobPath(jobId) {
  return path.join(ROOT, "installer", "output", "jobs", jobId, "job.json");
}

export function jobLogPath(jobId) {
  return path.join(ROOT, "installer", "output", "jobs", jobId, "install.log");
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
