#!/usr/bin/env node
/**
 * Ops: 掃描「某一側有填日期卻缺該側人員」
 * Usage:
 *   node scripts/ops-scan-missing-worker-with-time.mjs
 *   node scripts/ops-scan-missing-worker-with-time.mjs --nid
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, "")];
      }),
  );
}

const env = loadEnv(path.join(root, ".env.local"));
const GAS_URL = env.GAS_WEB_APP_URL;
const GAS_TOKEN = env.GAS_API_TOKEN;

if (!GAS_URL || !GAS_TOKEN) {
  console.error("Missing GAS_WEB_APP_URL / GAS_API_TOKEN");
  process.exit(1);
}

const requireNid = process.argv.includes("--nid");

async function gas(action, { params = {}, body } = {}) {
  const url = new URL(GAS_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("token", GAS_TOKEN);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  if (body) {
    const serialized = JSON.stringify(body);
    if (serialized.length < 3500) url.searchParams.set("body", serialized);
  }
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${GAS_TOKEN}`,
      "X-Workspace-Id": env.GAS_WORKSPACE_ID || "WS-YH-115",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "follow",
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${action} non-JSON (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!json.ok) {
    const err = json.error || {};
    throw new Error(`${action} ${err.code || "ERR"}: ${err.message || "failed"}`);
  }
  return json.data;
}

const data = await gas("ops.scanMissingWorkerWithTime", {
  body: {
    statuses: ["已提交", "已稽核"],
    sample_limit: 10,
    require_national_id: requireNid,
  },
});

console.log(JSON.stringify(data, null, 2));
