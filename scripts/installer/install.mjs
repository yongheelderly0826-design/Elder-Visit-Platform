#!/usr/bin/env node
/**
 * 客戶一鍵安裝包 — 編排 Google Sheets + GAS + Vercel
 *
 * 用法：
 *   cp installer/client.config.example.json installer/clients/demo.json
 *   npm run install:client -- --config installer/clients/demo.json
 *   npm run install:client -- --config installer/clients/demo.json --resume
 *
 * 前置（一次性）：
 *   npm run gas:login          # Google 帳號
 *   npx vercel login           # Vercel（若啟用 vercel.enabled）
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function parseArgs(argv) {
  const args = { config: "", resume: false, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--config" && argv[i + 1]) args.config = argv[++i];
    else if (argv[i] === "--resume") args.resume = true;
    else if (argv[i] === "--dry-run") args.dryRun = true;
  }
  return args;
}

function run(cmd, opts = {}) {
  console.log(`\n▶ ${cmd}`);
  if (opts.dryRun) return "";
  return execSync(cmd, {
    cwd: opts.cwd || ROOT,
    encoding: "utf8",
    stdio: opts.silent ? "pipe" : "inherit",
  });
}

function runCapture(cmd, cwd = ROOT) {
  return execSync(cmd, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

function loadConfig(configPath) {
  const abs = path.isAbsolute(configPath)
    ? configPath
    : path.join(ROOT, configPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`找不到設定檔：${abs}`);
  }
  return { path: abs, data: JSON.parse(fs.readFileSync(abs, "utf8")) };
}

function statePath(clientId) {
  return path.join(ROOT, "installer", "output", clientId, "install-state.json");
}

function loadState(clientId) {
  const p = statePath(clientId);
  if (!fs.existsSync(p)) return { phase: "start" };
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function saveState(clientId, state) {
  const dir = path.dirname(statePath(clientId));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statePath(clientId), JSON.stringify(state, null, 2));
}

function banner(title) {
  console.log("\n" + "=".repeat(60));
  console.log(` ${title}`);
  console.log("=".repeat(60));
}

function preflight(cfg, dryRun) {
  banner("Phase 0 · 前置檢查");
  const required = ["clientId", "clientName", "district", "fiscalYear"];
  for (const key of required) {
    if (!cfg[key]) throw new Error(`client.config 缺少欄位：${key}`);
  }
  try {
    runCapture("node -v");
    runCapture("npm -v");
  } catch {
    throw new Error("需要 Node.js 與 npm");
  }
  try {
    runCapture("npx clasp -v", path.join(ROOT, "gas"));
    console.log("✓ clasp 可用");
  } catch {
    throw new Error("請先執行：npm run gas:login");
  }
  if (!dryRun && !fs.existsSync(path.join(ROOT, "node_modules"))) {
    run("npm install");
  }
  console.log("✓ 前置檢查通過");
}

function setupGas(cfg, dryRun) {
  banner("Phase 1 · Google Apps Script + 試算表");
  const gasDir = path.join(ROOT, "gas");
  const claspJson = path.join(gasDir, ".clasp.json");

  if (!fs.existsSync(claspJson)) {
    const title = cfg.google?.gasProjectTitle || `${cfg.clientName} GAS`;
    run(
      `npx clasp create --type standalone --title ${JSON.stringify(title)} --rootDir src`,
      { cwd: gasDir, dryRun },
    );
  } else {
    console.log("✓ GAS 專案已連結");
  }

  run("npx clasp push", { cwd: gasDir, dryRun });

  const bootstrapPayload = JSON.stringify({
    clientId: cfg.clientId,
    clientName: cfg.clientName,
    clientCode: cfg.clientCode,
    district: cfg.district,
    fiscalYear: cfg.fiscalYear,
    workspaceId: cfg.workspaceId,
    encodePrefix: cfg.encodePrefix,
    spreadsheetName: cfg.spreadsheetName,
  });

  console.log("\n執行 bootstrapForClient …");
  let bootstrapResult = {};
  if (!dryRun) {
    const out = runCapture(
      `npx clasp run bootstrapForClient --params ${JSON.stringify([bootstrapPayload])}`,
      gasDir,
    );
    try {
      bootstrapResult = JSON.parse(out);
    } catch {
      console.log(out);
      console.warn("⚠ 請從上方輸出手動複製 spreadsheet_id / api_token");
    }
  }

  return bootstrapResult;
}

function promptWebAppDeploy(cfg, bootstrap, dryRun) {
  banner("Phase 2 · GAS Web App 部署（需一次人工確認）");
  console.log(`
請在瀏覽器完成（約 2 分鐘）：
  1. 開啟 https://script.google.com
  2. 開啟專案「${cfg.google?.gasProjectTitle || cfg.clientName}」
  3. 部署 → 新增部署 → 類型：Web App
  4. 執行身分：我 ｜ 存取：任何人
  5. 複製 Web App URL（結尾 /exec）

API Token（若尚未記錄）：${bootstrap.api_token || "（見 install-state.json）"}
試算表：${bootstrap.spreadsheet_url || "（見 install-state.json）"}
`);
  if (dryRun) return bootstrap.gasWebAppUrl || "";

  const state = loadState(cfg.clientId);
  if (state.gasWebAppUrl) {
    console.log(`✓ 已記錄 Web App URL：${state.gasWebAppUrl}`);
    return state.gasWebAppUrl;
  }

  console.log("完成後請執行：");
  console.log(
    `  npm run install:client -- --config installer/clients/${cfg.clientId}.json --resume`,
  );
  process.exit(0);
}

function writeEnvLocal(cfg, bootstrap, gasWebAppUrl) {
  const allowed = (cfg.access?.allowedEmails || []).join(",");
  const owners = (cfg.access?.ownerEmails || []).join(",");
  const appUrl = cfg.vercel?.productionUrl || "http://localhost:3000";

  const content = `# Generated by install:client — ${cfg.clientId}
GAS_WEB_APP_URL=${gasWebAppUrl}
GAS_API_TOKEN=${bootstrap.api_token || ""}
GAS_WORKSPACE_ID=${bootstrap.workspace_id || cfg.workspaceId}
GAS_SPREADSHEET_ID=${bootstrap.spreadsheet_id || ""}

GOOGLE_ALLOWED_EMAILS=${allowed}
GOOGLE_OWNER_EMAILS=${owners}

NEXT_PUBLIC_APP_URL=${appUrl}
`;
  fs.writeFileSync(path.join(ROOT, ".env.local"), content);
  console.log("✓ 已寫入 .env.local");
}

function deployVercel(cfg, dryRun) {
  if (!cfg.vercel?.enabled) {
    console.log("⊘ Vercel 部署已略過（vercel.enabled = false）");
    return;
  }
  banner("Phase 3 · Vercel 部署");
  const scope = cfg.vercel.teamSlug;
  const project = cfg.vercel.projectName;
  const appUrl = cfg.vercel.productionUrl;

  run("rm -rf .vercel", { dryRun });
  run(`npx vercel link --yes --scope ${scope} --project ${project}`, { dryRun });

  const envPairs = [
    ["GAS_WEB_APP_URL", process.env.GAS_WEB_APP_URL],
    ["GAS_API_TOKEN", process.env.GAS_API_TOKEN],
    ["GAS_WORKSPACE_ID", process.env.GAS_WORKSPACE_ID],
    ["GAS_SPREADSHEET_ID", process.env.GAS_SPREADSHEET_ID],
    ["GOOGLE_ALLOWED_EMAILS", (cfg.access?.allowedEmails || []).join(",")],
    ["GOOGLE_OWNER_EMAILS", (cfg.access?.ownerEmails || []).join(",")],
    ["NEXT_PUBLIC_APP_URL", appUrl],
  ];

  for (const [key, val] of envPairs) {
    if (!val) continue;
    for (const env of ["production", "preview", "development"]) {
      run(
        `printf %s ${JSON.stringify(val)} | npx vercel env add ${key} ${env} --scope ${scope} --yes`,
        { silent: true, dryRun },
      );
    }
  }

  run(`npx vercel --prod --yes --scope ${scope}`, { dryRun });
  console.log(`✓ Vercel Production：${appUrl}`);
}

function generateHandoff(cfg, bootstrap, gasWebAppUrl) {
  banner("Phase 4 · 生成交接包");
  const outDir = path.join(ROOT, "installer", "output", cfg.clientId);
  fs.mkdirSync(outDir, { recursive: true });

  const credentials = {
    clientId: cfg.clientId,
    generatedAt: new Date().toISOString(),
    spreadsheetUrl: bootstrap.spreadsheet_url,
    spreadsheetId: bootstrap.spreadsheet_id,
    workspaceId: bootstrap.workspace_id || cfg.workspaceId,
    gasWebAppUrl,
    apiToken: bootstrap.api_token,
    vercelUrl: cfg.vercel?.productionUrl,
    googleAccount: cfg.google?.accountEmail,
  };

  fs.writeFileSync(
    path.join(outDir, "credentials.json"),
    JSON.stringify(credentials, null, 2),
  );

  const handoff = `# ${cfg.clientName} — 系統交接清單

> 合約／專案：${cfg.handoff?.contractRef || "—"}  
> 交接日期：${new Date().toISOString().slice(0, 10)}  
> 技術支援至：${cfg.handoff?.supportUntil || "—"}

## 1. 交付項目

| 項目 | 內容 |
|------|------|
| 管理網站 | ${cfg.vercel?.productionUrl || "本機 npm run dev"} |
| Google 試算表 | ${bootstrap.spreadsheet_url || "—"} |
| 操作說明書 | docs/system-operation-manual.md |
| 架構說明書 | docs/system-architecture.md |

## 2. 登入方式

- **承辦管理者**：${cfg.vercel?.productionUrl || ""}/login
- 輸入 Gmail：${(cfg.access?.allowedEmails || []).join("、")}
- 按「以管理者進入」

## 3. 帳號清單

| 用途 | 帳號 |
|------|------|
| Google 試算表／GAS | ${cfg.google?.accountEmail || "—"} |
| 網站登入 | ${(cfg.access?.allowedEmails || []).join("、")} |

## 4. 驗收檢查（請逐項打勾）

- [ ] 可登入管理後台
- [ ] 名冊可看到個案資料
- [ ] 試算表可開啟且與網站資料一致
- [ ] 派案、匯入、匯出功能可操作
- [ ] 已收到操作說明書與架構說明書

## 5. 注意事項

1. 請勿將 API Token 公開或上傳至 GitHub
2. 試算表僅授予必要人員編輯權限
3. 技術問題請聯繫：${cfg.handoff?.contactEmail || "—"}

---

*本文件由 install:client 自動產生*
`;

  fs.writeFileSync(path.join(outDir, "handoff.md"), handoff);
  console.log(`✓ 交接包：installer/output/${cfg.clientId}/`);
  console.log("  - credentials.json（機密，勿外傳）");
  console.log("  - handoff.md（可交付客戶）");
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.config) {
    console.error(
      "用法：npm run install:client -- --config installer/clients/<id>.json [--resume] [--dry-run]",
    );
    process.exit(1);
  }

  const { data: cfg } = loadConfig(args.config);
  const state = loadState(cfg.clientId);

  banner(`客戶一鍵安裝 · ${cfg.clientName} (${cfg.clientId})`);
  if (args.dryRun) console.log("（dry-run 模式，不實際執行）");

  preflight(cfg, args.dryRun);

  let bootstrap = state.bootstrap || {};
  if (!args.resume || !state.bootstrap) {
    bootstrap = setupGas(cfg, args.dryRun);
    saveState(cfg.clientId, { ...state, bootstrap, phase: "gas_done" });
  }

  let gasWebAppUrl = state.gasWebAppUrl || "";
  if (!gasWebAppUrl) {
    const envPath = path.join(ROOT, ".env.local");
    if (fs.existsSync(envPath)) {
      const m = fs.readFileSync(envPath, "utf8").match(/^GAS_WEB_APP_URL=(.+)$/m);
      if (m?.[1] && !m[1].includes("PLACEHOLDER")) {
        gasWebAppUrl = m[1].trim();
      }
    }
  }

  if (!gasWebAppUrl) {
    if (args.resume) {
      console.error(
        "缺少 GAS Web App URL。請完成 GAS 部署後，寫入 .env.local 的 GAS_WEB_APP_URL 再 --resume",
      );
      process.exit(1);
    }
    promptWebAppDeploy(cfg, bootstrap, args.dryRun);
  }

  writeEnvLocal(cfg, bootstrap, gasWebAppUrl);

  // load env for vercel script
  const envContent = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  for (const line of envContent.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }

  deployVercel(cfg, args.dryRun);
  generateHandoff(cfg, bootstrap, gasWebAppUrl);
  saveState(cfg.clientId, {
    bootstrap,
    gasWebAppUrl,
    phase: "complete",
    completedAt: new Date().toISOString(),
  });

  banner("安裝完成");
  console.log(`
下一步：
  1. 將 handoff.md 交付客戶簽收
  2. 確認 GitHub 倉庫設為 Private
  3. 收款後提供 credentials.json（加密管道）
`);
}

main().catch((err) => {
  console.error("\n✗ 安裝失敗：", err.message);
  process.exit(1);
});
