#!/usr/bin/env node
/**
 * CLI 入口 — 委派給 run-job.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(__dirname, "run-job.mjs");

const result = spawnSync(process.execPath, [runner, ...process.argv.slice(2)], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
