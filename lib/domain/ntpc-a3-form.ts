import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { evaluateHighCare } from "@/lib/domain/high-care-rules";
import type { MohwLifeCareAnswers } from "@/lib/domain/mohw-life-care-form";
import { answerHasValue, overlayDerivedFields } from "@/lib/domain/ntpc-a3-overlay-map";

const MM = 72 / 25.4;
const PAGE = { w: 297, h: 420 };
const INK = rgb(0.05, 0.08, 0.16);

/**
 * 官表字格：48 欄（全形）。列高不均（頁首較高），Y 用各列百分比，
 * 來自掃描 12 等分橫帶逐列抄寫，不是像素抓框。
 */
export const NTPC_A3_GRID = {
  rowCount: 52,
  colCount: 48,
  marginLeft: 6,
  marginRight: 5,
} as const;

/** 列中心（距頁頂 %）。0＝職章列，51＝三、特殊題項。 */
export const NTPC_A3_ROW_Y_PCT = [
  1.6, 3.8, 6.6, 9.2, 11.3, 13.7, 15.9, 18.0, 20.2, 22.4, 24.3, 26.4, 28.9, 31.0,
  32.0, 34.8, 36.4, 37.8, 40.4, 41.8, 43.5, 45.0, 46.6, 48.4, 50.0, 51.9, 53.8,
  55.7, 57.6, 59.6, 61.5, 63.4, 65.3, 67.2, 69.0, 70.8, 72.5, 74.2, 75.8, 77.5,
  79.3, 81.1, 82.9, 84.9, 86.6, 88.2, 89.8, 91.3, 92.9, 94.5, 96.0, 97.0,
] as const;

const SPREADSHEET_TEMPLATE_PDF = path.join(
  process.cwd(),
  "public/forms/ntpc-life-care-google-sheet-a3.pdf",
);

const CJK_FONT_CANDIDATES = [
  path.join(process.cwd(), "public/fonts/kaiu.ttf"),
  "/Library/Fonts/kaiu.ttf",
  "/Library/Fonts/Arial Unicode.ttf",
];

type Check = { row: number; col: number; key: string; value: string };
type TextSlot = { row: number; col: number; text: string; size?: number; wCols?: number };

function pt(mm: number) {
  return mm * MM;
}

export function cellMm(row: number, col: number) {
  const usableW = PAGE.w - NTPC_A3_GRID.marginLeft - NTPC_A3_GRID.marginRight;
  const yPct = NTPC_A3_ROW_Y_PCT[row] ?? NTPC_A3_ROW_Y_PCT[NTPC_A3_ROW_Y_PCT.length - 1];
  return {
    x: NTPC_A3_GRID.marginLeft + col * (usableW / NTPC_A3_GRID.colCount),
    y: (PAGE.h * yPct) / 100,
  };
}

function charLen(label: string) {
  return Array.from(label).length;
}

/** 同一列選項：□ + 紙本標籤 + 1 欄間隔。回傳各勾選格欄位。 */
function optionCols(startCol: number, labels: string[]) {
  const cols: number[] = [];
  let col = startCol;
  for (const label of labels) {
    cols.push(col);
    col += 1 + charLen(label) + 1;
  }
  return cols;
}

function zipChecks(row: number, startCol: number, key: string, items: Array<[string, string]>): Check[] {
  const cols = optionCols(startCol, items.map((item) => item[1]));
  return items.map(([value], i) => ({ row, col: cols[i], key, value }));
}

/** 密排勾選：在 start–end 欄均分，避免依字數推欄會愈排愈歪。 */
function evenChecks(row: number, startCol: number, endCol: number, key: string, values: string[]): Check[] {
  const n = values.length;
  const span = Math.max(n, endCol - startCol);
  return values.map((value, i) => ({
    row,
    col: startCol + Math.round((i * span) / n),
    key,
    value,
  }));
}

