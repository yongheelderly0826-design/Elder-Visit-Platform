import { spawn } from "node:child_process";
import path from "node:path";

export function spawnInstallJob(jobId: string, resume = false) {
  const runner = path.join(process.cwd(), "scripts", "installer", "run-job.mjs");
  const args = ["--job-id", jobId];
  if (resume) args.push("--resume");

  const child = spawn(process.execPath, [runner, ...args], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      GH_TOKEN: process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
    },
  });

  child.unref();
  return child.pid;
}
