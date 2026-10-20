/**
 * 把 Supabase 匯出的訪員名冊寫入 GAS。
 * 同一 Email 只建立一筆有效帳號（GAS 不允許重複有效申請）。
 * 密碼寫到下載資料夾，不印出個資。
 */
import { createHash, randomBytes, scrypt as nodeScrypt } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const EXPORT_DIR = resolve(
  process.env.HOME || "",
  "Downloads/supabase-訪員完整匯出-20261018",
);
const STATE_PATH = resolve(EXPORT_DIR, "gas-import-state.json");
const ACCOUNT_PATH = resolve(EXPORT_DIR, "GAS登入帳密.csv");

const PARAMS = { algorithm: "scrypt", keyLength: 64, N: 16384, r: 8, p: 1 };

function loadEnv() {
  const env = {};
  for (const line of readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    env[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function derive(password, salt) {
  return new Promise((resolvePromise, reject) => {
    nodeScrypt(password, salt, PARAMS.keyLength, { N: PARAMS.N, r: PARAMS.r, p: PARAMS.p, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolvePromise(key);
    });
  });
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const hash = await derive(password, salt);
  return {
    password_hash: hash.toString("base64url"),
    password_salt: salt,
    password_params: JSON.stringify(PARAMS),
  };
}

function newPassword() {
  return randomBytes(9).toString("base64url");
}

const env = loadEnv();
const gasUrl = env.GAS_WEB_APP_URL;
const gasToken = env.GAS_API_TOKEN;
const workspaceId = env.GAS_WORKSPACE_ID || "WS-YH-115";

async function gas(action, { method = "GET", params = {}, body = null } = {}) {
  const url = new URL(gasUrl);
  url.searchParams.set("action", action);
  url.searchParams.set("token", gasToken);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  const init = { method, redirect: "follow", headers: { Authorization: `Bearer ${gasToken}` } };
  if (body) {
    init.method = "POST";
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, init);
      const text = await response.text();
      const trimmed = text.trim();
      if (!trimmed || trimmed.startsWith("<")) {
        lastError = new Error(`GAS_NON_JSON ${action}`);
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      const json = JSON.parse(trimmed);
      if (!json.ok) {
        const message = json.error?.message || action;
        const code = json.error?.code || "GAS_ERROR";
        const error = new Error(`${code}: ${message}`);
        error.code = code;
        throw error;
      }
      return json.data;
    } catch (error) {
      if (error.code) throw error;
      lastError = error;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastError;
}

function workerGroup(label) {
  if (String(label).includes("社政")) return "social_affairs";
  return "civil_affairs";
}

function statusFor(label) {
  if (label === "已通過") return "approved";
  if (label === "已退回") return "rejected";
  if (label === "待承辦審核") return "pending_supervisor_review";
  if (label === "待社會局覆核") return "pending_social_bureau_review";
  return "pending_workspace_review";
}

function requestIdFor(email) {
  return `imp-${createHash("sha256").update(email).digest("hex").slice(0, 20)}`;
}

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
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((item) => item.some((value) => value !== ""));
  return body.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""])));
}

function loadRows() {
  return parseCsv(readFileSync(resolve(EXPORT_DIR, "註冊申請完整名冊.csv"), "utf8"));
}

function score(row, photos) {
  const code = (row["訪員正式編碼"] || "").trim();
  return (code ? 2 : 0) + (photos.has(code) ? 1 : 0) + (row["審核狀態"] === "已通過" ? 4 : 0);
}

function photoPath(code) {
  return resolve(EXPORT_DIR, "證件照", `${code}_證件照.jpg`);
}

