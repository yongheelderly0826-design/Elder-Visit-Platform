import type { MohwLifeCareAnswers } from "@/lib/domain/mohw-life-care-form";
import type { HighCareEvaluation } from "@/lib/domain/high-care-rules";

/** A3 landscape millimetres. First-pass; recalibrate against official blank PDF. */
export const NTPC_A3_PAGE = { widthMm: 297, heightMm: 420, pages: 1 as const };

export type OverlayTextSlot = {
  kind: "text";
  page: 1 | 2;
  x: number;
  y: number;
  w?: number;
  fontSize?: number;
  keys: string[];
  separator?: string;
};

export type OverlayCheckSlot = {
  kind: "check";
  page: 1 | 2;
  x: number;
  y: number;
  key: string;
  value: string;
};

export type OverlayComputedCheckSlot = {
  kind: "computed_check";
  page: 1 | 2;
  x: number;
  y: number;
  color: "橘" | "黃" | "綠";
};

export type OverlaySlot = OverlayTextSlot | OverlayCheckSlot | OverlayComputedCheckSlot;

function text(
  page: 1 | 2,
  x: number,
  y: number,
  keys: string[],
  extra?: { w?: number; fontSize?: number; separator?: string },
): OverlayTextSlot {
  return { kind: "text", page, x, y, keys, ...extra };
}

function check(page: 1 | 2, x: number, y: number, key: string, value: string): OverlayCheckSlot {
  return { kind: "check", page, x, y, key, value };
}

/**
 * Coordinates from top-left, millimetres, A3 landscape.
 * Page 1 ≈ 紙本圖 1–2；Page 2 ≈ 紙本圖 3–4。
 */
