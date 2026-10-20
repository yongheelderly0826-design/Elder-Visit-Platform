/**
 * 匯出：舊帳密表（匯入時保存）＋目前 GAS 帳號清單（對照已知明文密碼）。
 * GAS 只存雜湊，無法反推；明文僅來自先前匯入產出的 CSV／已知示範帳。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SRC_DIR = resolve(
  process.env.HOME || "",
  "Downloads/supabase-訪員完整匯出-20261018",
);
const OUT_DIR = resolve(process.env.HOME || "", "Downloads");
const STAMP = new Date().toISOString().slice(0, 10).replaceAll("-", "");

function loadEnv() {
  const env: Record<string, string> = {};
  for (const line of readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    env[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return env;
}

function parseCsv(text: string) {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((v) => v !== "")) rows.push(row);
  }
  return rows;
}

function esc(v: unknown) {
  return `"${String(v ?? "").replaceAll('"', '""')}"`;
}

function asList(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const obj = data as { items?: unknown; rows?: unknown };
    if (Array.isArray(obj.items)) return obj.items as Record<string, unknown>[];
    if (Array.isArray(obj.rows)) return obj.rows as Record<string, unknown>[];
  }
  return [];
}

async function gas(action: string, params: Record<string, string> = {}) {
  const env = loadEnv();
  const url = new URL(env.GAS_WEB_APP_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("token", env.GAS_API_TOKEN);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${env.GAS_API_TOKEN}` },
    redirect: "follow",
  });
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("<")) {
    throw new Error(`GAS_NON_JSON ${action}`);
  }
  const json = JSON.parse(trimmed) as {
    ok: boolean;
    data?: unknown;
    error?: { message?: string };
  };
  if (!json.ok) throw new Error(json.error?.message || action);
  return json.data;
}

const KNOWN_EXTRA: Array<{ email: string; password: string; note: string }> = [
  { email: "joe@mail.cjcu.edu.tw", password: "joejoe123456", note: "Joe 專用帳（setup-joe）" },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // ── 舊帳密（匯入時產生）──
  const oldPath = resolve(SRC_DIR, "GAS登入帳密.csv");
  const oldRows = parseCsv(readFileSync(oldPath, "utf8"));
  const [oldHeader, ...oldBody] = oldRows;
  const oldIdx = Object.fromEntries(oldHeader.map((h, i) => [h, i]));

  const passwordByEmail = new Map<string, { password: string; source: string }>();
  for (const row of oldBody) {
    const email = String(row[oldIdx.Email] || "")
      .trim()
      .toLowerCase();
    const password = String(row[oldIdx["密碼"]] || "").trim();
    if (email && password) {
      passwordByEmail.set(email, { password, source: "2026-10-18 GAS匯入帳密表" });
    }
  }
  for (const extra of KNOWN_EXTRA) {
    passwordByEmail.set(extra.email.toLowerCase(), {
      password: extra.password,
      source: extra.note,
    });
  }

  // Copy / refresh old table to Downloads with clear name
  const oldOutLines = [
    ["來源", "角色", "姓名", "登入Email", "密碼", "訪員正式編碼", "有證件照", "備註"]
      .map(esc)
      .join(","),
  ];
  for (const row of oldBody) {
    oldOutLines.push(
      [
        "舊帳（2026-10-18 匯入GAS時產生）",
        row[oldIdx["角色"]],
        row[oldIdx["姓名"]],
        row[oldIdx.Email],
        row[oldIdx["密碼"]],
        row[oldIdx["訪員正式編碼"]],
        row[oldIdx["有證件照"]],
        row[oldIdx["備註"]],
      ]
        .map(esc)
        .join(","),
    );
  }
  const oldOutPath = resolve(OUT_DIR, `舊帳_訪查員GAS登入帳密_${STAMP}.csv`);
  writeFileSync(oldOutPath, `\uFEFF${oldOutLines.join("\r\n")}\r\n`, "utf8");

  // ── 目前 GAS ──
  const [regsRaw, visitorsRaw] = await Promise.all([
    gas("registrations.list"),
    gas("visitors.list"),
  ]);
  const regs = asList(regsRaw);
  const visitors = asList(visitorsRaw);

  type Acc = {
    email: string;
    name: string;
    role: string;
    status: string;
    visitorId: string;
    inRegistrations: boolean;
    inVisitors: boolean;
  };

  const byEmail = new Map<string, Acc>();

  for (const r of regs) {
    const email = String(r.email || "")
      .trim()
      .toLowerCase();
    if (!email) continue;
    const prev = byEmail.get(email);
    byEmail.set(email, {
      email,
      name: String(r.full_name || r.name || prev?.name || ""),
      role: String(r.requested_role_key || r.role_key || prev?.role || "visitor"),
      status: String(r.status || prev?.status || ""),
      visitorId: String(r.visitor_id || prev?.visitorId || ""),
      inRegistrations: true,
      inVisitors: prev?.inVisitors || false,
    });
  }

  for (const v of visitors) {
    const email = String(v.email || "")
      .trim()
      .toLowerCase();
    if (!email) continue;
    const prev = byEmail.get(email);
    byEmail.set(email, {
      email,
      name: String(v.name || v.full_name || prev?.name || ""),
      role: String(v.role_key || prev?.role || "visitor"),
      status: String(v.status || prev?.status || ""),
      visitorId: String(v.visitor_id || v.id || prev?.visitorId || ""),
      inRegistrations: prev?.inRegistrations || false,
      inVisitors: true,
    });
  }

  // 用匯入檢查報表補「登入是否成功」狀態（若存在）
  const checkPath = resolve(SRC_DIR, "GAS匯入檢查報表.csv");
  const loginByEmail = new Map<string, string>();
  try {
    const checkRows = parseCsv(readFileSync(checkPath, "utf8"));
    const [cH, ...cBody] = checkRows;
    const cIdx = Object.fromEntries(cH.map((h, i) => [h, i]));
    for (const row of cBody) {
      const email = String(row[cIdx.Email] || "")
        .trim()
        .toLowerCase();
      if (email) loginByEmail.set(email, String(row[cIdx["登入"]] || ""));
    }
  } catch {
    // optional
  }

  const gasLines = [
    [
      "序號",
      "姓名",
      "登入Email",
      "密碼",
      "密碼來源",
      "訪員正式編碼",
      "角色",
      "狀態",
      "在註冊表",
      "在訪員主檔",
      "上次登入檢查",
      "備註",
    ]
      .map(esc)
      .join(","),
  ];

  const sorted = [...byEmail.values()].sort((a, b) => {
    const an = a.name || a.email;
    const bn = b.name || b.email;
    return an.localeCompare(bn, "zh-Hant") || a.email.localeCompare(b.email);
  });

  let withPlain = 0;
  let noPassword = 0;
  let onlyInOld = 0;

  sorted.forEach((acc, index) => {
    const known = passwordByEmail.get(acc.email);
    const password = known?.password || "";
    const passwordSource = known?.source || "";
    const loginCheck = loginByEmail.get(acc.email) || "";

    let note = "";
    if (password) withPlain += 1;
    else {
      noPassword += 1;
      note = "目前無明文密碼記錄（未匯入／未核准／之後自行重設）";
    }

    gasLines.push(
      [
        index + 1,
        acc.name,
        acc.email,
        password,
        passwordSource,
        acc.visitorId,
        acc.role,
        acc.status,
        acc.inRegistrations ? "是" : "否",
        acc.inVisitors ? "是" : "否",
        loginCheck,
        note,
      ]
        .map(esc)
        .join(","),
    );
  });

  // 舊帳有、但目前 GAS 查無此 Email
  const gasEmails = new Set(byEmail.keys());
  for (const row of oldBody) {
    const email = String(row[oldIdx.Email] || "")
      .trim()
      .toLowerCase();
    if (email && !gasEmails.has(email)) onlyInOld += 1;
  }

  const gasOutPath = resolve(OUT_DIR, `目前GAS_訪查員登入帳密_${STAMP}.csv`);
  writeFileSync(gasOutPath, `\uFEFF${gasLines.join("\r\n")}\r\n`, "utf8");

  const combinedLines = [
    ["區分", "姓名", "登入Email", "密碼", "密碼來源", "訪員正式編碼", "角色", "狀態", "備註"]
      .map(esc)
      .join(","),
  ];
  for (const row of oldBody) {
    const email = String(row[oldIdx.Email] || "")
      .trim()
      .toLowerCase();
    combinedLines.push(
      [
        "舊帳（匯入時帳密）",
        row[oldIdx["姓名"]],
        row[oldIdx.Email],
        row[oldIdx["密碼"]],
        "2026-10-18 GAS匯入帳密表",
        row[oldIdx["訪員正式編碼"]],
        row[oldIdx["角色"]],
        gasEmails.has(email) ? "目前GAS仍有此Email" : "目前GAS查無此Email",
        row[oldIdx["備註"]],
      ]
        .map(esc)
        .join(","),
    );
  }
  for (const acc of sorted) {
    const known = passwordByEmail.get(acc.email);
    combinedLines.push(
      [
        "目前GAS",
        acc.name,
        acc.email,
        known?.password || "",
        known?.source || "無明文",
        acc.visitorId,
        acc.role,
        acc.status,
        known?.password ? "" : "無明文密碼記錄",
      ]
        .map(esc)
        .join(","),
    );
  }
  const combinedPath = resolve(OUT_DIR, `舊帳與目前GAS_訪查員帳密對照_${STAMP}.csv`);
  writeFileSync(combinedPath, `\uFEFF${combinedLines.join("\r\n")}\r\n`, "utf8");

  const readme = `舊帳與目前 GAS 訪查員帳密匯出
產生時間：${new Date().toISOString()}

檔案
1. 舊帳_訪查員GAS登入帳密_${STAMP}.csv
   - 2026-10-18 自 Supabase 匯入 GAS 時產生的明文密碼表（${oldBody.length} 筆）
   - 其中目前 GAS 已無對應 Email：${onlyInOld} 筆

2. 目前GAS_訪查員登入帳密_${STAMP}.csv
   - 即時查詢 GAS 註冊表／訪員主檔
   - 帳號數：${sorted.length}
   - 對得到明文密碼：${withPlain}
   - 無明文密碼：${noPassword}

3. 舊帳與目前GAS_訪查員帳密對照_${STAMP}.csv
   - 上述兩者合併對照

說明
- GAS 只保存密碼雜湊，無法從系統反推明文。
- 明文密碼來源為匯入時寫下的帳密表；若之後使用者自行重設，本表可能已過期。
- 請妥善保管，勿上傳公開倉庫。
`;
  const readmePath = resolve(OUT_DIR, `舊帳與目前GAS_訪查員帳密_${STAMP}_說明.txt`);
  writeFileSync(readmePath, readme, "utf8");

  console.log(
    JSON.stringify(
      {
        oldOutPath,
        gasOutPath,
        combinedPath,
        readmePath,
        oldCount: oldBody.length,
        gasCount: sorted.length,
        withPlain,
        noPassword,
        onlyInOld,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
