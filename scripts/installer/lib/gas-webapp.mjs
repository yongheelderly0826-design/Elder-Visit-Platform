/**
 * 自動部署 GAS Web App，並取出 /exec URL
 * 優先用 Apps Script API；失敗則退回 clasp deploy。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { ROOT } from "./paths.mjs";

const SCRIPT_API = "https://script.googleapis.com/v1";

function gasDir() {
  return path.join(ROOT, "gas");
}

function readScriptId() {
  const claspPath = path.join(gasDir(), ".clasp.json");
  if (!fs.existsSync(claspPath)) {
    throw new Error("找不到 gas/.clasp.json，請先建立 GAS 專案");
  }
  const json = JSON.parse(fs.readFileSync(claspPath, "utf8"));
  if (!json.scriptId) throw new Error("gas/.clasp.json 缺少 scriptId");
  return json.scriptId;
}

function readClaspToken() {
  const file = path.join(os.homedir(), ".clasprc.json");
  if (!fs.existsSync(file)) {
    throw new Error("尚未 clasp login（找不到 ~/.clasprc.json）");
  }
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  return (
    json.tokens?.default?.access_token ||
    json.token?.access_token ||
    json.tokens?.clasprc?.access_token ||
    ""
  );
}

async function scriptApi(token, method, pathname, body) {
  const res = await fetch(`${SCRIPT_API}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(data.error?.message || data.message || text || res.statusText);
  }
  return data;
}

function extractWebAppUrl(deployment) {
  const points = deployment.entryPoints || [];
  const web = points.find((p) => p.entryPointType === "WEB_APP" || p.webApp);
  const url = web?.webApp?.url || web?.url;
  if (url) return url.replace(/\/dev$/, "/exec");
  const id = deployment.deploymentId || "";
  if (id) return `https://script.google.com/macros/s/${id}/exec`;
  return "";
}

function parseClaspDeployOutput(out) {
  const urlMatch = out.match(/https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/);
  if (urlMatch) return urlMatch[0];
  const idMatch = out.match(/-(AKfycb[A-Za-z0-9_-]+)/) || out.match(/(AKfycb[A-Za-z0-9_-]+)/);
  if (idMatch) return `https://script.google.com/macros/s/${idMatch[1]}/exec`;
  return "";
}

async function deployViaApi(log) {
  const scriptId = readScriptId();
  const token = readClaspToken();
  if (!token) throw new Error("clasp token 為空，請重新執行 npm run gas:login");

  const listed = await scriptApi(token, "GET", `/projects/${scriptId}/deployments`);
  const existing = (listed.deployments || [])
    .map(extractWebAppUrl)
    .find((url) => url.includes("/exec") && !url.endsWith("/dev"));
  if (existing) {
    log(`✓ 沿用既有 Web App：${existing}`);
    return existing;
  }

  const version = await scriptApi(token, "POST", `/projects/${scriptId}/versions`, {
    description: "oneclick",
  });
  const deployment = await scriptApi(token, "POST", `/projects/${scriptId}/deployments`, {
    versionNumber: version.versionNumber,
    description: "oneclick-webapp",
    manifestFileName: "appsscript",
  });
  const url = extractWebAppUrl(deployment);
  if (!url) throw new Error("API 部署成功但未回傳 Web App URL");
  log(`✓ 已自動部署 Web App：${url}`);
  return url;
}

function deployViaClasp(log) {
  log("改用 clasp deploy 部署 Web App …");
  try {
    execSync("npx clasp version oneclick", { cwd: gasDir(), stdio: "pipe" });
  } catch {
    // version may already exist
  }
  const out = execSync("npx clasp deploy --description oneclick-webapp", {
    cwd: gasDir(),
    encoding: "utf8",
    stdio: "pipe",
  });
  log(out.trim());
  let url = parseClaspDeployOutput(out);
  if (!url) {
    const listed = execSync("npx clasp deployments", {
      cwd: gasDir(),
      encoding: "utf8",
      stdio: "pipe",
    });
    log(listed.trim());
    url = parseClaspDeployOutput(listed);
  }
  if (!url) throw new Error("clasp deploy 完成，但無法解析 /exec URL");
  log(`✓ clasp 部署 Web App：${url}`);
  return url;
}

export async function deployGasWebApp(log, dryRun = false) {
  if (dryRun) {
    log("（dry-run）將自動部署 GAS Web App");
    return "https://script.google.com/macros/s/DRYRUN/exec";
  }

  log("Phase 2 · 自動部署 GAS Web App");
  try {
    return await deployViaApi(log);
  } catch (error) {
    log(`⚠ Script API 部署失敗：${error.message}`);
    return deployViaClasp(log);
  }
}
