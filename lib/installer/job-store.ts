import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { InstallerJob } from "@/lib/installer/types";

const ROOT = process.cwd();

function jobsRoot() {
  return path.join(ROOT, "installer", "output", "jobs");
}

function jobFile(jobId: string) {
  return path.join(jobsRoot(), jobId, "job.json");
}

export function createJob(job: Omit<InstallerJob, "createdAt" | "updatedAt">): InstallerJob {
  const now = new Date().toISOString();
  const full: InstallerJob = { ...job, createdAt: now, updatedAt: now };
  const dir = path.dirname(jobFile(job.id));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(jobFile(job.id), JSON.stringify(full, null, 2));
  return full;
}

export function getJob(jobId: string): InstallerJob | null {
  const file = jobFile(jobId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as InstallerJob;
}

export function updateJob(jobId: string, patch: Partial<InstallerJob>): InstallerJob | null {
  const current = getJob(jobId);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(jobFile(jobId), JSON.stringify(next, null, 2));
  return next;
}

export function listJobs(limit = 20): InstallerJob[] {
  const root = jobsRoot();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .map((id) => getJob(id))
    .filter((job): job is InstallerJob => job !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function readJobLog(jobId: string, tail = 80): string[] {
  const logFile = path.join(jobsRoot(), jobId, "install.log");
  if (!fs.existsSync(logFile)) return [];
  const lines = fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean);
  return lines.slice(-tail);
}

export function newJobId() {
  return randomUUID();
}
