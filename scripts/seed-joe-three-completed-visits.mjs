#!/usr/bin/env node
/**
 * 將 Joe 現有 3 筆派案：補齊衛福部關懷表 → 稽核通過 → 派案已完成 → 核銷鎖定（示範）
 * Usage: node scripts/seed-joe-three-completed-visits.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const JOE = {
  email: "joe@elder.org",
  visitorId: "V-YH-834059",
  name: "Joe訪員",
};
/** 若為空陣列，自動找出 Joe 所有進行中派案並結案 */
const TARGET_ASSIGNMENTS = [];

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

async function gas(action, { params = {}, body } = {}) {
  const url = new URL(GAS_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("token", GAS_TOKEN);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
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
    const extra = err.errorLines?.length ? `\n${err.errorLines.slice(0, 10).join("\n")}` : "";
    throw new Error(`${action} ${err.code || "ERR"}: ${err.message || "failed"}${extra}`);
  }
  return json.data;
}

function answersFor(caseRow) {
  return {
    visit_date: "115/09/21",
    visit_start_time: "09:30",
    visit_end_time: "10:30",
    visit_status: "已完成",
    visit_notes: `Joe 完成訪視示範 ${caseRow.external_id || caseRow.case_id}`,
    name: caseRow.name || "個案",
    gender: caseRow.gender || "女",
    birth_date: "031/03/18",
    national_id: caseRow.id_number || "A123456789",
    phone: caseRow.primary_phone || "0222220001",
    mobile: caseRow.secondary_phone || "0912345678",
    line_id_status: "無",
    emergency_contact_name: "陳美玲",
    emergency_contact_relation: "子女",
    emergency_contact_phone: "0912222333",
    household_city: "新北市",
    household_district: caseRow.household_district || caseRow.visit_district || "永和區",
    household_village: caseRow.household_village || caseRow.visit_village || "豫溪里",
    household_address: caseRow.address || "中山路一段 1 號",
    living_address_type: "與戶籍地址相同",
    housing_type: "電梯大樓",
    living_status: "與他人同住",
    cohabitation_status: "同住者有照顧能力",
    cohabitant_relation: "兒子",
    cohabitant_age: "45",
    education: "小學",
    marital_status: "有配偶或同居",
    has_children: "存",
    sons_count: "1",
    daughters_count: "1",
    children_same_city: "是",
    health_self_rating: "還算好",
    height_cm: "165",
    weight_kg: "60",
    weight_change_3m: "無改變",
    appetite_3m: "無變化",
    diseases: "高血壓;糖尿病",
    recent_medical_event: "否",
    hearing_issue: "否",
    vision_issue: "否",
    family_interaction: "每周1次",
    neighbor_interaction: "每天",
    life_difficulties_flag: "有",
    life_difficulties: "租屋困難;最近記憶力不好",
    worries_flag: "有",
    worries: "自己受傷或疾病",
    help_sources_flag: "有",
    help_sources_has: "家人",
    information_channels: "電視;親友或鄰里",
    past_activities: "參與宗教活動",
    desired_activities: "健身運動",
    home_safety_feeling: "大致安全",
    loneliness_2w: "完全沒有",
    depressed_2w: "完全沒有",
    loss_interest_2w: "完全沒有",
    service_willingness_flag: "有",
    service_willingness: "關懷服務;送餐服務",
    mental_status: "無特殊情形",
    self_care_flag: "可以",
    home_hygiene_issues: "以上均無",
    home_safety_issues: "照明設備不足(如夜起時)",
    consent_personal_data: "同意",
    consent_health_db: "同意",
    consent_signature: "是",
    social_worker_role: "社工",
    social_worker_name: JOE.name,
    social_worker_national_id: "E123456783",
    social_worker_phone: "0912000888",
    social_worker_date: "115/09/21",
  };
}

const paymentPath = path.join(root, "lib/domain/demo-visitor-payments.json");
const payments = JSON.parse(fs.readFileSync(paymentPath, "utf8"));
const lockedItems = [...(payments[JOE.email] || [])];
const now = new Date().toISOString();

