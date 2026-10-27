#!/usr/bin/env node
/**
 * 用「75歲以上待訪(線上).xlsx」的民國出生日期，覆寫 Sheets 個案名冊被誤收成西元的 birth_date。
 *
 * Usage:
 *   node scripts/repair-case-birth-dates-from-xlsx.mjs
 *   node scripts/repair-case-birth-dates-from-xlsx.mjs --file "/path/to.xlsx"
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { readFileSync } from "fs";
import { resolve } from "path";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const env = Object.fromEntries(
  readFileSync(resolve(".env.local"), "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const args = process.argv.slice(2);
const fileFlag = args.indexOf("--file");
const xlsxPath =
  (fileFlag >= 0 && args[fileFlag + 1]) ||
  path.join(process.env.HOME || "", "Downloads", "75歲以上待訪(線上).xlsx");

const GAS_URL = env.GAS_WEB_APP_URL || "";
const GAS_TOKEN = env.GAS_API_TOKEN || "";
const WORKSPACE = env.GAS_WORKSPACE_ID || "WS-YH-115";

if (!GAS_URL || !GAS_TOKEN) {
  console.error("Missing GAS_WEB_APP_URL / GAS_API_TOKEN in .env.local");
  process.exit(1);
}
if (!fs.existsSync(xlsxPath)) {
  console.error("Excel not found:", xlsxPath);
  process.exit(1);
}

function normalizeBirth(raw) {
  const text = String(raw ?? "").trim();
  const m = text.match(/^(\d{1,3})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return text;
  return `${String(Number(m[1])).padStart(3, "0")}/${String(Number(m[2])).padStart(2, "0")}/${String(Number(m[3])).padStart(2, "0")}`;
}

function normalizeId(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

async function gas(action, body) {
  const url = new URL(GAS_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("token", GAS_TOKEN);
  const hasBody = body != null && Object.keys(body).length > 0;
  const res = await fetch(url.toString(), {
    method: hasBody ? "POST" : "GET",
    headers: {
      ...(hasBody ? { "content-type": "application/json" } : {}),
      "X-Workspace-Id": WORKSPACE,
    },
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`${action} failed: ${JSON.stringify(json.error)}`);
  }
  return json.data;
}

const wb = XLSX.readFile(xlsxPath, { cellDates: false, raw: false });
const sheet = wb.Sheets["75歲以上-6901人"] || wb.Sheets[wb.SheetNames[wb.SheetNames.length - 1]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

const patchRows = [];
for (const row of rows) {
  const id = normalizeId(row["身分證號"]);
  const name = String(row["姓名"] || "").trim();
  const birth = normalizeBirth(row["出生日期"]);
  if (!id || !name || !birth) continue;
  patchRows.push({
    id_number: id,
    name,
    birth_date: birth,
  });
}

console.log(`Excel rows with birth: ${patchRows.length}`);

// 只更新名冊既有身分證，避免缺欄位列被當成新案匯入
const listed = (await gas("cases.list", {})) || [];
const listRows = Array.isArray(listed)
  ? listed
  : Array.isArray(listed.rows)
    ? listed.rows
    : [];
const existingIds = new Set(
  listRows.map((row) => normalizeId(row.id_number || row.idNumber)).filter(Boolean),
);
const toUpdate = patchRows.filter((row) => existingIds.has(row.id_number));
console.log(`Matched existing cases: ${toUpdate.length} / ${patchRows.length}`);

const BATCH = 200;
let updated = 0;
let imported = 0;
for (let i = 0; i < toUpdate.length; i += BATCH) {
  const chunk = toUpdate.slice(i, i + BATCH);
  const result = await gas("cases.import", {
    rows: chunk.map((item) => ({
      id_number: item.id_number,
      name: item.name,
      birth_date: item.birth_date,
    })),
  });
  updated += Number(result?.updated || 0);
  imported += Number(result?.imported || 0);
  console.log(
    `batch ${i / BATCH + 1}: updated=${result?.updated ?? 0} imported=${result?.imported ?? 0}`,
  );
}

console.log(`Done. updated≈${updated}, imported≈${imported}`);
