#!/usr/bin/env node
/**
 * 承辦管理頁驗收：2 筆派案 → 關懷表 → 稽核 → 匯出／核銷／訪員經費
 * Usage: node scripts/run-manager-read-cache-acceptance.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROD = "https://elder-visit-platform-ruby.vercel.app";
const JOE = {
  email: "joe@elder.org",
  password: "123456",
  visitorId: "V-YH-834059",
  name: "Joe訪員",
};
const MANAGER_EMAIL = "yongheelderly0826@gmail.com";
const TARGET_CASES = ["CASE-YH-43d2b7cb", "CASE-YH-c18cdb3e"];

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
  const started = Date.now();
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${GAS_TOKEN}` },
    redirect: "follow",
  });
  const text = await res.text();
  const ms = Date.now() - started;
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
  return { data: json.data, ms };
}

async function prod(pathname, { method = "GET", body, cookieJar } = {}) {
  const started = Date.now();
  const res = await fetch(`${PROD}${pathname}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookieJar ? { Cookie: cookieJar } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "follow",
  });
  const ms = Date.now() - started;
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json, ms, setCookie };
}

function mergeCookies(jar, setCookies) {
  const map = new Map(
    String(jar || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const i = part.indexOf("=");
        return [part.slice(0, i), part.slice(i + 1)];
      }),
  );
  for (const line of setCookies) {
    const main = line.split(";")[0];
    const i = main.indexOf("=");
    if (i > 0) map.set(main.slice(0, i), main.slice(i + 1));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function answersFor(caseRow) {
  return {
    visit_date: "115/05/22",
    visit_start_time: "09:30",
    visit_end_time: "10:30",
    visit_status: "已完成",
    visit_notes: `驗收 ${caseRow.external_id || caseRow.case_id} ${new Date().toISOString()}`,
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
    social_worker_date: "115/05/13",
  };
}

const report = {
  executed_at: new Date().toISOString(),
  environment: PROD,
  gas_url: GAS_URL,
  flows: [],
  timings: {},
  production: {},
  checks: {},
};

try {
  const assignmentsBefore = (await gas("assignments.list")).data || [];
  const activeCaseIds = new Set(
    assignmentsBefore
      .filter((a) => ["待接案", "進行中", "空訪續訪"].includes(String(a.status)))
      .map((a) => String(a.case_id)),
  );

  for (const caseId of TARGET_CASES) {
    const { data: caseRow } = await gas("cases.get", { params: { id: caseId } });
    if (!caseRow) throw new Error(`找不到個案 ${caseId}`);

    let assignment =
      assignmentsBefore.find(
        (a) =>
          String(a.case_id) === caseId &&
          String(a.visitor_id) === JOE.visitorId &&
          ["待接案", "進行中", "空訪續訪"].includes(String(a.status)),
      ) || null;

    if (!assignment) {
      if (activeCaseIds.has(caseId)) {
        throw new Error(`${caseRow.external_id} 已有其他訪員派案，無法重派給 Joe`);
      }
      const dispatched = await gas("assignments.dispatch", {
        body: {
          case_id: caseId,
          visitor_id: JOE.visitorId,
          notes: `驗收派案 ${caseRow.external_id}`,
          auto_confirm: true,
        },
      });
      assignment = dispatched.data;
      activeCaseIds.add(caseId);
    }

    const answers = answersFor(caseRow);
    const validated = (await gas("careform.validate", { body: { answers, row: 2 } })).data;
    if (!validated.ok) {
      throw new Error(`${caseRow.external_id} 驗證失敗：${(validated.errorLines || []).join("；")}`);
    }

    let submitted;
    try {
      submitted = (
        await gas("careform.submit", {
          body: {
            assignment_id: assignment.assignment_id,
            visitor_id: JOE.visitorId,
            encoded_id: caseRow.encoded_id,
            visit_result: "訪視成功",
            completion_pct: 100,
            answers,
            consent_signed: true,
          },
        })
      ).data;
    } catch (error) {
      report.flows.push({
        case_id: caseId,
        external_id: caseRow.external_id,
        name: caseRow.name,
        assignment_id: assignment.assignment_id,
        submit: "skipped",
        submit_error: String(error.message || error),
      });
      continue;
    }

    const queue = (await gas("audit.queue", { params: { decision: "pending" } })).data || [];
    const queued = queue.find((item) => item.careform_id === submitted.careform?.careform_id);
    if (!queued) throw new Error(`${caseRow.external_id} 未進入稽核佇列`);

    const decided = (
      await gas("audit.decide", {
        body: {
          audit_id: queued.audit_id,
          decision: "通過",
          reason: `驗收核准 ${caseRow.external_id}`,
          reviewer: "驗收腳本",
        },
      })
    ).data;

    report.flows.push({
      case_id: caseId,
      external_id: caseRow.external_id,
      name: caseRow.name,
      assignment_id: assignment.assignment_id,
      careform_id: submitted.careform?.careform_id,
      audit_id: queued.audit_id,
      submit: "ok",
      audit_decision: decided.decision,
      careform_status: decided.careform_status,
    });
  }

  const bundleCold = await gas("export.managerBundle", { params: { only_audited: "true" } });
  const bundleWarm = await gas("export.managerBundle", { params: { only_audited: "true" } });
  const auditCold = await gas("audit.queue", { params: { decision: "pending" } });
  const auditWarm = await gas("audit.queue", { params: { decision: "pending" } });

  report.timings.gas = {
    manager_bundle_cold_s: Math.round(bundleCold.ms) / 1000,
    manager_bundle_warm_s: Math.round(bundleWarm.ms) / 1000,
    audit_queue_cold_s: Math.round(auditCold.ms) / 1000,
    audit_queue_warm_s: Math.round(auditWarm.ms) / 1000,
  };

  const bundle = bundleWarm.data;
  const joeNames = report.flows.map((f) => f.name);
  report.checks.export_candidates_total = bundle?.candidates?.total ?? 0;
  report.checks.export_payments_count = bundle?.payments?.item_count ?? 0;
  report.checks.export_payments_amount = bundle?.payments?.total_amount ?? 0;
  report.checks.new_cases_in_export = joeNames.map((name) => ({
    name,
    found: (bundle?.candidates?.items || []).some((item) => String(item.name) === name),
  }));

  const auditAll = (await gas("audit.queue", { params: { decision: "all" } })).data || [];
  const joeRows = auditAll.filter(
    (row) =>
      String(row.visitor_id) === JOE.visitorId &&
      (String(row.decision) === "通過" || !row.decision),
  );
  report.checks.joe_gas_audit_rows = joeRows.length;
  report.checks.joe_gas_approved = joeRows.filter((r) => String(r.decision) === "通過").length;

  let mgrCookie = "";
  const mgrLogin = await prod("/api/auth/manager", {
    method: "POST",
    body: { email: MANAGER_EMAIL },
  });
  mgrCookie = mergeCookies(mgrCookie, mgrLogin.setCookie);

  const prodBundle1 = await prod("/api/exports/manager-bundle?onlyAudited=true", { cookieJar: mgrCookie });
  const prodBundle2 = await prod("/api/exports/manager-bundle?onlyAudited=true", { cookieJar: mgrCookie });
  const prodAudit1 = await prod("/api/audit/queue?decision=pending", { cookieJar: mgrCookie });
  const prodAudit2 = await prod("/api/audit/queue?decision=pending", { cookieJar: mgrCookie });
  const prodAssign1 = await prod("/api/assignments", { cookieJar: mgrCookie });
  const prodAssign2 = await prod("/api/assignments", { cookieJar: mgrCookie });

  report.production = {
    manager_login_status: mgrLogin.status,
    manager_bundle_cold_s: Math.round(prodBundle1.ms) / 1000,
    manager_bundle_warm_s: Math.round(prodBundle2.ms) / 1000,
    audit_queue_cold_s: Math.round(prodAudit1.ms) / 1000,
    audit_queue_warm_s: Math.round(prodAudit2.ms) / 1000,
    assignments_cold_s: Math.round(prodAssign1.ms) / 1000,
    assignments_warm_s: Math.round(prodAssign2.ms) / 1000,
    manager_bundle_total: prodBundle2.json?.data?.candidates?.total ?? null,
    manager_bundle_payments: prodBundle2.json?.data?.payments?.item_count ?? null,
  };

  let joeCookie = "";
  const joeLogin = await prod("/api/auth/login", {
    method: "POST",
    body: { email: JOE.email, password: JOE.password, visitorOnly: true },
  });
  joeCookie = mergeCookies(joeCookie, joeLogin.setCookie);
  const joePayments = await prod("/api/visitor/payments", { cookieJar: joeCookie });

  report.production.visitor_login_status = joeLogin.status;
  report.production.visitor_login_mode = joeLogin.json?.data?.mode ?? null;
  report.production.visitor_payments_status = joePayments.status;
  report.production.visitor_payments_items = joePayments.json?.data?.items?.length ?? 0;
  report.production.visitor_payments_approved = (joePayments.json?.data?.items || []).filter(
    (item) => item.status === "approved" || item.status === "locked",
  ).length;
  report.production.visitor_payments_sample = (joePayments.json?.data?.items || [])
    .slice(0, 6)
    .map((item) => ({
      caseName: item.caseName,
      status: item.status,
      totalFee: item.totalFee,
      auditDecision: item.auditDecision,
    }));

  report.checks.p1_export_has_rows = (prodBundle2.json?.data?.candidates?.total ?? 0) > 0;
  report.checks.p3_payments_visible = (prodBundle2.json?.data?.payments?.item_count ?? 0) > 0;
  report.checks.p4_bundle_warm_under_5s = (prodBundle2.ms / 1000) <= 5;
  report.checks.p5_audit_warm_faster = prodAudit2.ms < prodAudit1.ms;
  report.checks.p6_assign_warm_faster = prodAssign2.ms < prodAssign1.ms;
  report.checks.p7_visitor_payments = (joePayments.json?.data?.items?.length ?? 0) > 0;

  report.ok =
    report.flows.filter((f) => f.submit === "ok").length >= 1 &&
    report.checks.p1_export_has_rows &&
    report.checks.p3_payments_visible &&
    report.checks.p7_visitor_payments;

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}
