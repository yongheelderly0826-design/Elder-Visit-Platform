import type { GovernmentFormField } from "@/lib/domain/government-forms";

export type CareFormAnswerValue = string | string[];
export type CareFormAnswers = Record<string, CareFormAnswerValue>;

export type CareFormCompletionSection = {
  title: string;
  completed: number;
  required: number;
  missingLabels: string[];
};

export type CareFormCompletion = {
  completed: number;
  required: number;
  percent: number;
  sections: CareFormCompletionSection[];
  missingLabels: string[];
};

const interactionOptions = ["從未", "每月少於1次", "每個月1次", "每個月2-3次", "每周1次", "每周2-6次", "每天"];
const moodOptions = ["完全沒有", "只有幾天", "一半以上天數", "幾乎每天"];

export const newTaipeiCareFormSections = [
  {
    title: "一、獨居老人基本資料",
    fields: [
      field("name", "姓名", "text", true, true),
      field("gender", "性別", "single_choice", true, false, ["男", "女", "其他"]),
      field("birth_date", "出生年月日", "date", true, true),
      field("national_id", "身分證字號", "text", true, true),
      field("phone", "電話號碼", "text", false, true),
      field("mobile", "手機號碼", "text", false, true),
      field("line_id", "Line ID", "text", false, true),
      field("emergency_contact", "緊急聯絡人", "text", false, true),
      field("household_address", "戶籍地址", "address", true, true),
      field("living_address", "居住地址", "address", true, true),
    ],
  },
  {
    title: "二、居住與家庭支持",
    fields: [
      field("housing_type", "住宅類型", "single_choice", false, false, [
        "電梯大樓",
        "有電梯公寓",
        "無電梯公寓",
        "平房",
        "其他",
      ]),
      field("living_status", "居住狀況", "single_choice", true, true, [
        "與他人同住",
        "1人獨自居住",
        "同住配偶年滿65歲",
        "同住者無照顧能力",
      ]),
      field("education", "教育程度", "single_choice", false, false, [
        "不識字",
        "識字",
        "小學",
        "初中",
        "高中職",
        "專科以上",
      ]),
      field("marital_status", "婚姻狀況", "single_choice", false, false, [
        "有配偶或同居",
        "喪偶",
        "離婚或分居",
        "未婚",
        "其他",
      ]),
      field("children_status", "子女狀況", "text", false, true),
      field("family_interaction", "與親友互動", "single_choice", false, false, interactionOptions),
      field("neighbor_interaction", "與鄰居互動", "single_choice", false, false, interactionOptions),
      field("help_sources", "求助或商量對象", "multi_choice", false, true, [
        "無",
        "家人",
        "朋友",
        "鄰居",
        "社工",
        "村里長",
        "社區志工",
        "大廈管理員",
        "其他",
      ]),
    ],
  },
  {
    title: "三、身體狀況",
    fields: [
      field("health_self_rating", "目前健康狀況", "single_choice", true, true, [
        "很好",
        "還算好",
        "普通",
        "不太好",
        "很不好",
      ]),
      field("height_cm", "身高", "number", false, true),
      field("weight_kg", "體重", "number", false, true),
      field("weight_change_3m", "近三個月體重變化", "single_choice", false, true, [
        "無改變",
        "減輕1-3公斤",
        "減輕3公斤以上",
        "增加",
        "不知道",
      ]),
      field("appetite_3m", "過去三個月食慾", "single_choice", false, true, [
        "嚴重食慾不佳",
        "中度食慾不佳",
        "無變化",
      ]),
      field("diseases", "疾病項目", "multi_choice", false, true, [
        "心臟病",
        "中風",
        "高血壓",
        "糖尿病",
        "骨與關節疾病",
        "癌症",
        "失智症",
        "其他",
        "以上均無",
      ]),
      field("recent_medical_event", "最近三個月住院、手術或急診", "single_choice", false, true, [
        "否",
        "是",
      ]),
      field("hearing_issue", "是否重聽", "single_choice", false, true, ["否", "是"]),
      field("vision_issue", "是否視力不好", "single_choice", false, true, ["否", "是"]),
    ],
  },
  {
    title: "四、生活困難、情緒與活動",
    fields: [
      field("life_difficulties", "最近三個月生活困難", "multi_choice", false, true, [
        "無",
        "三餐無法溫飽",
        "無人協助就醫",
        "租屋困難",
        "記憶力不好",
        "交通不方便",
        "其他",
      ]),
      field("worries", "最近三個月煩惱事情", "multi_choice", false, true, [
        "無",
        "自己受傷或疾病",
        "親人受傷或疾病",
        "親人離世",
        "經濟問題",
        "被詐騙",
        "子女或孫子女問題",
        "其他",
      ]),
      field("information_channels", "日常生活訊息管道", "multi_choice", false, false, [
        "電視",
        "報紙",
        "廣播",
        "網路",
        "村里長",
        "親友或鄰里",
        "社群媒體",
        "其他",
        "以上均無",
      ]),
      field("home_safety_feeling", "在家中是否感到安全", "single_choice", false, true, [
        "很安全",
        "大致安全",
        "有些不安全",
        "很不安全",
      ]),
      field("loneliness_2w", "過去兩周是否覺得寂寞", "single_choice", false, true, moodOptions),
      field("depressed_2w", "過去兩周是否情緒低落", "single_choice", false, true, moodOptions),
      field("loss_interest_2w", "過去兩周是否失去興趣", "single_choice", false, true, moodOptions),
      field("service_willingness", "接受其他服務意願", "multi_choice", false, true, [
        "無",
        "社區據點",
        "關懷服務",
        "電話問安",
        "送餐服務",
        "緊急救援裝置",
        "轉介長照",
        "其他",
      ]),
    ],
  },
  {
    title: "五、訪查員觀察題",
    fields: [
      field("suicide_ideation_observed", "是否提到自殺意念", "single_choice", true, true, [
        "無特殊情形",
        "有提到自殺意念",
      ]),
      field("self_care_observation", "自我照顧情形", "multi_choice", false, true, [
        "可以",
        "可以但行動緩慢",
        "需要別人幫助才能移動",
        "衣物不乾淨",
        "身上有異味",
        "使用器具可自行移動",
        "其他",
      ]),
      field("home_hygiene_issues", "居家環境衛生問題", "multi_choice", false, true, [
        "環境髒亂",
        "衣著不符季節",
        "食品雜置或蟲害",
        "通風不良",
        "其他",
        "以上均無",
        "無法觀察",
      ]),
      field("home_safety_issues", "居家環境安全問題", "multi_choice", false, true, [
        "電線裸露",
        "照明不足",
        "未裝火災警報器",
        "多個電器共用插座",
        "熱水器室內且不通風",
        "爐火周圍堆放可燃物",
        "動線囤積雜物",
        "其他",
        "以上均無",
        "無法觀察",
      ]),
      field("special_color_result", "特殊題項結果（系統計算，勿手選）", "single_choice", false, true, [
        "橘色",
        "黃色",
        "綠色",
        "未觸發",
      ]),
      field("system_entry_confirmed", "本頁採系統登錄", "single_choice", true, false, [
        "是",
        "否",
      ]),
    ],
  },
];

