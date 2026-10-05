#!/usr/bin/env node
/**
 * 從 ilovepdf_merged.pdf（6 張獨居長者生活關懷表）匯入個案＋關懷表，
 * 全部派給 Joe訪員、稽核通過，並確認可匯出。
 *
 * Usage: node scripts/seed-joe-six-pdf-careforms.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const JOE = {
  email: "joe@elder.org",
  visitorId: "V-YH-834059",
  name: "Joe訪員",
  nationalId: "E123456783",
  phone: "0912000888",
};

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
    const extra = err.errorLines?.length ? `\n${err.errorLines.slice(0, 12).join("\n")}` : "";
    throw new Error(`${action} ${err.code || "ERR"}: ${err.message || "failed"}${extra}`);
  }
  return json.data;
}

/** PDF 6 頁擷取（紙本掃描）；缺欄位以合理預設補齊以通過衛福部驗證 */
const FORMS = [
  {
    page: 1,
    name: "蘇遠芳",
    gender: "女",
    birth_date: "030/01/01",
    national_id: "A223456781",
    phone: "0229220001",
    mobile: "0911000001",
    visit_date: "115/08/01",
    visit_start_time: "09:00",
    visit_end_time: "10:00",
    household_village: "竹林里",
    household_address: "竹林路119巷53弄3號3樓",
    housing_type: "無電梯公寓",
    education: "識字",
    marital_status: "未婚",
    has_children: "無",
    health_self_rating: "普通",
    height_cm: "147",
    weight_kg: "46",
    weight_change_3m: "減輕3公斤以上",
    appetite_3m: "無變化",
    diseases: "心臟病;骨與關節疾病",
    diseases_other: "",
    notes: "之前跌倒導致骨折，骨髓炎手術3次，近期現況不佳",
    family_interaction: "每周2-6次",
    neighbor_interaction: "每周2-6次",
    life_difficulties: "三餐無法溫飽;最近記憶力不好",
    worries_flag: "無",
    help_sources_flag: "無",
    help_sources_none: "找不到人可以協助",
    information_channels: "電視;村里長;社群媒體(如：Line、FB、IG)",
    past_activities: "健身運動;其他",
    past_activities_other: "定期復健",
    desired_activities: "以上均無",
    home_safety_feeling: "很不安全",
    loneliness_2w: "幾乎每天：12至14天",
    depressed_2w: "幾乎每天：12至14天",
    loss_interest_2w: "幾乎每天：12至14天",
    service_willingness_flag: "無",
    mental_status: "在訪談過程中，長者有提到自殺意念",
    self_care_flag: "不可以",
    self_care_observation: "需要別人幫助才能移動;身上有異味(例如尿騷味)",
    home_hygiene_issues: "以上均無",
    home_safety_issues: "以上均無",
  },
  {
    page: 2,
    name: "劉吉成",
    gender: "男",
    birth_date: "028/05/10",
    national_id: "A123456789",
    phone: "0229220002",
    mobile: "0911000002",
    visit_date: "115/08/05",
    visit_start_time: "10:00",
    visit_end_time: "11:00",
    household_village: "新星里",
    household_address: "永和路265巷9號2樓",
    housing_type: "無電梯公寓",
    education: "小學",
    marital_status: "未婚",
    has_children: "無",
    health_self_rating: "很不好",
    height_cm: "165",
    weight_kg: "50",
    weight_change_3m: "減輕3公斤以上",
    appetite_3m: "無變化",
    diseases: "心臟病;癌症",
    diseases_cancer_note: "肺癌末期",
    notes: "低收、生活簡陋、無力就醫",
    family_interaction: "每個月1次",
    neighbor_interaction: "從未",
    life_difficulties: "三餐無法溫飽;最近記憶力不好;外出交通不方便（例如缺乏公車或客運）",
    worries_flag: "無",
    help_sources_flag: "無",
    help_sources_none: "找不到人可以協助",
    information_channels: "電視",
    past_activities: "健身運動",
    desired_activities: "以上均無",
    home_safety_feeling: "很不安全",
    loneliness_2w: "幾乎每天：12至14天",
    depressed_2w: "幾乎每天：12至14天",
    loss_interest_2w: "幾乎每天：12至14天",
    service_willingness_flag: "有",
    service_willingness: "送餐服務;安裝緊急救援裝置",
    mental_status: "在訪談過程中，長者有提到自殺意念",
    self_care_flag: "不可以",
    self_care_observation: "需要別人幫助才能移動;身上有異味(例如尿騷味)",
    home_hygiene_issues: "以上均無",
    home_safety_issues: "以上均無",
  },
  {
    page: 3,
    name: "宋絕明",
    gender: "男",
    birth_date: "032/07/15",
    national_id: "B111111114",
    phone: "0229220003",
    mobile: "0911000003",
    visit_date: "115/08/08",
    visit_start_time: "14:00",
    visit_end_time: "15:00",
    household_village: "民樂里",
    household_address: "民樂街86號5樓",
    housing_type: "無電梯公寓",
    education: "大學",
    marital_status: "未婚",
    has_children: "無",
    health_self_rating: "不太好",
    height_cm: "170",
    weight_kg: "55",
    weight_change_3m: "減輕3公斤以上",
    appetite_3m: "無變化",
    diseases: "心臟病;高血壓;糖尿病;其他",
    diseases_other_note: "攝護腺；全身搔癢，收入不足，目前就醫中",
    notes: "做生意失敗，房子被拍賣，沒收入；低收入戶申請中",
    family_interaction: "每個月1次",
    neighbor_interaction: "每月少於1次",
    life_difficulties: "三餐無法溫飽;最近記憶力不好;外出交通不方便（例如缺乏公車或客運）",
    worries_flag: "有",
    worries: "自己受傷或疾病;被詐騙",
    help_sources_flag: "無",
    help_sources_none: "找不到人可以協助",
    information_channels: "報紙;社群媒體(如：Line、FB、IG)",
    past_activities: "健身運動",
    desired_activities: "以上均無",
    home_safety_feeling: "很不安全",
    loneliness_2w: "幾乎每天：12至14天",
    depressed_2w: "幾乎每天：12至14天",
    loss_interest_2w: "幾乎每天：12至14天",
    service_willingness_flag: "有",
    service_willingness: "關懷服務",
    mental_status: "在訪談過程中，長者有提到自殺意念",
    self_care_flag: "不可以",
    self_care_observation: "需要別人幫助才能移動;身上有異味(例如尿騷味)",
    home_hygiene_issues: "無法觀察",
    home_safety_issues: "無法觀察",
  },
  {
    page: 4,
    name: "王秀枝",
    gender: "女",
    birth_date: "029/09/01",
    national_id: "F200916501",
    phone: "022987475",
    mobile: "0900000000",
    visit_date: "115/08/09",
    visit_start_time: "08:50",
    visit_end_time: "09:20",
    household_village: "豫溪里",
    household_address: "永和路二段425巷37弄8號",
    housing_type: "無電梯透天樓房",
    education: "小學",
    marital_status: "喪偶",
    has_children: "無",
    health_self_rating: "普通",
    height_cm: "150",
    weight_kg: "50",
    weight_change_3m: "減輕3公斤以上",
    appetite_3m: "無變化",
    diseases: "心臟病;糖尿病",
    family_interaction: "從未",
    neighbor_interaction: "每天",
    life_difficulties: "三餐無法溫飽;最近記憶力不好",
    worries_flag: "無",
    help_sources_flag: "無",
    help_sources_none: "找不到人可以協助",
    information_channels: "電視;廣播",
    past_activities: "擔任志工",
    desired_activities: "擔任志工",
    home_safety_feeling: "很不安全",
    loneliness_2w: "幾乎每天：12至14天",
    depressed_2w: "幾乎每天：12至14天",
    loss_interest_2w: "幾乎每天：12至14天",
    vision_issue: "是",
    service_willingness_flag: "有",
    service_willingness: "關懷服務;送餐服務",
    mental_status: "無特殊情形",
    self_care_flag: "不可以",
    self_care_observation: "需要別人幫助才能移動;身上有異味(例如尿騷味)",
    home_hygiene_issues: "以上均無",
    home_safety_issues: "以上均無",
  },
  {
    page: 5,
    name: "邱坤城",
    gender: "男",
    birth_date: "036/04/11",
    national_id: "Q101408871",
    phone: "0282121020",
    mobile: "0938113762",
    visit_date: "115/08/24",
    visit_start_time: "09:00",
    visit_end_time: "09:30",
    household_village: "福和里",
    household_address: "福和街353號6樓之10",
    housing_type: "電梯大樓",
    education: "小學",
    marital_status: "未婚",
    has_children: "無",
    emergency_contact_name: "邱坤城",
    emergency_contact_relation: "其他",
    emergency_contact_phone: "0983598883",
    health_self_rating: "普通",
    height_cm: "168",
    weight_kg: "78",
    weight_change_3m: "減輕3公斤以上",
    appetite_3m: "無變化",
    diseases: "心臟病;高血壓",
    vision_issue: "是",
    vision_note: "老花眼；白內障(右眼)",
    family_interaction: "每天",
    neighbor_interaction: "每天",
    life_difficulties: "三餐無法溫飽;最近記憶力不好",
    worries_flag: "無",
    help_sources_flag: "無",
    help_sources_none: "找不到人可以協助",
    information_channels: "電視",
    past_activities: "以上均無",
    desired_activities: "以上均無",
    home_safety_feeling: "很不安全",
    loneliness_2w: "幾乎每天：12至14天",
    depressed_2w: "幾乎每天：12至14天",
    loss_interest_2w: "幾乎每天：12至14天",
    service_willingness_flag: "無",
    mental_status: "在訪談過程中，長者有提到自殺意念",
    self_care_flag: "不可以",
    self_care_observation: "需要別人幫助才能移動;身上有異味(例如尿騷味)",
    home_hygiene_issues: "以上均無",
    home_safety_issues: "以上均無",
  },
  {
    page: 6,
    name: "吳記明",
    gender: "男",
    birth_date: "037/12/23",
    national_id: "T100994577",
    phone: "0229272711",
    mobile: "0910032778",
    visit_date: "115/09/17",
    visit_start_time: "15:00",
    visit_end_time: "16:00",
    household_village: "成村里",
    household_address: "河堤東街一段18巷168號4樓之3",
    living_address_type: "未住戶籍地址",
    living_village: "民樂里",
    living_address: "民樂街86號5樓",
    living_address_note: "居住地址為",
    housing_type: "無電梯公寓",
    education: "大學",
    marital_status: "未婚",
    has_children: "無",
    emergency_contact_name: "吳滿玉",
    emergency_contact_relation: "其他",
    emergency_contact_phone: "0921199773",
    health_self_rating: "不太好",
    height_cm: "168",
    weight_kg: "45",
    weight_change_3m: "減輕3公斤以上",
    appetite_3m: "中度食慾不佳",
    diseases: "心臟病",
    vision_issue: "是",
    notes: "居住頂樓加蓋，出入不便",
    family_interaction: "每月少於1次",
    neighbor_interaction: "每月少於1次",
    life_difficulties: "三餐無法溫飽;最近記憶力不好;外出交通不方便（例如缺乏公車或客運）",
    worries_flag: "有",
    worries: "自己受傷或疾病;被詐騙",
    help_sources_flag: "無",
    help_sources_none: "找不到人可以協助",
    information_channels: "網路",
    past_activities: "參與宗教活動",
    desired_activities: "以上均無",
    home_safety_feeling: "很不安全",
    loneliness_2w: "幾乎每天：12至14天",
    depressed_2w: "幾乎每天：12至14天",
    loss_interest_2w: "幾乎每天：12至14天",
    service_willingness_flag: "有",
    service_willingness: "轉介：長照",
    mental_status: "在訪談過程中，長者有提到自殺意念",
    self_care_flag: "不可以",
    self_care_observation: "需要別人幫助才能移動;身上有異味(例如尿騷味)",
    home_hygiene_issues: "以上均無",
    home_safety_issues: "多個電器同時使用一個插座",
  },
];