let targets = TARGET_ASSIGNMENTS;
if (!targets.length) {
  const active = ((await gas("assignments.list", { params: { active_only: "true" } })) || []).filter(
    (row) => String(row.visitor_id) === JOE.visitorId,
  );
  targets = active.map((row) => row.assignment_id);
  console.log("Auto targets (active):", targets.join(", ") || "(none)");
}

for (const assignmentId of targets) {
  const assignment = await gas("assignments.get", { params: { assignment_id: assignmentId } });
  if (!assignment?.assignment_id) throw new Error(`找不到派案 ${assignmentId}`);

  const caseRow = await gas("cases.get", { params: { id: assignment.case_id } });
  if (!caseRow?.case_id) throw new Error(`找不到個案 ${assignment.case_id}`);

  const answers = answersFor(caseRow);
  const validated = await gas("careform.validate", { body: { answers, row: 2 } });
  if (!validated.ok) {
    throw new Error(
      `${assignmentId} 驗證失敗：${(validated.errorLines || []).slice(0, 8).join("；")}`,
    );
  }

  let careformId = "";
  try {
    const submitted = await gas("careform.submit", {
      body: {
        assignment_id: assignmentId,
        visitor_id: JOE.visitorId,
        encoded_id: caseRow.encoded_id || assignment.encoded_id || caseRow.case_id,
        case_id: caseRow.case_id,
        visit_result: "訪視成功",
        completion_pct: 100,
        answers,
        consent_signed: true,
        photos: ["完成訪視：現場佐證.jpg"],
        notes: "示範完成訪視，可供衛福部匯出",
      },
    });
    careformId = submitted?.careform?.careform_id || submitted?.careform_id || "";
    console.log(assignmentId, "submit", careformId || "ok");
  } catch (error) {
    // 若已送過，改找既有關懷表繼續稽核
    console.warn(assignmentId, "submit skip:", error.message);
    const existing = await gas("careform.get", { params: { assignment_id: assignmentId } });
    careformId = existing?.careform_id || "";
    if (!careformId) throw error;
  }

  const queue = (await gas("audit.queue", { params: { decision: "all" } })) || [];
  let audit =
    queue.find((row) => String(row.careform_id) === String(careformId) && !row.decision) ||
    queue.find((row) => String(row.assignment_id) === assignmentId && !row.decision) ||
    queue.find((row) => String(row.careform_id) === String(careformId));

  if (audit && String(audit.decision || "") !== "通過") {
    await gas("audit.decide", {
      body: {
        audit_id: audit.audit_id,
        decision: "通過",
        reason: "示範核准：衛福部欄位已齊，可匯出／核銷",
        reviewer: "系統示範",
      },
    });
    console.log(assignmentId, "audit 通過", audit.audit_id);
  } else if (audit) {
    console.log(assignmentId, "audit 已通過", audit.audit_id);
  } else {
    console.warn(assignmentId, "找不到稽核佇列，改強制結案派案");
  }

  await gas("assignments.confirm", {
    body: { assignment_id: assignmentId, status: "已完成" },
  });
  console.log(assignmentId, "assignment 已完成");

  if (!lockedItems.some((item) => item.assignmentId === assignmentId)) {
    lockedItems.push({
      id: `pay_${assignmentId}`,
      caseId: caseRow.case_id,
      caseName: caseRow.name || "個案",
      assignmentId,
      visitResult: "訪視成功",
      auditDecision: "通過",
      status: "locked",
      visitFee: 180,
      dataProcessingFee: 30,
      totalFee: 210,
      lockedAt: now,
      updatedAt: now,
    });
  }
}

payments[JOE.email] = lockedItems;
fs.writeFileSync(paymentPath, `${JSON.stringify(payments, null, 2)}\n`, "utf8");
console.log("Wrote", paymentPath, "items", lockedItems.length);

const active = ((await gas("assignments.list", { params: { active_only: "true" } })) || []).filter(
  (row) => String(row.visitor_id) === JOE.visitorId,
);
const all = ((await gas("assignments.list")) || []).filter(
  (row) => String(row.visitor_id) === JOE.visitorId,
);
console.log(
  "Joe active tasks",
  active.length,
  "completed",
  all.filter((a) => a.status === "已完成").length,
);
