#!/usr/bin/env node
/**
 * 匯入 60 筆測試個案至 Google Sheets（經 GAS API）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1)];
      }),
  );
}

const env = { ...loadEnv(path.join(root, ".env.example")), ...loadEnv(path.join(root, ".env.local")) };
const GAS_URL = env.GAS_WEB_APP_URL;
const GAS_TOKEN = env.GAS_API_TOKEN;

if (!GAS_URL || !GAS_TOKEN) {
  console.error("Missing GAS_WEB_APP_URL or GAS_API_TOKEN in .env.local");
  process.exit(1);
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row = {};
    headers.forEach((h, i) => {
      row[h.trim()] = (cols[i] ?? "").trim();
    });
    return row;
  });
}

function mapPriority(v) {
  if (v === "urgent" || v === "緊急") return "高";
  if (v === "medium_high" || v === "中高") return "中";
  if (v === "medium" || v === "中") return "中";
  if (v === "low" || v === "低") return "低";
  return "中";
}

function mapCaseType(v) {
  if (v === "solitary_elder" || v === "獨老") return "獨老";
  if (v === "middle_elder" || v === "中老") return "中老";
  return v;
}

const csvPath =
  process.argv[2] ||
  path.join(process.env.HOME ?? "", "Downloads", "派案訪視_系統匯入60筆.csv");

if (!fs.existsSync(csvPath)) {
  console.error("CSV not found:", csvPath);
  process.exit(1);
}

const rows = parseCsv(fs.readFileSync(csvPath, "utf8")).map((row) => ({
  external_id: row.external_id,
  case_type: mapCaseType(row.case_type),
  name: row.name,
  id_number: row.id_number,
  age: Number(row.age) || "",
  gender: "",
  household_district: row.district || row["行政區"] || "永和區",
  household_village: row.village || "",
  visit_district: row.visit_district || row["訪視行政區"] || "永和區",
  visit_village: row.village || "",
  address: row.visit_address || "",
  primary_phone: row.primary_phone || "",
  secondary_phone: row.secondary_phone || "",
  contact_note: row.contact_note || row.remark || "",
  visit_status: "待訪",
  dispatch_priority: mapPriority(row.dispatch_priority),
  data_quality_tag: row.data_quality_tag || "",
}));

async function gasPost(action, body) {
  const url = new URL(GAS_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("token", GAS_TOKEN);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GAS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "GAS error");
  return json.data;
}

console.log(`Importing ${rows.length} cases from ${csvPath}...`);
const result = await gasPost("cases.import", { rows });
console.log(JSON.stringify(result, null, 2));

const listUrl = new URL(GAS_URL);
listUrl.searchParams.set("action", "cases.list");
listUrl.searchParams.set("token", GAS_TOKEN);
listUrl.searchParams.set("district", "永和區");
const listRes = await fetch(listUrl.toString(), {
  headers: { Authorization: `Bearer ${GAS_TOKEN}` },
});
const listJson = await listRes.json();
console.log("Total cases in sheet:", listJson.data?.length ?? 0);