/** 依官表該列文字算勾選欄：□ 所在字元位置＋左側題名佔欄。 */
function paperChecks(row: number, prefix: number, paper: string, key: string, values: string[]): Check[] {
  const cols: number[] = [];
  let col = prefix;
  for (const ch of Array.from(paper)) {
    if (ch === "□") cols.push(col);
    col += 1;
  }
  return values.map((value, i) => ({ row, col: cols[i] ?? prefix, key, value }));
}

async function embedTextFont(doc: PDFDocument): Promise<PDFFont> {
  doc.registerFontkit(fontkit);
  for (const candidate of CJK_FONT_CANDIDATES) {
    if (!existsSync(candidate)) continue;
    try {
      return await doc.embedFont(readFileSync(candidate), { subset: true });
    } catch {
      continue;
    }
  }
  return doc.embedFont(StandardFonts.Helvetica);
}

function on(answers: MohwLifeCareAnswers, key: string, value: string) {
  return answerHasValue(answers[key], value);
}

function rocParts(iso: string) {
  const match = String(iso).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return { y: "", m: "", d: "" };
  return {
    y: String(Number(match[1]) - 1911),
    m: String(Number(match[2])),
    d: String(Number(match[3])),
  };
}

function timeParts(raw: string) {
  const match = String(raw).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return { h: "", min: "" };
  return { h: String(Number(match[1])), min: match[2] };
}

function drawX(page: PDFPage, font: PDFFont, row: number, col: number) {
  const { x, y } = cellMm(row, col);
  page.drawText("X", {
    x: pt(x + 0.2),
    y: pt(PAGE.h - y - 3.1),
    size: 8,
    font,
    color: INK,
  });
}

function drawValue(page: PDFPage, font: PDFFont, slot: TextSlot) {
  if (!slot.text) return;
  const { x, y } = cellMm(slot.row, slot.col);
  const usableW = PAGE.w - NTPC_A3_GRID.marginLeft - NTPC_A3_GRID.marginRight;
  const maxW = ((slot.wCols ?? 8) * usableW) / NTPC_A3_GRID.colCount;
  page.drawText(slot.text, {
    x: pt(x),
    y: pt(PAGE.h - y - 3.0),
    size: slot.size ?? 8,
    font,
    color: INK,
    maxWidth: pt(maxW),
  });
}

/**
 * 列序依官表掃描由上而下（職章列＝0，三、特殊題項＝51）。
 * 欄位依該列選項文字長度推算，不掃描像素。
 */
