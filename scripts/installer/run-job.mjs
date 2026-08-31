#!/usr/bin/env node
/**
 * 背景安裝工作執行器（CLI 與 Web 精靈共用）
 *
 *   node scripts/installer/run-job.mjs --config installer/clients/demo.json
 *   node scripts/installer/run-job.mjs --job-id <uuid> [--resume]
 */

import fs from "node:fs";
import path from "node:path";
import {
  ROOT,
  clientConfigPath,
  jobPath,
  jobLogPath,
  outputDir,
  ensureDir,
} from "./lib/paths.mjs";
import {
  appendLog,
  loadState,
  saveState,
  preflight,
  phaseGithub,
  phaseGas,
  phaseGasWebApp,
  resolveGasWebAppUrl,
  writeEnvLocal,
  loadEnvLocal,
  phaseVercel,
  phaseHandoff,
  normalizeConfig,
} from "./lib/phases.mjs";

function parseArgs(argv) {
  const args = { config: "", jobId: "", resume: false, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--config" && argv[i + 1]) args.config = argv[++i];
    else if (argv[i] === "--job-id" && argv[i + 1]) args.jobId = argv[++i];
    else if (argv[i] === "--resume") args.resume = true;
    else if (argv[i] === "--dry-run") args.dryRun = true;
  }
  return args;
}

function loadJob(jobId) {
  const p = jobPath(jobId);
  if (!fs.existsSync(p)) throw new Error(`找不到 job：${jobId}`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function saveJob(job) {
  ensureDir(path.dirname(jobPath(job.id)));
  fs.writeFileSync(jobPath(job.id), JSON.stringify(job, null, 2));
}

function createLogger(jobId) {
  const logFile = jobLogPath(jobId);
  ensureDir(path.dirname(logFile));
  return (line) => {
    fs.appendFileSync(logFile, `${line}\n`);
    console.log(line);
  };
}

function updateJob(job, patch) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  saveJob(job);
}

async function runInstall(cfg, options) {
  const { job, resume, dryRun } = options;
  const clientId = cfg.clientId;
  const log = job
    ? createLogger(job.id)
    : (line) => console.log(line);

  const logLine = (msg) => appendLog(log, msg);

  try {
    if (job) updateJob(job, { status: "running", phase: "preflight" });
    preflight(cfg, logLine, dryRun);

    let github = job?.github || null;
    if (!resume || !github) {
      if (job) updateJob(job, { phase: "github" });
      github = await phaseGithub(cfg, logLine, dryRun);
      if (job) updateJob(job, { github });
    }

    let state = loadState(clientId);
    let bootstrap = state.bootstrap || job?.bootstrap || {};
    if (!resume || !state.bootstrap) {
      if (job) updateJob(job, { phase: "gas" });
      bootstrap = phaseGas(cfg, logLine, dryRun);
      state = { ...state, bootstrap, phase: "gas_done" };
      saveState(clientId, state);
      if (job) updateJob(job, { bootstrap });
    }

    let gasWebAppUrl = resolveGasWebAppUrl(state) || job?.gasWebAppUrl || "";
    if (!gasWebAppUrl) {
      if (job) updateJob(job, { phase: "gas_webapp", message: "自動部署 GAS Web App" });
      try {
        gasWebAppUrl = await phaseGasWebApp(logLine, dryRun);
        state = { ...state, bootstrap, gasWebAppUrl };
        saveState(clientId, state);
        if (job) updateJob(job, { gasWebAppUrl });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (job) {
          updateJob(job, {
            status: "waiting_gas",
            phase: "gas_webapp",
            message: `自動部署失敗：${message}。請手動貼上 Web App URL 後繼續。`,
          });
        }
        logLine(`⏸ 自動部署失敗，改為等待手動 URL：${message}`);
        return { status: "waiting_gas", bootstrap, github };
      }
    }

    if (job) updateJob(job, { phase: "env", gasWebAppUrl });
    writeEnvLocal(cfg, bootstrap, gasWebAppUrl);
    loadEnvLocal();

    if (job) updateJob(job, { phase: "vercel" });
    phaseVercel(cfg, logLine, dryRun);

    if (job) updateJob(job, { phase: "handoff" });
    phaseHandoff(cfg, bootstrap, gasWebAppUrl, github, logLine);

    const result = {
      bootstrap,
      github,
      gasWebAppUrl,
      handoffPath: path.join(outputDir(clientId), "handoff.md"),
    };

    saveState(clientId, {
      bootstrap,
      github,
      gasWebAppUrl,
      phase: "complete",
      completedAt: new Date().toISOString(),
    });

    if (job) {
      updateJob(job, {
        status: "completed",
        phase: "complete",
        result,
        message: "安裝完成",
      });
    }

    logLine("✓ 安裝完成");
    return { status: "completed", ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logLine(`✗ 失敗：${message}`);
    if (job) updateJob(job, { status: "failed", message });
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv);

  let cfg;
  let job = null;

  if (args.jobId) {
    job = loadJob(args.jobId);
    cfg = normalizeConfig(job.config);
    if (args.resume && job.gasWebAppUrl) {
      const state = loadState(cfg.clientId);
      saveState(cfg.clientId, { ...state, gasWebAppUrl: job.gasWebAppUrl });
    }
  } else if (args.config) {
    const configPath = path.isAbsolute(args.config)
      ? args.config
      : path.join(ROOT, args.config);
    cfg = normalizeConfig(JSON.parse(fs.readFileSync(configPath, "utf8")));
    ensureDir(path.dirname(clientConfigPath(cfg.clientId)));
    fs.writeFileSync(clientConfigPath(cfg.clientId), JSON.stringify(cfg, null, 2));
  } else {
    console.error("用法：run-job.mjs --config <path> | --job-id <id> [--resume]");
    process.exit(1);
  }

  await runInstall(cfg, { job, resume: args.resume, dryRun: args.dryRun });
}

main().catch(() => process.exit(1));

export { runInstall, normalizeConfig };