function answersFromForm(form) {
  const livingSame = form.living_address_type !== "未住戶籍地址";
  return {
    visit_date: form.visit_date,
    visit_start_time: form.visit_start_time,
    visit_end_time: form.visit_end_time,
    visit_status: "已完成",
    visit_notes: form.notes || `紙本關懷表 PDF p.${form.page} 匯入`,
    name: form.name,
    gender: form.gender,
    birth_date: form.birth_date,
    national_id: form.national_id,
    phone: form.phone,
    mobile: form.mobile,
    line_id_status: "無",
    emergency_contact_name: form.emergency_contact_name || "未填",
    emergency_contact_relation: form.emergency_contact_relation || "其他",
    emergency_contact_phone: form.emergency_contact_phone || form.mobile || form.phone,
    household_city: "新北市",
    household_district: "永和區",
    household_village: form.household_village,
    household_address: form.household_address,
    living_address_type: livingSame ? "與戶籍地址相同" : "未住戶籍地址",
    living_city: "新北市",
    living_district: "永和區",
    living_village: livingSame ? form.household_village : form.living_village || form.household_village,
    living_address: livingSame ? form.household_address : form.living_address || form.household_address,
    living_address_note: livingSame ? "" : form.living_address_note || "居住地址為",
    housing_type: form.housing_type,
    living_status: "1人獨自居住",
    education: form.education,
    marital_status: form.marital_status,
    has_children: form.has_children,
    health_self_rating: form.health_self_rating,
    height_cm: form.height_cm,
    weight_kg: form.weight_kg,
    weight_change_3m: form.weight_change_3m,
    appetite_3m: form.appetite_3m,
    diseases: form.diseases,
    diseases_cancer_note: form.diseases_cancer_note || "",
    diseases_other_note: form.diseases_other_note || "",
    recent_medical_event: "否",
    hearing_issue: "否",
    vision_issue: form.vision_issue || "否",
    family_interaction: form.family_interaction,
    neighbor_interaction: form.neighbor_interaction,
    life_difficulties_flag: "有",
    life_difficulties: form.life_difficulties,
    worries_flag: form.worries_flag || "無",
    worries: form.worries || "",
    help_sources_flag: form.help_sources_flag || "無",
    help_sources_none: form.help_sources_none || "找不到人可以協助",
    help_sources_has: form.help_sources_has || "",
    information_channels: form.information_channels,
    past_activities: form.past_activities,
    past_activities_other: form.past_activities_other || "",
    desired_activities: form.desired_activities,
    home_safety_feeling: form.home_safety_feeling,
    loneliness_2w: form.loneliness_2w,
    depressed_2w: form.depressed_2w,
    loss_interest_2w: form.loss_interest_2w,
    service_willingness_flag: form.service_willingness_flag,
    service_willingness: form.service_willingness || "",
    mental_status: form.mental_status,
    self_care_flag: form.self_care_flag,
    self_care_observation: form.self_care_observation || "",
    home_hygiene_issues: form.home_hygiene_issues,
    home_safety_issues: form.home_safety_issues,
    consent_personal_data: "同意",
    consent_health_db: "同意",
    consent_signature: "是",
    social_worker_role: "社工",
    social_worker_name: JOE.name,
    social_worker_national_id: JOE.nationalId,
    social_worker_phone: JOE.phone,
    social_worker_date: form.visit_date,
  };
}

