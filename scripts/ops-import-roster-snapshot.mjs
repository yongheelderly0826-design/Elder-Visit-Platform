#!/usr/bin/env node
/**
 * 將 1151117 清冊匯入 GAS「清冊快照」，並觸發個案進度 summary 快取重算。
 *
 * Usage:
 *   node scripts/ops-import-roster-snapshot.mjs
 *   node scripts/ops-import-roster-snapshot.mjs --file /path/to.xlsx --password Aabc004
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);

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

function parseArgs(argv) {
  const out = {
    file: "/Users/apple/Downloads/1151117_永和區獨居老人訪查清冊.xlsx",
    password: "Aabc004",
    snapshotId: `SNAP-1151117-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
    chunk: 400,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") out.file = argv[++i];
    else if (a === "--password") out.password = argv[++i];
    else if (a === "--snapshot-id") out.snapshotId = argv[++i];
    else if (a === "--chunk") out.chunk = Number(argv[++i]) || out.chunk;
  }
  return out;
}

function decryptXlsx(src, password, dest) {
  if (fs.existsSync(dest)) return dest;
  const pyBin = fs.existsSync(".venv-ops/bin/python")
    ? ".venv-ops/bin/python"
    : "python3";
  const py = `
import sys
try:
    import msoffcrypto
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'msoffcrypto-tool', '-q'])
    import msoffcrypto
src, password, dest = sys.argv[1], sys.argv[2], sys.argv[3]
with open(src, 'rb') as f:
    office = msoffcrypto.OfficeFile(f)
    office.load_key(password=password)
    with open(dest, 'wb') as out:
        office.decrypt(out)
print(dest)
`;
  const r = spawnSync(pyBin, ["-c", py, src, password, dest], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`decrypt failed: ${r.stderr || r.stdout}`);
  }
  return dest;
}

async function gas(env, action, { params = {}, body } = {}) {
  const url = new URL(env.GAS_WEB_APP_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("token", env.GAS_API_TOKEN);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${env.GAS_API_TOKEN}`,
      "X-Workspace-Id": env.GAS_WORKSPACE_ID || "WS-YH-115",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "follow",
    signal: AbortSignal.timeout(420000),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${action} non-json: ${text.slice(0, 300)}`);
  }
  if (!json.ok) {
    throw new Error(json.error?.message || `${action} failed`);
  }
  return json.data ?? json;
}

function normId(v) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-]/g, "");
}

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== "") return String(row[k]).trim();
  }
  return "";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv(path.resolve(".env.local"));
  if (!env.GAS_WEB_APP_URL || !env.GAS_API_TOKEN) {
    throw new Error("Missing GAS_WEB_APP_URL / GAS_API_TOKEN in .env.local");
  }

  const XLSX = require("xlsx");
  const workDir = path.resolve("docs/ops/_tmp-roster-snapshot");
  fs.mkdirSync(workDir, { recursive: true });
  const decrypted = path.join(workDir, "roster-decrypted.xlsx");
  console.log("decrypting", args.file);
  decryptXlsx(args.file, args.password, decrypted);

  const wb = XLSX.readFile(decrypted, { cellDates: false });
  const sheetName =
    wb.SheetNames.find((n) => n.includes("訪查清冊")) ||
    wb.SheetNames.find((n) => !n.includes("異常")) ||
    wb.SheetNames[0];
  // row0 = title, row1 = headers
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
  });
  const headerRow = (matrix[1] || []).map(String);
  const rows = [];
  for (let i = 2; i < matrix.length; i++) {
    const line = matrix[i] || [];
    if (!line.some((cell) => String(cell || "").trim())) continue;
    const obj = {};
    headerRow.forEach((h, idx) => {
      if (!h) return;
      obj[h] = line[idx];
    });
    rows.push(obj);
  }
  console.log("sheet", sheetName, "rows", rows.length, "headers", headerRow.slice(0, 12));

  const mapped = [];
  const seen = new Set();
  for (const row of rows) {
    const national_id = normId(
      pick(row, ["身分證號", "身分證字號", "身分證", "身份證字號", "id_number", "national_id"]),
    );
    if (!national_id || seen.has(national_id)) continue;
    seen.add(national_id);
    mapped.push({
      national_id,
      name: pick(row, ["姓名", "name"]),
      village: pick(row, ["戶籍里", "居住里", "里別", "訪查里", "village"]),
      roster_status: pick(row, ["狀態", "訪視狀態", "roster_status"]),
      living_address: pick(row, ["居住地址", "living_address"]),
      living_note: pick(row, ["居住說明", "living_note"]),
      completed_at: pick(row, ["完成日期", "訪查完成日", "completed_at"]),
    });
  }
  console.log("unique ids", mapped.length, "snapshot", args.snapshotId);

  // first chunk replaces; subsequent append
  let written = 0;
  for (let i = 0; i < mapped.length; i += args.chunk) {
    const chunk = mapped.slice(i, i + args.chunk);
    const append = i > 0;
    const isLast = i + args.chunk >= mapped.length;
    console.log(`upload ${i + 1}-${i + chunk.length}/${mapped.length} append=${append} refresh=${isLast}`);
    const result = await gas(env, "caseProgress.replaceRosterSnapshot", {
      body: {
        snapshot_id: args.snapshotId,
        rows: chunk,
        append,
        refresh_summary: isLast,
      },
    });
    written += result.written || chunk.length;
    if (isLast && result.summary?.totals) {
      console.log("summary totals", result.summary.totals);
      console.log("buckets", result.summary.buckets);
      fs.writeFileSync(
        path.join(workDir, "summary-after-import.json"),
        JSON.stringify(
          {
            snapshot_id: args.snapshotId,
            written,
            totals: result.summary.totals,
            buckets: result.summary.buckets,
            roster: result.summary.roster,
          },
          null,
          2,
        ),
      );
    }
  }
  console.log("done written", written);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
