#!/usr/bin/env node
/**
 * P0：匯入 75歲以上待訪個案 + 每人分配里別 → GAS
 *
 * Usage:
 *   node scripts/import-village-desk-p0.mjs
 *   node scripts/import-village-desk-p0.mjs --cases-only
 *   node scripts/import-village-desk-p0.mjs --admins-only
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import XLSX from "xlsx";

const CASE_XLSX = "/Users/apple/Downloads/75歲以上待訪(線上).xlsx";
const ADMIN_XLSX = "/Users/apple/Downloads/每人分配里別.xlsx";
const BATCH = 200;

const args = new Set(process.argv.slice(2));
const casesOnly = args.has("--cases-only");
const adminsOnly = args.has("--admins-only");

const env = Object.fromEntries(
  readFileSync(resolve(".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const ORG = {
  民政課: { kind: "org", key: "org:civil-affairs" },
  永和紳士協會: { kind: "org", key: "org:gentlemen" },
  送餐組志工: { kind: "org", key: "org:meal-volunteers" },
  "都更(不用訪)": { kind: "skip", key: "org:urban-renewal-skip" },
};

const UNASSIGNED = ["中溪里", "中興里", "光明里", "協和里", "忠義里", "前溪里", "勵行里"];

function classify(name) {
  if (ORG[name]) return { admin_display_name: name, admin_kind: ORG[name].kind, admin_account_key: ORG[name].key };
  if (/都更/.test(name)) return { admin_display_name: name, admin_kind: "skip", admin_account_key: ORG["都更(不用訪)"].key };
  if (/紳士協會/.test(name)) return { admin_display_name: name, admin_kind: "org", admin_account_key: ORG["永和紳士協會"].key };
  if (/送餐/.test(name)) return { admin_display_name: name, admin_kind: "org", admin_account_key: ORG["送餐組志工"].key };
  if (name === "民政課") return { admin_display_name: name, admin_kind: "org", admin_account_key: ORG["民政課"].key };
  return { admin_display_name: name, admin_kind: "person", admin_account_key: name };
}

function splitNames(raw) {
  return String(raw || "")
    .split(/[&＆、,，/／]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function gas(action, body) {
  const url = new URL(env.GAS_WEB_APP_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("token", env.GAS_API_TOKEN);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GAS_API_TOKEN}`,
      "Content-Type": "application/json",
      "X-Workspace-Id": env.GAS_WORKSPACE_ID || "WS-YH-115",
    },
    body: JSON.stringify(body || {}),
    redirect: "follow",
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${action} non-json HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!json.ok) throw new Error(`${action} failed: ${JSON.stringify(json.error)}`);
  return json.data;
}

async function gasGet(action, params = {}) {
  const url = new URL(env.GAS_WEB_APP_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("token", env.GAS_API_TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.GAS_API_TOKEN}`,
      "X-Workspace-Id": env.GAS_WORKSPACE_ID || "WS-YH-115",
    },
    redirect: "follow",
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${action} failed: ${JSON.stringify(json.error)}`);
  return json.data;
}

function parseCases() {
  const wb = XLSX.readFile(CASE_XLSX);
  const sheet = wb.Sheets["75歲以上-6901人"] || wb.Sheets[wb.SheetNames[wb.SheetNames.length - 1]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows
    .map((row) => {
      const id = String(row["身分證號"] || "").trim().toUpperCase();
      const name = String(row["姓名"] || "").trim();
      if (!id || !name) return null;
      const village = String(row["戶籍里"] || "").trim();
      const birth = String(row["出生日期"] || "").trim();
      return {
        name,
        id_number: id,
        birth_date: birth,
        case_type: "獨老",
        household_district: String(row["戶籍區"] || "永和區").trim() || "永和區",
        household_village: village,
        visit_district: "永和區",
        visit_village: village,
        address: String(row["戶籍地址"] || "").trim(),
        contact_note: "75歲以上待訪(線上)·匯入",
        visit_status: village === "永成里" ? "不訪" : "待訪",
        dispatch_priority: "中",
        external_id: String(row["編號"] || "").trim(),
        // Excel「里編號」＝該里紙本順序（與全域「編號」不同）
        village_seq: Number(row["里編號"] || row["里編碼"] || 0) || "",
      };
    })
    .filter(Boolean);
}

function parseAdmins(visitorNameToId) {
  const wb = XLSX.readFile(ADMIN_XLSX);
  const sheet = wb.Sheets["分配表"] || wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const out = [];
  const seenUnassigned = new Set();
  for (const cells of matrix) {
    const villageCode = String(cells[0] || "").trim();
    const villageName = String(cells[1] || "").trim();
    const count = String(cells[2] || "").trim();
    const adminRaw = String(cells[3] || "").trim();
    if (!villageName || villageName === "戶籍里" || villageName === "總計") continue;
    if (!adminRaw) continue;
    for (const part of splitNames(adminRaw)) {
      const classified = classify(part);
      const matched = visitorNameToId.get(classified.admin_display_name) || "";
      out.push({
        village_code: villageCode,
        village_name: villageName,
        ...classified,
        matched_visitor_id: matched,
        status: "active",
        notes: count ? `分配表計數 ${count}` : "",
      });
    }
  }
  for (const village of UNASSIGNED) {
    if (seenUnassigned.has(village)) continue;
    seenUnassigned.add(village);
    out.push({
      village_code: "",
      village_name: village,
      admin_display_name: "民政課",
      admin_kind: "org",
      admin_account_key: "org:civil-affairs",
      matched_visitor_id: "",
      status: "active",
      notes: "未指定·P0暫管",
    });
  }
  return out;
}

async function importCases(rows) {
  let imported = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const result = await gas("cases.import", { rows: chunk });
    imported += Number(result.imported || 0);
    updated += Number(result.updated || 0);
    console.log(`cases ${Math.min(i + BATCH, rows.length)}/${rows.length} +${result.imported} ~${result.updated || 0}`);
  }
  return { imported, updated };
}

async function main() {
  if (!env.GAS_WEB_APP_URL || !env.GAS_API_TOKEN) {
    throw new Error("Missing GAS_WEB_APP_URL / GAS_API_TOKEN in .env.local");
  }

  if (!adminsOnly) {
    const cases = parseCases();
    console.log(`parsed cases: ${cases.length}`);
    const result = await importCases(cases);
    console.log("cases done", result);
  }

  if (!casesOnly) {
    const visitors = await gasGet("visitors.list");
    const visitorNameToId = new Map();
    for (const row of visitors || []) {
      const name = String(row.name || row.full_name || "").trim();
      const id = String(row.visitor_id || "").trim();
      if (name && id && !visitorNameToId.has(name)) visitorNameToId.set(name, id);
    }
    const admins = parseAdmins(visitorNameToId);
    console.log(`parsed village admins: ${admins.length}`);
    const result = await gas("villageAdmins.replaceAll", {
      mode: "replace",
      replace: true,
      updated_by: "import-village-desk-p0",
      rows: admins,
    });
    console.log("village admins done", result);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