function collectSlots(
  answers: MohwLifeCareAnswers,
  bag: Record<string, unknown>,
  highCare: ReturnType<typeof evaluateHighCare>,
): { checks: Check[]; texts: TextSlot[] } {
  const visit = rocParts(String(answers.visit_date ?? ""));
  const birth = rocParts(String(answers.birth_date ?? ""));
  const start = timeParts(String(answers.visit_start_time ?? ""));
  const end = timeParts(String(answers.visit_end_time ?? ""));
  const C = 8;

  const checks: Check[] = [
    { row: 3, col: 28, key: "visit_status", value: "已完成" },
    { row: 4, col: 20, key: "visit_status", value: "拒絕訪視" },
    { row: 4, col: 31, key: "gender", value: "男" },
    { row: 4, col: 33, key: "gender", value: "女" },
    { row: 4, col: 36, key: "gender", value: "其他" },
    ...zipChecks(7, C, "line_id_status", [
      ["無", "無"],
      ["有", "有"],
    ]),
    { row: 9, col: C, key: "living_address_type", value: "與戶籍地址相同" },
    { row: 10, col: C, key: "living_address_type", value: "未住戶籍地址" },
    { row: 10, col: 22, key: "living_address_note", value: "居住地址不詳" },
    { row: 11, col: C, key: "living_address_type", value: "查無此人" },
    ...evenChecks(12, 8, 46, "housing_type", [
      "電梯大樓",
      "有電梯公寓",
      "有電梯透天樓房",
      "無電梯公寓",
      "無電梯透天樓房",
      "平房",
      "其他",
    ]),
    { row: 13, col: 8, key: "living_status", value: "與他人同住" },
    { row: 13, col: 18, key: "cohabitation_status", value: "同住者有照顧能力" },
    { row: 13, col: 36, key: "cohabitation_status", value: "外籍移工(看護)同住" },
    { row: 14, col: 8, key: "living_status", value: "1人獨自居住" },
    { row: 14, col: 20, key: "cohabitation_status", value: "同住配偶年滿65歲" },
    { row: 14, col: 34, key: "cohabitation_status", value: "同住者無照顧能力" },
    // 教育程度□不識字 □識字 □小學 □初(國)中 □高中(職) □專科 □大學 □研究所
    { row: 15, col: 8, key: "education", value: "不識字" },
    { row: 15, col: 13, key: "education", value: "識字" },
    { row: 15, col: 18, key: "education", value: "小學" },
    { row: 15, col: 23, key: "education", value: "初(國)中" },
    { row: 15, col: 30, key: "education", value: "高中(職)" },
    { row: 15, col: 37, key: "education", value: "專科" },
    { row: 15, col: 41, key: "education", value: "大學" },
    { row: 15, col: 45, key: "education", value: "研究所" },
    // 婚姻狀況□有配偶或同居 □喪偶 □離婚或分居 □未婚 □其他
    { row: 16, col: 8, key: "marital_status", value: "有配偶或同居" },
    { row: 16, col: 18, key: "marital_status", value: "喪偶" },
    { row: 16, col: 23, key: "marital_status", value: "離婚或分居" },
    { row: 16, col: 31, key: "marital_status", value: "未婚" },
    { row: 16, col: 36, key: "marital_status", value: "其他" },
    ...zipChecks(17, C, "has_children", [
      ["無", "無"],
      ["存", "存"],
    ]),
    { row: 17, col: 34, key: "children_same_city", value: "否" },
    { row: 17, col: 37, key: "children_same_city", value: "是" },
    // 1.您覺得自己目前健康狀況如何？□很好 □還算好 □普通 □不太好 □很不好
    { row: 18, col: 24, key: "health_self_rating", value: "很好" },
    { row: 18, col: 28, key: "health_self_rating", value: "還算好" },
    { row: 18, col: 32, key: "health_self_rating", value: "普通" },
    { row: 18, col: 36, key: "health_self_rating", value: "不太好" },
    { row: 18, col: 41, key: "health_self_rating", value: "很不好" },
    ...paperChecks(19, 20, "□無改變 □減輕1-3公斤 □減輕3公斤以上 □增加 □不知道", "weight_change_3m", [
      "無改變",
      "減輕1-3公斤",
      "減輕3公斤以上",
      "增加",
      "不知道",
    ]),
    ...paperChecks(20, 18, "□嚴重食慾不佳 □中度食慾不佳 □無變化", "appetite_3m", [
      "嚴重食慾不佳",
      "中度食慾不佳",
      "無變化",
    ]),
    // 4.是否有下列疾病(可複選)？□心臟病 □中風 □高血壓 □糖尿病 □骨與關節疾病 □癌症 □失智症
    { row: 21, col: 18, key: "diseases", value: "心臟病" },
    { row: 21, col: 22, key: "diseases", value: "中風" },
    { row: 21, col: 26, key: "diseases", value: "高血壓" },
    { row: 21, col: 30, key: "diseases", value: "糖尿病" },
    { row: 21, col: 35, key: "diseases", value: "骨與關節疾病" },
    { row: 21, col: 41, key: "diseases", value: "癌症" },
    { row: 21, col: 45, key: "diseases", value: "失智症" },
    ...zipChecks(22, 22, "diseases", [
      ["其他", "其他"],
      ["以上均無", "以上均無"],
    ]),
    ...zipChecks(23, 28, "recent_medical_event", [
      ["否", "否"],
      ["是", "是"],
    ]),
    ...zipChecks(24, 12, "hearing_issue", [
      ["否", "否"],
      ["是", "是"],
    ]),
    { row: 24, col: 28, key: "hearing_aid", value: "否" },
    { row: 24, col: 32, key: "hearing_aid", value: "是" },
    ...zipChecks(24, 38, "vision_issue", [
      ["否", "否"],
      ["是", "是"],
    ]),
    ...evenChecks(25, 8, 40, "family_interaction", [
      "從未",
      "每月少於1次",
      "每個月1次",
      "每個月2-3次",
      "每周1次",
      "每周2-6次",
      "每天",
    ]),
    ...evenChecks(26, 8, 40, "neighbor_interaction", [
      "從未",
      "每月少於1次",
      "每個月1次",
      "每個月2-3次",
      "每周1次",
      "每周2-6次",
      "每天",
    ]),
    { row: 27, col: C, key: "life_difficulties_flag", value: "無" },
    { row: 27, col: 12, key: "life_difficulties_flag", value: "有" },
    ...zipChecks(27, 22, "life_difficulties", [
      ["三餐無法溫飽", "三餐無法溫飽"],
      ["無人可協助就醫", "無人可協助就醫"],
      ["租屋困難", "租屋困難"],
      ["最近記憶力不好", "最近記憶力不好"],
    ]),
    { row: 28, col: 22, key: "life_difficulties", value: "外出交通不方便（例如缺乏公車或客運）" },
    { row: 29, col: C, key: "worries_flag", value: "無" },
    { row: 29, col: 12, key: "worries_flag", value: "有" },
    ...zipChecks(29, 22, "worries", [
      ["自己受傷或疾病", "自己受傷或疾病"],
      ["親人受傷或疾病", "親人受傷或疾病"],
      ["親人離世", "親人離世"],
      ["自己經濟問題(如債務)", "自己經濟問題"],
    ]),
    { row: 30, col: C, key: "worries", value: "被詐騙" },
    { row: 30, col: 16, key: "worries", value: "子女、孫子女問題（如打擾生活、財務處理等）" },
    { row: 31, col: C, key: "help_sources_flag", value: "無" },
    ...zipChecks(31, 16, "help_sources_none", [
      ["沒發生過", "沒發生過"],
      ["不想麻煩別人，都是自己想辦法", "不想麻煩別人"],
      ["找不到人可以協助", "找不到人可以協助"],
    ]),
    { row: 32, col: C, key: "help_sources_flag", value: "有" },
    ...zipChecks(32, 16, "help_sources_has", [
      ["家人", "家人"],
      ["朋友", "朋友"],
      ["鄰居", "鄰居"],
      ["社工", "社工"],
      ["村里長", "村里長"],
      ["社區志工", "社區志工"],
      ["大廈管理員", "大廈管理員"],
    ]),
    ...zipChecks(33, 16, "information_channels", [
      ["電視", "電視"],
      ["報紙", "報紙"],
      ["廣播", "廣播"],
      ["網路", "網路"],
      ["村里長", "村里長"],
      ["親友或鄰里", "親友或鄰里"],
      ["社群媒體(如：Line、FB、IG)", "社群媒體"],
    ]),
    { row: 34, col: 22, key: "information_channels", value: "以上均無" },
    ...evenChecks(35, 16, 46, "past_activities", [
      "工作",
      "擔任志工",
      "學習新事物",
      "四處旅遊",
      "健身運動",
      "參與宗教活動",
    ]),
    { row: 36, col: 28, key: "past_activities", value: "以上均無" },
    ...evenChecks(37, 16, 46, "desired_activities", [
      "工作",
      "擔任志工",
      "學習新事物",
      "四處旅遊",
      "健身運動",
      "參與宗教活動",
    ]),
    { row: 38, col: 28, key: "desired_activities", value: "以上均無" },
    ...zipChecks(39, 20, "home_safety_feeling", [
      ["很安全", "很安全"],
      ["大致安全", "大致安全"],
      ["有些不安全", "有些不安全"],
      ["很不安全", "很不安全"],
    ]),
    ...evenChecks(40, 20, 46, "loneliness_2w", [
      "完全沒有",
      "只有幾天：1至6天",
      "一半以上天數：7至11天",
      "幾乎每天：12至14天",
    ]),
    ...evenChecks(41, 22, 46, "depressed_2w", [
      "完全沒有",
      "只有幾天：1至6天",
      "一半以上天數：7至11天",
      "幾乎每天：12至14天",
    ]),
    ...evenChecks(42, 22, 46, "loss_interest_2w", [
      "完全沒有",
      "只有幾天：1至6天",
      "一半以上天數：7至11天",
      "幾乎每天：12至14天",
    ]),
    { row: 43, col: C, key: "service_willingness_flag", value: "無" },
    { row: 43, col: 12, key: "service_willingness_flag", value: "有" },
    ...zipChecks(43, 20, "service_willingness", [
      ["參加社區據點", "參加社區據點"],
      ["關懷服務", "關懷服務"],
      ["送餐服務", "送餐服務"],
      ["安裝緊急救援裝置", "安裝緊急救援裝置"],
    ]),
    ...zipChecks(44, 20, "service_willingness", [
      ["轉介：長照", "長照"],
      ["轉介：身障", "身障"],
    ]),
    { row: 45, col: 16, key: "mental_status", value: "在訪談過程中，長者有提到自殺意念" },
    { row: 45, col: 36, key: "mental_status", value: "無特殊情形" },
    ...zipChecks(46, 12, "self_care_flag", [
      ["可以", "可以"],
      ["可以，但行動緩慢", "可以但行動緩慢"],
      ["不可以", "不可以"],
    ]),
    { row: 46, col: 20, key: "self_care_observation", value: "需要別人幫助才能移動" },
    { row: 46, col: 32, key: "self_care_observation", value: "衣物不乾淨" },
    { row: 47, col: 28, key: "self_care_observation", value: "身上有異味(例如尿騷味)" },
    { row: 47, col: 14, key: "self_care_observation", value: "使用器具(例如輪椅、拐杖)就可以自行移動" },
    { row: 48, col: 10, key: "home_hygiene_issues", value: "環境物品十分髒亂" },
    { row: 48, col: 20, key: "home_hygiene_issues", value: "衣著不符季節" },
    { row: 48, col: 28, key: "home_hygiene_issues", value: "以上均無" },
    // 安全問題（可複選）□電線裸露 □照明設備不足(如夜起時) □未裝設住宅用火災警報器 □多個電器同時使用一個插座
    { row: 49, col: 12, key: "home_safety_issues", value: "電線裸露" },
    { row: 49, col: 20, key: "home_safety_issues", value: "照明設備不足(如夜起時)" },
    { row: 49, col: 32, key: "home_safety_issues", value: "未裝設住宅用火災警報器" },
    { row: 49, col: 42, key: "home_safety_issues", value: "多個電器同時使用一個插座" },
    ...zipChecks(50, 12, "home_safety_issues", [
      ["熱水器安裝於室內，且不通風", "熱水器室內不通風"],
      ["爐火(例如瓦斯爐、電熱器)周圍堆放可燃物", "爐火旁可燃物"],
      ["出入動線囤積雜物", "動線囤積"],
      ["無法觀察", "無法觀察"],
    ]),
  ];

  // 三、特殊題項（橘／黃／綠）—色塊在標題括號內，不是列尾。
  // 三、特殊題項（□橘□黃□綠）勾選結果，由系統後台自動計算
  if (highCare.colors.includes("橘")) checks.push({ row: 51, col: 9, key: "__color", value: "橘" });
  if (highCare.colors.includes("黃")) checks.push({ row: 51, col: 10, key: "__color", value: "黃" });
  if (highCare.colors.includes("綠")) checks.push({ row: 51, col: 12, key: "__color", value: "綠" });

  const texts: TextSlot[] = [
    { row: 0, col: 36, text: String(bag.household_district ?? ""), size: 8, wCols: 5 },
    { row: 1, col: 36, text: String(bag.overlay_year ?? "115"), size: 8, wCols: 4 },
    { row: 1, col: 41, text: String(bag.overlay_month ?? ""), size: 8, wCols: 3 },
    { row: 2, col: 30, text: visit.y, size: 8, wCols: 4 },
    { row: 2, col: 35, text: visit.m, size: 8, wCols: 3 },
    { row: 2, col: 38, text: visit.d, size: 8, wCols: 3 },
    { row: 2, col: 41, text: start.h, size: 8, wCols: 3 },
    { row: 2, col: 43, text: start.min, size: 8, wCols: 3 },
    { row: 2, col: 45, text: end.h, size: 8, wCols: 3 },
    { row: 2, col: 47, text: end.min, size: 7, wCols: 2 },
    { row: 4, col: 6, text: String(bag.name ?? ""), size: 9, wCols: 12 },
    { row: 5, col: 7, text: birth.y, size: 8, wCols: 4 },
    { row: 5, col: 10, text: birth.m, size: 8, wCols: 3 },
    { row: 5, col: 13, text: birth.d, size: 8, wCols: 3 },
    { row: 5, col: 32, text: String(bag.national_id ?? ""), size: 8, wCols: 14 },
    { row: 6, col: 8, text: String(bag.phone ?? ""), size: 8, wCols: 14 },
    { row: 6, col: 32, text: String(bag.mobile ?? ""), size: 8, wCols: 14 },
    { row: 7, col: 16, text: String(bag.line_id ?? ""), size: 7, wCols: 8 },
    { row: 7, col: 32, text: String(bag.emergency_contact_name ?? ""), size: 8, wCols: 6 },
    { row: 7, col: 39, text: String(bag.emergency_contact_relation ?? ""), size: 7, wCols: 4 },
    { row: 7, col: 44, text: String(bag.emergency_contact_phone ?? ""), size: 7, wCols: 6 },
    { row: 8, col: 8, text: String(bag.household_city ?? ""), size: 7, wCols: 5 },
    { row: 8, col: 16, text: String(bag.household_district ?? ""), size: 7, wCols: 5 },
    { row: 8, col: 24, text: String(bag.household_village ?? ""), size: 7, wCols: 5 },
    { row: 8, col: 32, text: String(bag.household_address ?? ""), size: 7, wCols: 15 },
    { row: 17, col: 16, text: String(bag.sons_count ?? ""), size: 8, wCols: 3 },
    { row: 17, col: 22, text: String(bag.daughters_count ?? ""), size: 8, wCols: 3 },
    { row: 19, col: 10, text: String(bag.height_cm ?? ""), size: 8, wCols: 4 },
    { row: 19, col: 18, text: String(bag.weight_kg ?? ""), size: 8, wCols: 4 },
  ];

  return { checks, texts };
}

