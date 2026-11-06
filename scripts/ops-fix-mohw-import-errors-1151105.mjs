#!/usr/bin/env node
/**
 * 從 生活關懷表1151105.xlsx 抽出中央匯入失敗 15 筆、就地修正、
 * 另存可重匯檔，並同步 patch 本系統關懷表 answers。
 *
 * Usage: node scripts/ops-fix-mohw-import-errors-1151105.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "/Users/apple/Downloads/生活關懷表1151105.xlsx";
const OUT = "/Users/apple/Downloads/生活關懷表1151105-僅錯誤已修正.xlsx";

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

async function gas(action, { params = {}, body } = {}) {
  const url = new URL(GAS_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("token", GAS_TOKEN);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  if (body && JSON.stringify(body).length < 3500) {
    url.searchParams.set("body", JSON.stringify(body));
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
  return json.data ?? json;
}

function colToIdx(col) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function bumpHhMm(value, minutes) {
  const m = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return value;
  let total = Number(m[1]) * 60 + Number(m[2]) + minutes;
  if (total < 0) total = 0;
  if (total > 23 * 60 + 59) total = 23 * 60 + 59;
  const h = Math.floor(total / 60);
  const min = total % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Excel 1-based data rows that failed central import */
const ERROR_ROWS = {
  7: { kind: "help_none_has" },
  11: { kind: "duplicate", bumpMinutes: 1 },
  12: { kind: "living_city_changhua" },
  18: { kind: "duplicate", bumpMinutes: 1 },
  31: { kind: "help_none_has" },
  32: { kind: "help_none_has" },
  33: { kind: "help_none_has" },
  40: { kind: "help_none_has" },
  41: { kind: "help_none_has" },
  53: { kind: "help_none_has" },
  59: { kind: "help_none_has" },
  76: { kind: "help_none_has" },
  80: { kind: "help_none_has" },
  81: { kind: "help_none_has" },
  97: { kind: "help_none_has" },
};

const IDX = {
  date: 0,
  start: 1,
  end: 2,
  name: colToIdx("F"),
  nationalId: colToIdx("I"),
  livingCity: colToIdx("X"),
  livingDistrict: colToIdx("Y"),
  helpFlag: colToIdx("BL"),
  helpNone: colToIdx("BM"),
  helpNoneOther: colToIdx("BN"),
  helpHas: colToIdx("BO"),
  helpHasOther: colToIdx("BP"),
};

function fixRow(row, meta) {
  const next = row.slice();
  const fixes = [];
  if (meta.kind === "help_none_has" || String(next[IDX.helpFlag] || "").trim() === "無") {
    if (String(next[IDX.helpHas] || "").trim()) {
      next[IDX.helpHas] = "";
      fixes.push("clear help_sources_has");
    }
    if (String(next[IDX.helpHasOther] || "").trim()) {
      next[IDX.helpHasOther] = "";
      fixes.push("clear help_sources_has_other");
    }
  }
  if (meta.kind === "living_city_changhua" || String(next[IDX.livingCity] || "").trim() === "彰化市") {
    next[IDX.livingCity] = "彰化縣";
    const dist = String(next[IDX.livingDistrict] || "").trim();
    if (!dist || dist === "彰化" || dist === "彰化市") next[IDX.livingDistrict] = "彰化市";
    fixes.push("living_city 彰化市→彰化縣/彰化市");
  }
  if (meta.kind === "duplicate") {
    const bump = meta.bumpMinutes || 1;
    const beforeStart = String(next[IDX.start] || "");
    const beforeEnd = String(next[IDX.end] || "");
    next[IDX.start] = bumpHhMm(beforeStart, bump);
    if (beforeEnd) next[IDX.end] = bumpHhMm(beforeEnd, bump);
    fixes.push(`duplicate bump +${bump}m ${beforeStart}→${next[IDX.start]}`);
  }
  return { row: next, fixes };
}