export const NTPC_A3_OVERLAY_SLOTS: OverlaySlot[] = [
  text(1, 318, 18, ["overlay_year"], { w: 24, fontSize: 9 }),
  text(1, 348, 18, ["overlay_month"], { w: 16, fontSize: 9 }),
  text(1, 368, 18, ["household_district"], { w: 28, fontSize: 8 }),
  text(1, 318, 28, ["visit_date"], { w: 40, fontSize: 8 }),
  text(1, 362, 28, ["visit_start_time", "visit_end_time"], { w: 40, fontSize: 8, separator: "–" }),

  check(1, 12, 42, "visit_status", "拒絕訪視"),
  text(1, 28, 48, ["name"], { w: 42, fontSize: 9 }),
  check(1, 74, 46, "gender", "男"),
  check(1, 86, 46, "gender", "女"),
  check(1, 98, 46, "gender", "其他"),
  text(1, 28, 60, ["birth_date"], { w: 40, fontSize: 8 }),
  text(1, 74, 60, ["national_id"], { w: 48, fontSize: 8 }),
  text(1, 28, 72, ["phone"], { w: 40, fontSize: 8 }),
  text(1, 74, 72, ["mobile"], { w: 40, fontSize: 8 }),
  check(1, 120, 70, "line_id_status", "有"),
  check(1, 134, 70, "line_id_status", "無"),
  text(1, 148, 72, ["line_id"], { w: 40, fontSize: 8 }),
  text(1, 28, 84, ["emergency_contact_name", "emergency_contact_relation", "emergency_contact_phone"], {
    w: 160,
    fontSize: 7,
    separator: "／",
  }),
  text(1, 28, 98, ["household_city", "household_district", "household_village", "household_address"], {
    w: 180,
    fontSize: 7,
    separator: "",
  }),
  check(1, 28, 110, "living_address_type", "與戶籍地址相同"),
  check(1, 72, 110, "living_address_type", "未住戶籍地址"),
  check(1, 116, 110, "living_address_type", "查無此人"),
  text(1, 28, 122, ["living_city", "living_district", "living_village", "living_address"], {
    w: 180,
    fontSize: 7,
    separator: "",
  }),

  check(1, 220, 48, "housing_type", "電梯大樓"),
  check(1, 250, 48, "housing_type", "有電梯公寓"),
  check(1, 280, 48, "housing_type", "無電梯公寓"),
  check(1, 310, 48, "housing_type", "平房"),
  check(1, 330, 48, "housing_type", "其他"),
  check(1, 220, 62, "living_status", "與他人同住"),
  check(1, 260, 62, "living_status", "1人獨自居住"),
  check(1, 220, 74, "education", "不識字"),
  check(1, 244, 74, "education", "識字"),
  check(1, 262, 74, "education", "小學"),
  check(1, 280, 74, "education", "初(國)中"),
  check(1, 304, 74, "education", "高中(職)"),
  check(1, 334, 74, "education", "專科"),
  check(1, 220, 86, "marital_status", "有配偶或同居"),
  check(1, 262, 86, "marital_status", "喪偶"),
  check(1, 286, 86, "marital_status", "離婚或分居"),
  check(1, 322, 86, "marital_status", "未婚"),
  check(1, 220, 98, "has_children", "存"),
  check(1, 238, 98, "has_children", "無"),
  text(1, 256, 100, ["sons_count", "daughters_count"], { w: 40, fontSize: 8, separator: "/" }),
  check(1, 304, 98, "children_same_city", "是"),
  check(1, 322, 98, "children_same_city", "否"),

  check(1, 220, 118, "health_self_rating", "很好"),
  check(1, 244, 118, "health_self_rating", "還算好"),
  check(1, 270, 118, "health_self_rating", "普通"),
  check(1, 294, 118, "health_self_rating", "不太好"),
  check(1, 322, 118, "health_self_rating", "很不好"),
  text(1, 220, 132, ["height_cm"], { w: 24, fontSize: 8 }),
  text(1, 250, 132, ["weight_kg"], { w: 24, fontSize: 8 }),
  check(1, 220, 144, "weight_change_3m", "無改變"),
  check(1, 250, 144, "weight_change_3m", "減輕1-3公斤"),
  check(1, 290, 144, "weight_change_3m", "減輕3公斤以上"),
  check(1, 340, 144, "weight_change_3m", "增加"),
  check(1, 220, 156, "appetite_3m", "嚴重食慾不佳"),
  check(1, 270, 156, "appetite_3m", "中度食慾不佳"),
  check(1, 320, 156, "appetite_3m", "無變化"),
  check(1, 220, 170, "diseases", "心臟病"),
  check(1, 250, 170, "diseases", "中風"),
  check(1, 274, 170, "diseases", "高血壓"),
  check(1, 304, 170, "diseases", "糖尿病"),
  check(1, 334, 170, "diseases", "癌症"),
  check(1, 220, 182, "diseases", "失智症"),
  check(1, 250, 182, "diseases", "以上均無"),
  check(1, 220, 196, "recent_medical_event", "是"),
  check(1, 238, 196, "recent_medical_event", "否"),
  check(1, 270, 196, "hearing_issue", "是"),
  check(1, 288, 196, "hearing_issue", "否"),
  check(1, 320, 196, "vision_issue", "是"),
  check(1, 338, 196, "vision_issue", "否"),

  check(1, 28, 200, "family_interaction", "從未"),
  check(1, 50, 200, "family_interaction", "每月少於1次"),
  check(1, 84, 200, "family_interaction", "每個月1次"),
  check(1, 118, 200, "family_interaction", "每周1次"),
  check(1, 150, 200, "family_interaction", "每天"),
  check(1, 28, 214, "neighbor_interaction", "從未"),
  check(1, 50, 214, "neighbor_interaction", "每月少於1次"),
  check(1, 84, 214, "neighbor_interaction", "每個月1次"),
  check(1, 118, 214, "neighbor_interaction", "每周1次"),
  check(1, 150, 214, "neighbor_interaction", "每天"),
  check(1, 28, 230, "life_difficulties", "三餐無法溫飽"),
  check(1, 70, 230, "life_difficulties", "無人可協助就醫"),
  check(1, 114, 230, "life_difficulties", "最近記憶力不好"),
  check(1, 160, 230, "life_difficulties", "外出交通不方便（例如缺乏公車或客運）"),
  check(1, 28, 246, "worries", "自己受傷或疾病"),
  check(1, 70, 246, "worries", "親人離世"),
  check(1, 104, 246, "worries", "被詐騙"),
  check(1, 130, 246, "worries", "自己經濟問題(如債務)"),
  check(1, 180, 246, "worries", "子女、孫子女問題（如打擾生活、財務處理等）"),

  check(2, 20, 22, "help_sources_flag", "無"),
  check(2, 38, 22, "help_sources_flag", "有"),
  check(2, 56, 22, "help_sources_none", "找不到人可以協助"),
  check(2, 20, 36, "help_sources_has", "家人"),
  check(2, 40, 36, "help_sources_has", "朋友"),
  check(2, 60, 36, "help_sources_has", "鄰居"),
  check(2, 80, 36, "help_sources_has", "村里長"),
  check(2, 106, 36, "help_sources_has", "社工"),
  check(2, 20, 52, "information_channels", "電視"),
  check(2, 40, 52, "information_channels", "報紙"),
  check(2, 60, 52, "information_channels", "網路"),
  check(2, 80, 52, "information_channels", "村里長"),
  check(2, 106, 52, "information_channels", "以上均無"),
  check(2, 20, 70, "past_activities", "工作"),
  check(2, 40, 70, "past_activities", "擔任志工"),
  check(2, 70, 70, "past_activities", "四處旅遊"),
  check(2, 100, 70, "past_activities", "參與宗教活動"),
  check(2, 140, 70, "past_activities", "以上均無"),
  check(2, 20, 86, "desired_activities", "工作"),
  check(2, 40, 86, "desired_activities", "擔任志工"),
  check(2, 70, 86, "desired_activities", "健身運動"),
  check(2, 100, 86, "desired_activities", "以上均無"),
  check(2, 20, 104, "home_safety_feeling", "很安全"),
  check(2, 48, 104, "home_safety_feeling", "大致安全"),
  check(2, 80, 104, "home_safety_feeling", "有些不安全"),
  check(2, 116, 104, "home_safety_feeling", "很不安全"),
  check(2, 20, 120, "loneliness_2w", "完全沒有"),
  check(2, 52, 120, "loneliness_2w", "只有幾天：1至6天"),
  check(2, 100, 120, "loneliness_2w", "幾乎每天：12至14天"),
  check(2, 20, 134, "depressed_2w", "完全沒有"),
  check(2, 52, 134, "depressed_2w", "只有幾天：1至6天"),
  check(2, 100, 134, "depressed_2w", "幾乎每天：12至14天"),
  check(2, 20, 148, "loss_interest_2w", "完全沒有"),
  check(2, 52, 148, "loss_interest_2w", "只有幾天：1至6天"),
  check(2, 100, 148, "loss_interest_2w", "幾乎每天：12至14天"),
  check(2, 20, 164, "service_willingness", "關懷服務"),
  check(2, 52, 164, "service_willingness", "送餐服務"),
  check(2, 84, 164, "service_willingness", "轉介：長照"),
  check(2, 116, 164, "service_willingness_flag", "無"),

  check(2, 220, 30, "mental_status", "在訪談過程中，長者有提到自殺意念"),
  check(2, 220, 42, "mental_status", "無特殊情形"),
  check(2, 220, 58, "self_care_flag", "可以"),
  check(2, 248, 58, "self_care_flag", "可以，但行動緩慢"),
  check(2, 300, 58, "self_care_flag", "不可以"),
  check(2, 220, 72, "self_care_observation", "需要別人幫助才能移動"),
  check(2, 290, 72, "self_care_observation", "身上有異味(例如尿騷味)"),
  check(2, 220, 84, "self_care_observation", "使用器具(例如輪椅、拐杖)就可以自行移動"),
  check(2, 220, 102, "home_hygiene_issues", "環境物品十分髒亂"),
  check(2, 270, 102, "home_hygiene_issues", "以上均無"),
  check(2, 220, 118, "home_safety_issues", "電線裸露"),
  check(2, 250, 118, "home_safety_issues", "未裝設住宅用火災警報器"),
  check(2, 310, 118, "home_safety_issues", "以上均無"),

  { kind: "computed_check", page: 2, x: 220, y: 250, color: "橘" },
  { kind: "computed_check", page: 2, x: 250, y: 250, color: "黃" },
  { kind: "computed_check", page: 2, x: 280, y: 250, color: "綠" },
  text(2, 220, 264, ["overlay_high_care_summary"], { w: 170, fontSize: 7 }),
];

