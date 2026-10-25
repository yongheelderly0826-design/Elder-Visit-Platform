/**
 * 關懷表建檔（desk）問卷預設值。
 * 來源：生活關懷表檔案說明範本「填寫範本」第 1 筆示範列（已扣除個資／戶籍／訪查人／訪視時間）。
 * 居住地址類型預設「未住戶籍地址」＋居住說明「居住地址不詳」。
 */
import type { ElderCase, VisitSchedule } from "@/lib/domain/types";
import type { MohwLifeCareAnswers } from "@/lib/domain/mohw-life-care-form";
import { createInitialMohwAnswers } from "@/lib/domain/mohw-life-care-ui";

export const MOHW_DESK_FORM_DEFAULTS_SOURCE =
  "生活關懷表檔案說明範本(3).xlsx／填寫範本 第1筆";

export const MOHW_DESK_FORM_DEFAULTS: MohwLifeCareAnswers = {
  "visit_status": "已完成",
  "visit_notes": "首訪",
  "housing_type": "電梯大樓",
  "living_status": "與他人同住",
  "cohabitation_status": "同住者有照顧能力",
  "cohabitant_relation": "兒子",
  "cohabitant_age": "45",
  "education": "小學",
  "marital_status": "有配偶或同居",
  "has_children": "存",
  "sons_count": "1",
  "daughters_count": "1",
  "children_same_city": "是",
  "health_self_rating": "還算好",
  "height_cm": "165",
  "weight_kg": "60",
  "weight_change_3m": "無改變",
  "appetite_3m": "無變化",
  "diseases": [
    "高血壓",
    "糖尿病"
  ],
  "recent_medical_event": "是",
  "recent_medical_note": "受傷",
  "hearing_issue": "是",
  "hearing_aid": "是",
  "vision_issue": "否",
  "family_interaction": "每周1次",
  "neighbor_interaction": "每天",
  "life_difficulties_flag": "有",
  "life_difficulties": [
    "租屋困難",
    "最近記憶力不好"
  ],
  "worries_flag": "有",
  "worries": [
    "自己受傷或疾病"
  ],
  "help_sources_flag": "有",
  "help_sources_has": [
    "家人",
    "其他"
  ],
  "help_sources_has_other": "網友",
  "information_channels": [
    "電視",
    "親友或鄰里"
  ],
  "past_activities": [
    "參與宗教活動"
  ],
  "desired_activities": [
    "健身運動"
  ],
  "home_safety_feeling": "大致安全",
  "loneliness_2w": "完全沒有",
  "depressed_2w": "完全沒有",
  "loss_interest_2w": "完全沒有",
  "service_willingness_flag": "有",
  "service_willingness": [
    "關懷服務",
    "送餐服務"
  ],
  "mental_status": "無特殊情形",
  "self_care_flag": "可以",
  "home_hygiene_issues": [
    "以上均無"
  ],
  "home_safety_issues": [
    "照明設備不足(如夜起時)",
    "未裝設住宅用火災警報器"
  ],
  "consent_personal_data": "同意",
  "consent_health_db": "同意",
  "consent_signature": "是",
  living_address_type: "未住戶籍地址",
  living_address_note: "居住地址不詳",
};

/** 建檔初始答案：範本問卷預設 + 個案個資／戶籍；居住地預設未住戶籍＋地址不詳。 */
export function createMohwDeskInitialAnswers(
  elderCase: ElderCase,
  schedule: VisitSchedule,
): MohwLifeCareAnswers {
  const fromCase = createInitialMohwAnswers(elderCase, schedule);
  return {
    ...MOHW_DESK_FORM_DEFAULTS,
    ...fromCase,
    living_address_type: "未住戶籍地址",
    living_address_note: "居住地址不詳",
    living_city: "",
    living_district: "",
    living_village: "",
    living_address: "",
    living_address_other: "",
    // 建檔預設：無電話／手機用官方 sentinel，可再改
    phone: "0000000000",
    mobile: "0000000000",
    // 出生日期預設民國占位，可再改
    birth_date: "000/00/00",
  };
}