function dataUrl(filePath) {
  if (!existsSync(filePath)) return "";
  const bytes = readFileSync(filePath);
  if (bytes.length < 100 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return "";
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

function profileFrom(row, headshot) {
  const code = (row["訪員正式編碼"] || "").trim();
  return {
    rootUnitName: row["單位"] || "永和區公所",
    departmentName: row["科室"] || "",
    jobTitle: row["職稱"] || "",
    displayName: row["顯示名稱"] || row["姓名"],
    gender: row["性別"] || "",
    nationalId: row["身分證字號"] || "",
    workerGroup: workerGroup(row["類別"]),
    officialEmail: row["公務信箱"] || row["信箱"],
    phone: row["手機"] || "",
    trainingCompleted: row["教育訓練"] === "已完成",
    trainingCompletedAt: row["教育訓練日期"] || null,
    visitorCertificateNo: row["訪員證號"] || "",
    headshotProcessedUrl: headshot,
    visitorCode: code,
    registrationCode: row["註冊申請編號"] || "",
    socialBureauReviewStatus: row["審核狀態"] === "已通過" ? "approved" : "not_sent",
    profileCompletionStatus: row["資料補完狀態"] === "已確認可派案" ? "verified" : "submitted",
    qrCodePayload: row["QRCode"] || "",
    bankName: row["銀行名稱"] || "",
    bankCode: row["銀行代碼"] || "",
    bankBranchName: row["分行名稱"] || "",
    bankAccountName: row["戶名"] || "",
    bankAccountLast5: row["帳號末五碼"] || "",
    authInviteStatus: "activated",
  };
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function writeAccounts(records) {
  const header = ["角色", "姓名", "Email", "密碼", "訪員正式編碼", "有證件照", "備註"];
  const lines = [header.join(",")];
  for (const record of records) {
    lines.push(
      [record.role, record.name, record.email, record.password, record.visitorId, record.hasPhoto ? "是" : "否", record.note]
        .map(csvEscape)
        .join(","),
    );
  }
  writeFileSync(ACCOUNT_PATH, `\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
}

async function main() {
  const rows = loadRows();
  const photoCodes = new Set();
  for (const name of readdirSync(resolve(EXPORT_DIR, "證件照"))) {
    if (name.endsWith("_證件照.jpg")) photoCodes.add(name.slice(0, -"_證件照.jpg".length));
  }

  const groups = new Map();
  for (const row of rows) {
    const email = String(row["信箱"] || "").trim().toLowerCase();
    if (!email) continue;
    if (!groups.has(email)) groups.set(email, []);
    groups.get(email).push(row);
  }

  const state = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : { records: {} };
  const records = state.records;

  let index = 0;
  for (const [email, group] of groups) {
    index += 1;
    if (records[email]?.done) continue;
    const names = new Set(group.map((row) => (row["姓名"] || "").trim()).filter(Boolean));
    const best = [...group].sort((a, b) => score(b, photoCodes) - score(a, photoCodes))[0];
    const approved = best["審核狀態"] === "已通過";
    const code = (best["訪員正式編碼"] || "").trim();
    const note = [
      group.length > 1 ? `同一信箱有 ${group.length} 筆申請，已採用一筆` : "",
      names.size > 1 ? "同一信箱有不同姓名" : "",
    ].filter(Boolean).join("；");
    const requestId = requestIdFor(email);
    const headshot = approved ? dataUrl(photoPath(code)) : "";

    try {
      let registration = null;
      try {
        registration = await gas("registrations.get", { params: { request_id: requestId } });
      } catch (error) {
        if (error.code !== "NOT_FOUND") throw error;
      }

      if (!registration) {
        registration = await gas("registrations.create", {
          body: {
            request_id: requestId,
            email,
            full_name: best["姓名"],
            requested_unit_name: best["單位"] || "永和區公所",
            requested_workspace_id: workspaceId,
            requested_workspace_name: "永和區",
            requested_role_key: "visitor",
            status: approved ? "pending_social_bureau_review" : statusFor(best["審核狀態"]),
            review_note: "由 Supabase 訪員名冊匯入",
            submitted_at: best["送出時間"] || new Date().toISOString(),
            profile: profileFrom(best, headshot),
          },
        });
      }

      let visitorId = registration.visitor_id || code;
      if (approved && registration.status !== "approved") {
        const reviewed = await gas("registrations.review", {
          body: {
            request_id: requestId,
            decision: "approve",
            role_key: "visitor",
            workspace_id: workspaceId,
            note: "Supabase 已通過名冊匯入後核准",
          },
        });
        visitorId = reviewed.registration?.visitor_id || visitorId;
      } else if (approved) {
        visitorId = registration.visitor_id || visitorId;
      }

      let password = records[email]?.password || "";
      if (approved) {
        if (!password) password = newPassword();
        const hashed = await hashPassword(password);
        const account = await gas("accounts.upsertAuth", {
          body: {
            email,
            visitor_id: visitorId,
            full_name: best["姓名"],
            role_key: "visitor",
            ...hashed,
          },
        });
        visitorId = account.visitor_id || visitorId;
      }

      records[email] = {
        done: true,
        role: "訪員",
        name: best["姓名"],
        email,
        password,
        visitorId,
        hasPhoto: Boolean(headshot),
        note,
        approved,
      };
      if (index % 10 === 0) {
        writeFileSync(STATE_PATH, JSON.stringify(state));
        console.log(`progress ${index}/${groups.size}`);
      }
    } catch (error) {
      records[email] = {
        done: false,
        role: "訪員",
        name: best["姓名"],
        email,
        password: records[email]?.password || "",
        visitorId: code,
        hasPhoto: Boolean(headshot),
        note: `${note}${note ? "；" : ""}匯入失敗：${error.message || error}`,
        approved,
      };
      writeFileSync(STATE_PATH, JSON.stringify(state));
      console.log(`failed ${index}/${groups.size} ${error.code || ""} ${String(error.message || error).slice(0, 80)}`);
    }
  }

  const adminEmail = "volunteer-admin@eldervisit.org";
  if (!records[adminEmail]?.done) {
    const adminPassword = records[adminEmail]?.password || newPassword();
    const adminRequestId = requestIdFor(adminEmail);
    let registration = null;
    try {
      registration = await gas("registrations.get", { params: { request_id: adminRequestId } });
    } catch (error) {
      if (error.code !== "NOT_FOUND") throw error;
    }
    if (!registration) {
      registration = await gas("registrations.create", {
        body: {
          request_id: adminRequestId,
          email: adminEmail,
          full_name: "志工管理員",
          requested_unit_name: "永和區公所",
          requested_workspace_id: workspaceId,
          requested_workspace_name: "永和區",
          requested_role_key: "workspace_manager",
          status: "pending_social_bureau_review",
          review_note: "志工管理員帳號",
          submitted_at: new Date().toISOString(),
          profile: {
            displayName: "志工管理員",
            rootUnitName: "永和區公所",
            workerGroup: "civil_affairs",
            officialEmail: adminEmail,
          },
        },
      });
    }
    let visitorId = registration.visitor_id || "";
    if (registration.status !== "approved") {
      const reviewed = await gas("registrations.review", {
        body: {
          request_id: adminRequestId,
          decision: "approve",
          role_key: "workspace_manager",
          workspace_id: workspaceId,
          note: "建立志工管理員",
        },
      });
      visitorId = reviewed.registration?.visitor_id || visitorId;
    }
    const hashed = await hashPassword(adminPassword);
    const account = await gas("accounts.upsertAuth", {
      body: {
        email: adminEmail,
        visitor_id: visitorId,
        full_name: "志工管理員",
        role_key: "workspace_manager",
        ...hashed,
      },
    });
    records[adminEmail] = {
      done: true,
      role: "志工管理員",
      name: "志工管理員",
      email: adminEmail,
      password: adminPassword,
      visitorId: account.visitor_id || visitorId,
      hasPhoto: false,
      note: "管理系統帳號，登入 /login",
      approved: true,
    };
  }

  writeFileSync(STATE_PATH, JSON.stringify(state));
  writeAccounts(Object.values(records));
  const done = Object.values(records).filter((record) => record.done && record.role === "訪員");
  const failed = Object.values(records).filter((record) => !record.done);
  console.log(JSON.stringify({
    emails: groups.size,
    imported: done.length,
    withPassword: done.filter((record) => record.password).length,
    withPhoto: done.filter((record) => record.hasPhoto).length,
    failed: failed.length,
    admin: Boolean(records[adminEmail]?.done),
  }));
}

main().catch((error) => {
  console.error(String(error && error.stack || error).slice(0, 500));
  process.exit(1);
});