async function drawOfficialBackground(doc: PDFDocument, page: PDFPage) {
  if (!existsSync(SPREADSHEET_TEMPLATE_PDF)) {
    throw new Error(
      "缺少 Google 試算表空白套版 public/forms/ntpc-life-care-google-sheet-a3.pdf",
    );
  }
  const template = await PDFDocument.load(readFileSync(SPREADSHEET_TEMPLATE_PDF));
  const [embedded] = await doc.embedPdf(template, [0]);
  page.drawPage(embedded, {
    x: 0,
    y: 0,
    width: pt(PAGE.w),
    height: pt(PAGE.h),
  });
}

export async function buildNtpcA3FullFormPdf(
  answers: MohwLifeCareAnswers,
  meta?: { elderName?: string; caseCode?: string },
): Promise<Uint8Array> {
  const highCare = evaluateHighCare(answers);
  const derived = overlayDerivedFields(answers, highCare, meta);
  const bag = { ...answers, ...derived } as Record<string, unknown>;

  const doc = await PDFDocument.create();
  const latin = await doc.embedFont(StandardFonts.Helvetica);
  const font = await embedTextFont(doc);
  const page = doc.addPage([pt(PAGE.w), pt(PAGE.h)]);
  await drawOfficialBackground(doc, page);

  const { checks, texts } = collectSlots(answers, bag, highCare);
  for (const slot of checks) {
    if (slot.key === "__color" || on(answers, slot.key, slot.value)) {
      drawX(page, latin, slot.row, slot.col);
    }
  }
  for (const slot of texts) {
    drawValue(page, font, slot);
  }

  return doc.save();
}