export function createInitialCareFormAnswers(): CareFormAnswers {
  return {
    system_entry_confirmed: "是",
    special_color_result: "未觸發",
  };
}

export const newTaipeiCareFormSampleAnswers: CareFormAnswers = {
  name: "吳秀枝",
  gender: "女",
  birth_date: "1942-03-18",
  national_id: "F123456789",
  phone: "02-2222-0001",
  mobile: "0912-345-678",
  line_id: "無",
  emergency_contact: "陳美玲，女兒，0912-222-333",
  household_address: "新北市板橋區文化路一段 100 號",
  living_address: "新北市板橋區文化路一段 100 號",
  housing_type: "有電梯公寓",
  living_status: "1人獨自居住",
  education: "小學",
  marital_status: "喪偶",
  children_status: "兒子 1 人，女兒 1 人，女兒同縣市",
  family_interaction: "每周1次",
  neighbor_interaction: "每個月2-3次",
  help_sources: ["家人", "鄰居", "村里長"],
  health_self_rating: "普通",
  height_cm: "155",
  weight_kg: "52",
  weight_change_3m: "無改變",
  appetite_3m: "無變化",
  diseases: ["高血壓", "骨與關節疾病"],
  recent_medical_event: "否",
  hearing_issue: "否",
  vision_issue: "是",
  life_difficulties: ["外出交通不方便"],
  worries: ["自己經濟問題"],
  information_channels: ["電視", "村里長", "親友或鄰里"],
  home_safety_feeling: "大致安全",
  loneliness_2w: "只有幾天",
  depressed_2w: "完全沒有",
  loss_interest_2w: "只有幾天",
  service_willingness: ["電話問安", "關懷服務"],
  suicide_ideation_observed: "無特殊情形",
  self_care_observation: ["可以但行動緩慢", "使用器具可自行移動"],
  home_hygiene_issues: ["以上均無"],
  home_safety_issues: ["照明不足"],
  special_color_result: "黃色",
  system_entry_confirmed: "是",
};

export function calculateCareFormCompletion(answers: CareFormAnswers): CareFormCompletion {
  const sections = newTaipeiCareFormSections.map((section) => {
    const requiredFields = section.fields.filter((fieldItem) => fieldItem.required);
    const missingFields = requiredFields.filter((fieldItem) => !hasAnswer(answers[fieldItem.key]));

    return {
      title: section.title,
      completed: requiredFields.length - missingFields.length,
      required: requiredFields.length,
      missingLabels: missingFields.map((fieldItem) => fieldItem.label),
    };
  });
  const completed = sections.reduce((sum, section) => sum + section.completed, 0);
  const required = sections.reduce((sum, section) => sum + section.required, 0);
  const missingLabels = sections.flatMap((section) => section.missingLabels);

  return {
    completed,
    required,
    percent: required > 0 ? Math.round((completed / required) * 100) : 100,
    sections,
    missingLabels,
  };
}

function hasAnswer(value: CareFormAnswerValue | undefined) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return typeof value === "string" && value.trim().length > 0;
}

function field(
  key: string,
  label: string,
  type: GovernmentFormField["type"],
  required: boolean,
  sensitive: boolean,
  options?: string[],
): GovernmentFormField {
  return { key, label, type, required, sensitive, options };
}