export function overlayDerivedFields(
  answers: MohwLifeCareAnswers,
  highCare: HighCareEvaluation,
  meta?: { caseCode?: string },
): Record<string, string> {
  const visitDate = String(answers.visit_date ?? "");
  const yearMatch = visitDate.match(/^(\d{4})/);
  const monthMatch = visitDate.match(/^\d{4}-(\d{2})/) ?? visitDate.match(/\/(\d{1,2})\//);
  const rocYear = yearMatch ? String(Number(yearMatch[1]) - 1911) : "";
  const month = monthMatch ? String(Number(monthMatch[1])) : "";

  return {
    overlay_year: rocYear,
    overlay_month: month,
    overlay_case_code: meta?.caseCode ?? "",
    overlay_high_care_summary: highCare.triggered
      ? `高關懷 ${highCare.colors.join("、")}：${highCare.triggers.map((item) => item.label).join("、")}`
      : "未觸發",
  };
}

export function answerHasValue(raw: MohwLifeCareAnswers[string], expected: string) {
  if (raw == null || raw === "") return false;
  const tokens = Array.isArray(raw)
    ? raw.map(String)
    : String(raw)
        .split(/[;；、]/)
        .map((item) => item.trim());
  return tokens.some((token) => token === expected || token.includes(expected) || expected.includes(token));
}

export function joinOverlayText(answers: Record<string, unknown>, keys: string[], separator = "") {
  return keys
    .map((key) => {
      const value = answers[key];
      if (Array.isArray(value)) return value.join("、");
      return value == null ? "" : String(value);
    })
    .filter((value) => value.trim().length > 0)
    .join(separator);
}
