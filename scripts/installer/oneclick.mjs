#!/usr/bin/env node
/**
 * 懶人包一鍵安裝
 *
 *   npm run install:oneclick -- --district 板橋區 --email office@gmail.com
 *   npm run install:oneclick -- --district 永和區 --email a@gmail.com --year 115
 *
 * 只需行政區 + 承辦 Gmail。其餘（倉庫、試算表、GAS、Vercel、交接包）自動完成。
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, clientConfigPath, ensureDir } from "./lib/paths.mjs";
import { suggestClientFromDistrict } from "./lib/suggest-client.mjs";

function parseArgs(argv) {
  const args = { district: "", email: "", year: "115", name: "", dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if ((argv[i] === "--district" || argv[i] === "-d") && argv[i + 1]) args.district = argv[++i];
    else if ((argv[i] === "--email" || argv[i] === "-e") && argv[i + 1]) args.email = argv[++i];
    else if ((argv[i] === "--year" || argv[i] === "-y") && argv[i + 1]) args.year = argv[++i];
    else if (argv[i] === "--name" && argv[i + 1]) args.name = argv[++i];
    else if (argv[i] === "--dry-run") args.dryRun = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.district || !args.email) {
    console.error(
      "用法：npm run install:oneclick -- --district 板橋區 --email office@gmail.com [--year 115]",
    );
    process.exit(1);
  }

  const cfg = suggestClientFromDistrict({
    district: args.district,
    fiscalYear: args.year,
    email: args.email,
    clientName: args.name,
  });

  ensureDir(path.dirname(clientConfigPath(cfg.clientId)));
  fs.writeFileSync(clientConfigPath(cfg.clientId), JSON.stringify(cfg, null, 2));

  console.log("懶人包設定已產生：");
  console.log(`  客戶：${cfg.clientName} (${cfg.clientId})`);
  console.log(`  試算表：${cfg.spreadsheetName}`);
  console.log(`  登入：${args.email}`);
  console.log(`  設定檔：installer/clients/${cfg.clientId}.json`);
  console.log("");

  const runner = path.join(ROOT, "scripts", "installer", "run-job.mjs");
  const extra = args.dryRun ? ["--dry-run"] : [];
  const result = spawnSync(
    process.execPath,
    [runner, "--config", clientConfigPath(cfg.clientId), ...extra],
    { stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}

main();