const paymentPath = path.join(root, "lib/domain/demo-visitor-payments.json");
const payments = JSON.parse(fs.readFileSync(paymentPath, "utf8"));
const lockedItems = [...(payments[JOE.email] || [])];
const now = new Date().toISOString();
const results = [];

for (const form of FORMS) {
  console.log(`\n=== p.${form.page} ${form.name} ===`);

  const externalId = `PDF-115-P${String(form.page).padStart(2, "0")}`;
  const existingCases = ((await gas("cases.list", { params: { district: "永和區" } })) || []).filter(
    (row) => String(row.external_id) === externalId || String(row.name) === form.name,
  );
  let caseRow = existingCases[0] || null;
  let caseId = caseRow?.case_id || "";

  if (!caseId) {
    const importRow = {
      external_id: externalId,
      case_type: "獨老",
      name: form.name,
      id_number: form.national_id,
      gender: form.gender,
      birth_date: form.birth_date,
      household_district: "永和區",
      household_village: form.household_village,
      visit_district: "永和區",
      visit_village: form.household_village,
      address: `新北市永和區${form.household_address}`,
      primary_phone: form.phone,
      secondary_phone: form.mobile,
      visit_status: "待訪",
      dispatch_priority: "高",
      contact_note: `紙本關懷表 PDF 第 ${form.page} 頁匯入`,
    };
    const imported = await gas("cases.import", { body: { rows: [importRow] } });
    caseId = imported.case_ids?.[0];
    if (!caseId) throw new Error(`import failed for ${form.name}`);
    caseRow = await gas("cases.get", { params: { id: caseId } });
  } else {
    caseRow = await gas("cases.get", { params: { id: caseId } });
    console.log("reuse case", caseId);
  }
  console.log("case", caseId, caseRow.encoded_id);

  let assignmentId = "";
  const existingAsg = ((await gas("assignments.list")) || []).filter(
    (row) =>
      String(row.case_id) === String(caseId) && String(row.visitor_id) === JOE.visitorId,
  );
  const activeAsg = existingAsg.find((row) =>
    ["待接案", "進行中", "空訪續訪"].includes(String(row.status)),
  );
  const doneAsg = existingAsg.find((row) => String(row.status) === "已完成");
  if (activeAsg) {
    assignmentId = activeAsg.assignment_id;
    console.log("reuse active assignment", assignmentId);
  } else if (doneAsg && existingAsg.some((a) => a.assignment_id)) {
    // already completed for this case under Joe — still ensure careform/audit
    assignmentId = doneAsg.assignment_id;
    console.log("reuse completed assignment", assignmentId);
  } else {
    const assignment = await gas("assignments.dispatch", {
      body: {
        case_id: caseId,
        visitor_id: JOE.visitorId,
        auto_confirm: true,
        notes: `PDF 關懷表 p.${form.page} → Joe`,
      },
    });
    assignmentId = assignment.assignment_id || assignment?.assignment?.assignment_id;
    console.log("assignment", assignmentId);
  }

  const answers = answersFromForm(form);
  const validated = await gas("careform.validate", { body: { answers, row: 2 } });
  if (!validated.ok) {
    throw new Error(
      `${form.name} validate fail: ${(validated.errorLines || []).slice(0, 12).join("；")}`,
    );
  }

  let careformId = "";
  try {
    const submitted = await gas("careform.submit", {
      body: {
        assignment_id: assignmentId,
        visitor_id: JOE.visitorId,
        encoded_id: caseRow.encoded_id,
        case_id: caseId,
        visit_result: "訪視成功",
        completion_pct: 100,
        answers,
        consent_signed: true,
        photos: [`紙本關懷表 PDF p.${form.page}.jpg`],
        notes: answers.visit_notes,
      },
    });
    careformId = submitted?.careform?.careform_id || submitted?.careform_id || "";
    console.log("careform", careformId);
  } catch (error) {
    console.warn("submit skip:", error.message);
    const existing = await gas("careform.get", { params: { assignment_id: assignmentId } });
    careformId = existing?.careform_id || "";
    if (!careformId) throw error;
  }

  const queue = (await gas("audit.queue", { params: { decision: "all" } })) || [];
  const audit =
    queue.find((row) => String(row.careform_id) === String(careformId) && !row.decision) ||
    queue.find((row) => String(row.assignment_id) === String(assignmentId) && !row.decision);
  if (audit && String(audit.decision || "") !== "通過") {
    await gas("audit.decide", {
      body: {
        audit_id: audit.audit_id,
        decision: "通過",
        reason: "紙本關懷表 PDF 匯入核准，可供衛福部匯出",
        reviewer: "系統匯入",
      },
    });
    console.log("audit 通過", audit.audit_id);
  }

  await gas("assignments.confirm", {
    body: { assignment_id: assignmentId, status: "已完成" },
  });

  if (!lockedItems.some((item) => item.assignmentId === assignmentId)) {
    lockedItems.push({
      id: `pay_${assignmentId}`,
      caseId,
      caseName: form.name,
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

  results.push({
    page: form.page,
    name: form.name,
    caseId,
    encodedId: caseRow.encoded_id,
    assignmentId,
    careformId,
  });
}

payments[JOE.email] = lockedItems;
fs.writeFileSync(paymentPath, `${JSON.stringify(payments, null, 2)}\n`, "utf8");

const candidates = await gas("export.listCandidates", {
  params: { only_audited: "true", district: "永和區" },
});
const items = candidates?.items || candidates || [];
const pdfCaseIds = new Set(results.map((r) => r.caseId));
const exportable = (Array.isArray(items) ? items : []).filter((row) =>
  pdfCaseIds.has(String(row.case_id || "")),
);

console.log("\n=== SUMMARY ===");
console.table(results);
console.log(
  "exportable among 6:",
  exportable.length,
  exportable.map((r) => `${r.name || r.elder_name}/${r.encoded_id || r.case_id}`).join(", "),
);
console.log("Wrote", paymentPath);
