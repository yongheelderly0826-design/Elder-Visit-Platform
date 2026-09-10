#!/usr/bin/env node
/**
 * Complete Joe's assigned visit → audit approve → lock payment visibility.
 * Usage: node scripts/complete-joe-visit-payment.mjs
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
const EMAIL = "joe@elder.org";

if (!GAS_URL || !GAS_TOKEN) {
  console.error("Missing GAS_WEB_APP_URL / GAS_API_TOKEN");
  process.exit(1);
}

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
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "follow",
  });
  const json = await res.json();
  if (!json.ok) {
    const err = json.error || {};
    throw new Error(`${action} ${err.code || "ERR"}: ${err.message || "failed"}`);
  }
  return json.data;
}

function loadSampleAnswers() {
  // Minimal complete answers aligned with mohwLifeCareSampleAnswers (TS source of truth).
  return {
    visit_date: new Date().toISOString().slice(0, 10),
    visit_start_time: "09:30",
    visit_end_time: "10:30",
    visit_status: "已完成",
    visit_notes: "Joe訪員示範訪視",
    name: "蕭金芝",
    gender: "女",
    birth_date: "1950-01-01",
    national_id: "E110005487",
    phone: "02-29200000",
    mobile: "0912000000",
    line_id_status: "無",
    line_id: "",
    emergency_contact_name: "蕭美玲",
    emergency_contact_relation: "子女",
    emergency_contact_phone: "0912222333",
    household_city: "新北市",
    household_district: "永和區",
    household_village: "民族里",
    household_address: "民有街67巷7號四樓",
    living_address_type: "與戶籍地址相同",
    housing_type: "透天厝",
    living_status: "獨居",
    cohabitation_status: "獨居",
    education: "小學",
    marital_status: "喪偶",
    has_children: "存",
    sons_count: "1",
    daughters_count: "1",
    children_same_city: "是",
    health_self_rating: "普通",
    height_cm: "155",
    weight_kg: "52",
    weight_change_3m: "無明顯變化",
    appetite_3m: "普通",
    chronic_diseases: ["高血壓"],
    medication_regular: "是",
    fall_history_1y: "否",
    adl_score: "獨立",
    iadl_score: "部分依賴",
    cognitive_status: "清楚",
    mood_status: "穩定",
    social_activity: "偶爾",
    economic_status: "普通",
    welfare_status: "無",
    service_needs: ["關懷訪視"],
    referral_needed: "否",
    consent_personal_data: "同意",
    consent_health_db: "同意",
    consent_signature: "是",
    social_worker_role: "社工",
    social_worker_name: "Joe訪員",
    social_worker_national_id: "E123456783",
    social_worker_phone: "0912000888",
    social_worker_date: new Date().toISOString().slice(0, 10),
  };
}

async function main() {
  const linksPath = path.join(root, "lib/domain/demo-visitor-links.json");
  const links = JSON.parse(fs.readFileSync(linksPath, "utf8"));
  const joe = links[EMAIL];
  if (!joe?.assignmentId || !joe?.visitorId || !joe?.caseId) {
    throw new Error("demo-visitor-links.json missing Joe assignment; run bootstrap-joe-visitor.mjs first");
  }

  const caseRow = await gas("cases.get", { params: { id: joe.caseId } });
  const encodedId = caseRow.encoded_id || caseRow.external_id || joe.caseId;
  const answers = {
    ...loadSampleAnswers(),
    name: caseRow.name || "蕭金芝",
    national_id: caseRow.id_number || "E110005487",
    household_district: caseRow.household_district || "永和區",
    household_village: caseRow.household_village || "民族里",
    household_address: caseRow.address || "",
  };

  let submitResult = null;
  let submitError = null;
  try {
    submitResult = await gas("careform.submit", {
      body: {
        assignment_id: joe.assignmentId,
        visitor_id: joe.visitorId,
        encoded_id: encodedId,
        visit_result: "完成訪視",
        completion_pct: 100,
        answers,
        consent_signed: true,
        photos: [],
      },
    });
  } catch (error) {
    submitError = String(error.message || error);
    // If already submitted, continue to audit/payment seeding.
  }

  const pending = await gas("audit.queue", { params: { decision: "pending" } });
  const approved = await gas("audit.queue", { params: { decision: "通過" } });
  const minePending = (pending || []).filter((row) => String(row.visitor_id) === joe.visitorId);
  const mineApproved = (approved || []).filter((row) => String(row.visitor_id) === joe.visitorId);

  let audit = mineApproved[0] || null;
  if (!audit && minePending[0]) {
    audit = await gas("audit.decide", {
      body: {
        audit_id: minePending[0].audit_id,
        decision: "通過",
        reason: "Joe示範訪視核准",
        reviewer: "系統示範",
      },
    });
  }

  const now = new Date().toISOString();
  const paymentItem = {
    id: `pay_${joe.assignmentId}`,
    caseId: joe.caseId,
    caseName: caseRow.name || "蕭金芝",
    assignmentId: joe.assignmentId,
    visitResult: "完成訪視",
    auditDecision: "通過",
    status: "locked",
    visitFee: 180,
    dataProcessingFee: 30,
    totalFee: 210,
    lockedAt: now,
    updatedAt: now,
  };

  const paymentsPath = path.join(root, "lib/domain/demo-visitor-payments.json");
  const payments = fs.existsSync(paymentsPath)
    ? JSON.parse(fs.readFileSync(paymentsPath, "utf8"))
    : {};
  payments[EMAIL] = [paymentItem];
  fs.writeFileSync(paymentsPath, JSON.stringify(payments, null, 2) + "\n");

  console.log(
    JSON.stringify(
      {
        ok: true,
        email: EMAIL,
        visitor_id: joe.visitorId,
        assignment_id: joe.assignmentId,
        case_id: joe.caseId,
        case_name: caseRow.name,
        submit: submitResult ? "ok" : "skipped",
        submit_error: submitError,
        audit_id: audit?.audit_id || audit?.auditId || null,
        payment: paymentItem,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }, null, 2));
  process.exit(1);
});
