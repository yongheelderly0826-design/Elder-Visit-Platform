/**
 * 用與網站相同的登入 API，逐一登入訪員，確認訪員證頁與證件照。
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const EXPORT_DIR = resolve(process.env.HOME || "", "Downloads/supabase-訪員完整匯出-20261018");
const ACCOUNT_PATH = resolve(EXPORT_DIR, "GAS登入帳密.csv");
const REPORT_PATH = resolve(EXPORT_DIR, "GAS匯入檢查報表.csv");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";

function parseCsv(text) {
  const source = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((item) => item.some((value) => value !== ""));
  return body.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""])));
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function cookieHeader(response) {
  const list = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [];
  return list.map((item) => item.split(";")[0]).filter(Boolean).join("; ");
}

async function login(email, password, visitorOnly) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, ...(visitorOnly ? { visitorOnly: true } : {}) }),
  });
  const json = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    mode: json.data?.mode || "",
    roleKey: json.data?.roleKey || "",
    nextPath: json.data?.nextPath || "",
    cookie: cookieHeader(response),
    message: json.error?.message || "",
  };
}

async function main() {
  const accounts = parseCsv(readFileSync(ACCOUNT_PATH, "utf8"));
  const results = [];
  let index = 0;
  for (const account of accounts) {
    index += 1;
    const isAdmin = account["角色"] === "志工管理員";
    const session = await login(account["Email"], account["密碼"], !isAdmin);
    const result = {
      角色: account["角色"],
      姓名: account["姓名"],
      Email: account["Email"],
      密碼: account["密碼"],
      訪員正式編碼: account["訪員正式編碼"],
      登入: session.ok ? "成功" : "失敗",
      登入模式: session.mode,
      登入後頁面: session.nextPath,
      訪員證頁面: "",
      證件照: "",
      證件照相符: "",
      備註: [account["備註"], session.message].filter(Boolean).join("；"),
    };

    if (!isAdmin && session.ok) {
      const home = await fetch(`${BASE}/visitor/home`, { headers: { cookie: session.cookie }, redirect: "manual" });
      const html = await home.text();
      const showsBadge = home.status === 200 && html.includes("/api/visitor/headshot") && html.includes("我的訪員證");
      result["訪員證頁面"] = showsBadge ? "有訪員證" : `沒有訪員證(${home.status})`;
      const photo = await fetch(`${BASE}/api/visitor/headshot`, { headers: { cookie: session.cookie } });
      if (photo.status === 200) {
        const bytes = Buffer.from(await photo.arrayBuffer());
        const file = resolve(EXPORT_DIR, "證件照", `${account["訪員正式編碼"]}_證件照.jpg`);
        result["證件照"] = "看得到";
        if (existsSync(file)) {
          const source = readFileSync(file);
          result["證件照相符"] = createHash("sha256").update(bytes).digest("hex") === createHash("sha256").update(source).digest("hex")
            ? "與匯入原檔相同"
            : "與匯入原檔不同";
        } else {
          result["證件照相符"] = "沒有原檔可比對";
        }
      } else if (account["有證件照"] !== "是") {
        result["證件照"] = "原本沒有證件照";
        result["證件照相符"] = "不適用";
      } else {
        result["證件照"] = `看不到(${photo.status})`;
        result["證件照相符"] = "失敗";
      }
    } else if (isAdmin && session.ok) {
      const users = await fetch(`${BASE}/api/users`, { headers: { cookie: session.cookie } });
      const json = await users.json().catch(() => ({}));
      const count = Array.isArray(json.data?.registrationRequests) ? json.data.registrationRequests.length : 0;
      result["訪員證頁面"] = "管理員不使用訪員證";
      result["證件照"] = "不適用";
      result["證件照相符"] = users.ok ? `可查閱名冊 ${count} 筆` : `名冊讀取失敗(${users.status})`;
    }

    results.push(result);
    if (index % 20 === 0) console.log(`checked ${index}/${accounts.length}`);
  }

  const header = Object.keys(results[0] || { 結果: "" });
  const lines = [header.join(",")];
  for (const result of results) lines.push(header.map((key) => csvEscape(result[key])).join(","));
  writeFileSync(REPORT_PATH, `\uFEFF${lines.join("\r\n")}\r\n`, "utf8");

  const visitors = results.filter((result) => result["角色"] === "訪員");
  console.log(JSON.stringify({
    total: results.length,
    loginOk: results.filter((result) => result["登入"] === "成功").length,
    badgeOk: visitors.filter((result) => result["訪員證頁面"] === "有訪員證").length,
    photoOk: visitors.filter((result) => result["證件照"] === "看得到").length,
    photoMatch: visitors.filter((result) => result["證件照相符"] === "與匯入原檔相同").length,
    photoMissingExpected: visitors.filter((result) => result["證件照"] === "原本沒有證件照").length,
    loginFail: results.filter((result) => result["登入"] === "失敗").length,
  }));
}

main().catch((error) => {
  console.error(String(error && error.stack || error).slice(0, 500));
  process.exit(1);
});
