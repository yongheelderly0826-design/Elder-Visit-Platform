#!/usr/bin/env node
/**
 * E2E: 送出關懷表 → 稽核佇列 → 核准 → 匯出候選（只顯示稽核通過）
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

if (!GAS_URL || !GAS_TOKEN) {
  console.error("Missing GAS env");
  process.exit(1);
}

async function gas(action, { params = {}, body } = {}) {
  const url = new URL(GAS_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("token", GAS_TOKEN);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  if (body && Object.keys(body).length) {
    url.searchParams.set("body", JSON.stringify(body));
  }

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${GAS_TOKEN}` },
    redirect: "follow",
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${action} non-JSON ${res.status}: ${text.slice(0, 180)}`);
  }
  if (!json.ok) {
    const err = json.error || {};
    const extra = err.errorLines?.length ? `\n${err.errorLines.slice(0, 8).join("\n")}` : "";
    throw new Error(`${action} ${err.code || "ERR"}: ${err.message || "failed"}${extra}`);
  }
  return json.data;
}

function answersFor(caseRow) {
  return {
    visit_date: "115/05/22",
    visit_start_time: "09:30",
    visit_end_time: "10:30",
    visit_status: "已完成",
    visit_notes: "端到端驗證：送出→稽核→匯出",
    name: caseRow.name || "王秀",
    gender: caseRow.gender || "女",
    birth_date: "031/03/18",
    national_id: "A123456789",
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
    social_worker_name: "張社工",
    social_worker_national_id: "B223456782",
    social_worker_phone: "0933445566",
    social_worker_date: "115/05/13",
  };
}

const out = {};

try {
  const visitors = (await gas("visitors.list")) || [];
  let visitor = visitors.find((v) => v.status === "已核准") || visitors[0];
  if (!visitor) {
    visitor = await gas("visitors.create", {
      body: {
        name: "驗證訪員",
        id_number: "B223456782",
        phone: "0911111111",
        service_areas: "永和區",
      },
    });
    visitor = await gas("visitors.approve", { body: { visitor_id: visitor.visitor_id } });
  } else if (visitor.status !== "已核准") {
    visitor = await gas("visitors.approve", { body: { visitor_id: visitor.visitor_id } });
  }
  out.visitor_id = visitor.visitor_id;
  out.visitor_name = visitor.name;

  const cases = (await gas("cases.list", { params: { district: "永和區" } })) || [];
  const assignments = (await gas("assignments.list")) || [];
  const active = assignments.filter((a) => ["待接案", "進行中", "空訪續訪"].includes(String(a.status)));
  const reuse =
    active.find((a) => String(a.assignment_id) === "ASG-81036853") ||
    active.find((a) => String(a.case_id) === "CASE-YH-ef6e3eda");
  let caseRow;
  let assignment;
  if (reuse) {
    caseRow = cases.find((c) => String(c.case_id) === String(reuse.case_id));
    assignment = reuse;
  } else {
    const activeCaseIds = new Set(active.map((a) => String(a.case_id)));
    caseRow =
      cases.find(
        (c) =>
          !activeCaseIds.has(String(c.case_id)) &&
          (c.visit_status === "待訪" || c.visit_status === "待派案" || !c.visit_status),
      ) || cases.find((c) => !activeCaseIds.has(String(c.case_id)));
    if (!caseRow) throw new Error("沒有可用個案");
    assignment = await gas("assignments.dispatch", {
      body: {
        case_id: caseRow.case_id,
        visitor_id: visitor.visitor_id,
        notes: "端到端驗證派案",
        auto_confirm: true,
      },
    });
  }
  if (!caseRow) throw new Error("找不到派案對應個案");
  out.case_id = caseRow.case_id;
  out.case_name = caseRow.name;
  out.encoded_id = caseRow.encoded_id;
  out.external_id = caseRow.external_id;
  out.assignment_id = assignment.assignment_id;

  const answers = answersFor(caseRow);
  const validated = await gas("careform.validate", { body: { answers, row: 2 } });
  out.validate_ok = validated.ok;
  if (!validated.ok) {
    out.validate_errors = (validated.errorLines || []).slice(0, 12);
    throw new Error("送出前驗證失敗");
  }

  const submitted = await gas("careform.submit", {
    body: {
      assignment_id: assignment.assignment_id,
      visitor_id: visitor.visitor_id,
      encoded_id: caseRow.encoded_id,
      visit_result: "訪視成功",
      completion_pct: 100,
      answers,
      consent_signed: true,
    },
  });
  out.careform_id = submitted.careform?.careform_id;
  out.careform_status = submitted.careform?.status;

  const queue = (await gas("audit.queue", { params: { decision: "pending" } })) || [];
  const queued = queue.find((item) => item.careform_id === out.careform_id) || queue[0];
  out.queue_total = queue.length;
  out.queue_hit = Boolean(queued && queued.careform_id === out.careform_id);
  out.audit_id = queued?.audit_id;
  out.queue_name = queued?.name;
  out.queue_validation_ok = queued?.validation_ok;

  if (!out.queue_hit) throw new Error("稽核佇列沒有剛送出的案件");

  const decided = await gas("audit.decide", {
    body: {
      audit_id: out.audit_id,
      decision: "通過",
      reason: "端到端驗證核准",
    },
  });
  out.decide_decision = decided.decision;
  out.decide_careform_status = decided.careform_status;

  const candidates = await gas("export.listCandidates", {
    params: { district: "永和區", only_audited: "true" },
  });
  const found = (candidates.items || []).find((item) => String(item.case_id) === String(out.case_id));
  out.export_total = candidates.total;
  out.export_ready_count = candidates.ready_count;
  out.export_hit = Boolean(found);
  out.export_ready = found?.export_ready;
  out.export_audit = found?.audit_decision;
  out.export_status = found?.careform_status;

  out.ok = out.queue_hit && out.decide_decision === "通過" && out.export_hit === true;
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 2);
} catch (error) {
  out.error = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}