function mainLocal() {
  const wb = XLSX.readFile(SRC);
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false,
  });
  const header = rows[0];
  const outRows = [header];
  const report = [];

  for (const [rowNum, meta] of Object.entries(ERROR_ROWS)) {
    const r = Number(rowNum);
    const raw = rows[r - 1];
    if (!raw) {
      report.push({ excelRow: r, error: "missing row" });
      continue;
    }
    const { row, fixes } = fixRow(raw, meta);
    outRows.push(row);
    report.push({
      excelRow: r,
      name: row[IDX.name],
      national_id: String(row[IDX.nationalId] || "").toUpperCase(),
      visit_date: row[IDX.date],
      visit_start: row[IDX.start],
      kind: meta.kind,
      fixes,
      help_flag: row[IDX.helpFlag],
      help_has: row[IDX.helpHas],
      living_city: row[IDX.livingCity],
      living_district: row[IDX.livingDistrict],
    });
  }

  const outWb = XLSX.utils.book_new();
  const outSheet = XLSX.utils.aoa_to_sheet(outRows);
  XLSX.utils.book_append_sheet(outWb, outSheet, sheetName);
  XLSX.writeFile(outWb, OUT);

  const reportPath = path.join(root, "docs/ops/mohw-import-errors-1151105-fix-2026-11-06.json");
  fs.writeFileSync(reportPath, JSON.stringify({ source: SRC, out: OUT, rows: report }, null, 2));
  console.log("wrote", OUT);
  console.log("report", reportPath);
  return report;
}

async function syncSystem(report) {
  if (!GAS_URL || !GAS_TOKEN) {
    console.warn("skip system sync: missing GAS env");
    return;
  }
  const nationalIds = [...new Set(report.map((r) => r.national_id).filter(Boolean))];
  const found = await gas("ops.findCareformsByNationalIds", {
    body: { national_ids: nationalIds },
  });
  console.log("found careforms", found.count);

  const byNid = {};
  for (const item of found.items || []) {
    const nid = String(item.national_id || "").toUpperCase();
    if (!byNid[nid]) byNid[nid] = [];
    byNid[nid].push(item);
  }

  const patches = [];
  for (const row of report) {
    const list = byNid[row.national_id] || [];
    // Prefer matching visit_date when possible
    const matched =
      list.filter((c) => String(c.visit_date || "").includes(String(row.visit_date || "").slice(0, 9))) ||
      list;
    const targets = matched.length ? matched : list;
    for (const cf of targets) {
      const answers = {};
      if (row.kind === "help_none_has" || row.help_flag === "無") {
        answers.help_sources_has = "";
        answers.help_sources_has_other = "";
        answers.help_sources_flag = "無";
      }
      if (row.kind === "living_city_changhua" || cf.living_city === "彰化市") {
        answers.living_city = "彰化縣";
        answers.living_district =
          !cf.living_district || cf.living_district === "彰化" || cf.living_district === "彰化市"
            ? "彰化市"
            : cf.living_district;
      }
      // duplicates: keep local times; central collision handled in re-import file bump only
      if (Object.keys(answers).length) {
        patches.push({ careform_id: cf.careform_id, answers });
      }
    }
  }

  // dedupe by careform_id (merge answers)
  const merged = {};
  for (const p of patches) {
    merged[p.careform_id] = {
      careform_id: p.careform_id,
      answers: { ...(merged[p.careform_id]?.answers || {}), ...p.answers },
    };
  }
  const patchList = Object.values(merged);
  console.log("patches", patchList.length);
  if (!patchList.length) return { patched: 0 };

  // chunk to keep body small
  const chunkSize = 20;
  const results = [];
  for (let i = 0; i < patchList.length; i += chunkSize) {
    const chunk = patchList.slice(i, i + chunkSize);
    const r = await gas("ops.patchCareformAnswers", {
      body: { apply: true, patches: chunk },
    });
    results.push(r);
    console.log("patched chunk", i / chunkSize + 1, r.written ?? r.changed_count ?? r);
  }
  return { patched: patchList.length, results };
}

const report = mainLocal();
const sync = await syncSystem(report);
console.log(JSON.stringify({ row_count: report.length, sync }, null, 2));
