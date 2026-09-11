export type GovernmentFormKind =
  | "care_visit"
  | "personal_data_consent"
  | "social_worker_confidentiality"
  | "civil_affairs_confidentiality"
  | "custom";

export type GovernmentFormField = {
  key: string;
  label: string;
  type: "text" | "date" | "single_choice" | "multi_choice" | "number" | "signature" | "address";
  required: boolean;
  sensitive: boolean;
  options?: string[];
};

export type GovernmentFormSection = {
  title: string;
  purpose: string;
  fields: GovernmentFormField[];
};

export type GovernmentFormTemplate = {
  id: string;
  name: string;
  kind: GovernmentFormKind;
  ownerAgency: string;
  version: string;
  sourceFile: string;
  useTiming: string;
  retentionNote: string;
  sections: GovernmentFormSection[];
};

const interactionOptions = ["從未", "每月少於1次", "每個月1次", "每個月2-3次", "每周1次", "每周2-6次", "每天"];
const moodOptions = ["完全沒有", "只有幾天", "一半以上天數", "幾乎每天"];

export const governmentFormTemplates: GovernmentFormTemplate[] = [
  {
    id: "gov_care_visit_115",
    name: "縣(市)政府獨居老人生活關懷表",
    kind: "care_visit",
    ownerAgency: "縣市政府 / 衛生福利部擴大獨居老人服務計畫",
    version: "115-116 年度",
    sourceFile: "縣(市)政府獨居老人生活關懷表.pdf",
    useTiming: "訪員執行生活關懷訪查時填寫，送出後進入稽核與統計。",
    retentionNote: "含健康、家庭、聯絡與生活困難資料，需依個資與社政資料保存政策管理。",
    sections: [
      {
        title: "基本身分與聯絡資料",
        purpose: "辨識受訪長者、聯絡方式、戶籍與實際居住地。",
        fields: [
          field("name", "姓名", "text", true, true),
          field("refused_visit", "拒絕訪查", "single_choice", false, false, ["是", "否"]),
          field("gender", "性別", "single_choice", true, false, ["男", "女", "其他"]),
          field("birth_date", "出生年月日", "date", true, true),
          field("national_id", "身分證字號", "text", true, true),
          field("phone", "電話號碼", "text", false, true),
          field("mobile", "手機號碼", "text", false, true),
          field("line_id", "Line ID", "text", false, true),
          field("emergency_contact", "緊急聯絡人姓名、關係、電話", "text", false, true),
          field("household_address", "戶籍地址", "address", true, true),
          field("living_address", "居住地址", "address", true, true),
        ],
      },
      {
        title: "居住、家庭與社會支持",
        purpose: "判斷是否獨居、同住者照顧能力、親友鄰里支持與求助資源。",
        fields: [
          field("housing_type", "住宅類型", "single_choice", false, false, ["電梯大樓", "有電梯公寓", "有電梯透天樓房", "無電梯公寓", "無電梯透天樓房", "平房", "其他"]),
          field("living_status", "居住狀況", "single_choice", true, true, ["與他人同住", "1人獨自居住", "同住配偶年滿65歲", "同住者無照顧能力"]),
          field("education", "教育程度", "single_choice", false, false, ["不識字", "識字", "小學", "初(國)中", "高中(職)", "專科", "大學", "研究所"]),
          field("marital_status", "婚姻狀況", "single_choice", false, false, ["有配偶或同居", "喪偶", "離婚或分居", "未婚", "其他"]),
          field("children_status", "有無子女及是否同縣市", "text", false, true),
          field("family_interaction", "與親友互動頻率", "single_choice", false, false, interactionOptions),
          field("neighbor_interaction", "與鄰居互動頻率", "single_choice", false, false, interactionOptions),
          field("help_sources", "遇到困難時求助或商量對象", "multi_choice", false, true, ["無", "家人", "朋友", "鄰居", "社工", "村里長", "社區志工", "大廈管理員", "其他"]),
        ],
      },
      {
        title: "身體健康與就醫",
        purpose: "蒐集健康自評、營養變化、疾病、住院急診、聽力與視力狀況。",
        fields: [
          field("health_self_rating", "目前健康狀況自評", "single_choice", false, true, ["很好", "還算好", "普通", "不太好", "很不好"]),
          field("height_cm", "身高", "number", false, true),
          field("weight_kg", "體重", "number", false, true),
          field("weight_change_3m", "近三個月體重變化", "single_choice", false, true, ["無改變", "減輕1-3公斤", "減輕3公斤以上", "增加", "不知道"]),
          field("appetite_3m", "過去三個月食慾狀況", "single_choice", false, true, ["嚴重食慾不佳", "中度食慾不佳", "無變化"]),
          field("diseases", "疾病項目", "multi_choice", false, true, ["心臟病", "中風", "高血壓", "糖尿病", "骨與關節疾病", "癌症", "失智症", "其他", "以上均無"]),
          field("recent_medical_event", "最近三個月住院、手術或急診", "single_choice", false, true, ["否", "是"]),
          field("hearing_issue", "是否重聽及是否佩戴助聽器", "single_choice", false, true, ["否", "是，未佩戴助聽器", "是，有佩戴助聽器"]),
          field("vision_issue", "是否視力不好", "single_choice", false, true, ["否", "是"]),
        ],
      },
      {
        title: "生活困難、情緒與活動",
        purpose: "判斷生活困難、煩惱事件、資訊來源、社會活動與情緒風險。",
        fields: [
          field("life_difficulties", "最近三個月生活困難", "multi_choice", false, true, ["無", "三餐無法溫飽", "無人協助就醫", "租屋困難", "最近記憶力不好", "外出交通不方便", "其他"]),
          field("worries", "最近三個月煩惱事情", "multi_choice", false, true, ["無", "自己受傷或疾病", "親人受傷或疾病", "親人離世", "自己經濟問題", "被詐騙", "子女或孫子女問題", "其他"]),
          field("information_channels", "日常生活訊息管道", "multi_choice", false, false, ["電視", "報紙", "廣播", "網路", "村里長", "親友或鄰里", "社群媒體", "其他", "以上均無"]),
          field("actual_social_activities", "過去三個月實際參與活動", "multi_choice", false, false, ["工作", "擔任志工", "學習新事物", "四處旅遊", "健身運動", "參與宗教活動", "其他", "以上均無"]),
          field("desired_social_activities", "目前特別想做的事", "multi_choice", false, false, ["工作", "擔任志工", "學習新事物", "四處旅遊", "健身運動", "參與宗教活動", "其他", "以上均無"]),
          field("home_safety_feeling", "在家中是否感到安全", "single_choice", false, true, ["很安全", "大致安全", "有些不安全", "很不安全"]),
          field("loneliness_2w", "過去兩周是否覺得寂寞", "single_choice", false, true, moodOptions),
          field("depressed_2w", "過去兩周是否情緒低落或沒有希望", "single_choice", false, true, moodOptions),
          field("loss_interest_2w", "過去兩周是否失去興趣或樂趣", "single_choice", false, true, moodOptions),
          field("service_willingness", "接受其他服務的意願", "multi_choice", false, true, ["無", "參加社區據點", "關懷服務", "電話問安", "送餐服務", "安裝緊急救援裝置", "轉介長照", "轉介身障", "其他服務"]),
        ],
      },
      {
        title: "訪查員觀察與系統判讀",
        purpose: "訪查員依現場觀察填寫精神狀況、自我照顧、居家衛生安全與特殊題項。",
        fields: [
          field("suicide_ideation_observed", "訪談過程是否提到自殺意念", "single_choice", false, true, ["無特殊情形", "有提到自殺意念"]),
          field("self_care_observation", "自我照顧情形", "multi_choice", false, true, ["可以", "可以但行動緩慢", "需要別人幫助才能移動", "衣物不乾淨", "身上有異味", "使用器具可自行移動", "其他"]),
          field("home_hygiene_issues", "居家環境衛生問題", "multi_choice", false, true, ["環境物品十分髒亂", "衣著不符季節", "食品雜置或蟲害", "通風不良", "其他", "以上均無", "無法觀察"]),
          field("home_safety_issues", "居家環境安全問題", "multi_choice", false, true, ["電線裸露", "照明設備不足", "未裝住宅用火災警報器", "多個電器共用插座", "熱水器室內且不通風", "爐火周圍堆放可燃物", "出入動線囤積雜物", "其他", "以上均無", "無法觀察"]),
          field("special_color_result", "特殊題項勾選結果", "single_choice", false, true, ["橘色", "黃色", "綠色", "未觸發"]),
          field("visit_time", "訪查時間", "date", true, false),
          field("system_entry_confirmed", "本頁採系統登錄", "single_choice", false, false, ["是", "否"]),
        ],
      },
    ],
  },
  {
    id: "gov_personal_data_consent_115",
    name: "個人資料蒐集聲明暨同意書",
    kind: "personal_data_consent",
    ownerAgency: "縣市政府 / 衛生福利部",
    version: "115-116 年度",
    sourceFile: "縣(市)政府獨居老人生活關懷表.pdf 第 2 頁",
    useTiming: "訪查前或訪查時取得長者本人簽名、蓋章或手印。",
    retentionNote: "作為個資蒐集、處理、利用與健康資料串聯意願依據，需與訪查紀錄綁定保存。",
    sections: [
      {
        title: "個資蒐集聲明",
        purpose: "告知蒐集目的、資料類型、利用範圍與法規依據。",
        fields: [
          field("consent_person_name", "立書人", "text", true, true),
          field("personal_data_use_consent", "是否同意個資於聲明範圍內使用", "single_choice", true, true, ["同意", "不同意"]),
          field("health_database_link_consent", "是否同意串聯健康資料庫分析使用", "single_choice", true, true, ["同意", "不同意"]),
          field("signature", "本人簽名、蓋章或手印", "signature", true, true),
          field("signed_date", "簽署日期", "date", true, false),
        ],
      },
    ],
  },
  {
    id: "gov_social_worker_confidentiality_115",
    name: "社政訪查人員受訪資訊保密同意書",
    kind: "social_worker_confidentiality",
    ownerAgency: "縣市政府社政單位",
    version: "115-116 年度",
    sourceFile: "縣(市)政府獨居老人生活關懷表.pdf 第 2 頁",
    useTiming: "社政訪查人員參與計畫前簽署。",
    retentionNote: "需與訪查人員帳號、角色、訓練紀錄綁定，離任後仍保留保密責任。",
    sections: [confidentialitySection("社政", ["社會局/處", "社工", "志工", "其他"])],
  },
  {
    id: "gov_civil_affairs_confidentiality_115",
    name: "民政訪查人員受訪資訊保密同意書",
    kind: "civil_affairs_confidentiality",
    ownerAgency: "縣市政府民政單位",
    version: "115-116 年度",
    sourceFile: "縣(市)政府獨居老人生活關懷表.pdf 第 2 頁",
    useTiming: "公所人員、村里長、村里幹事參與訪查前簽署。",
    retentionNote: "需與民政訪查人員身分及計畫年度綁定，作為資料保密稽核依據。",
    sections: [confidentialitySection("民政", ["公所人員", "村里長", "村里幹事"])],
  },
];

export const governmentFormWorkflow = [
  "系統管理者於政府表單管理建立縣市版本模板與欄位",
  "承辦管理者設定本工作空間採用的關懷表與同意書版本",
  "訪員進行訪查前確認個資同意書，必要時取得簽名或手印",
  "訪員依關懷表填寫長者生活、健康、社會支持與居家觀察資料",
  "系統依特殊題項與風險欄位產生提醒，送督導或稽核覆核",
  "社政或民政訪查人員須先完成保密同意書，才能被派案或查看個資",
  "資料進入名冊、稽核、KPI 與政策成果統計，匯出前套用同意治理",
];

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

function confidentialitySection(kindLabel: string, identityOptions: string[]): GovernmentFormSection {
  return {
    title: `${kindLabel}訪查人員保密承諾`,
    purpose: "訪查人員承諾不得洩露、複製、轉讓、再使用或交付訪查期間接觸之個人資料。",
    fields: [
      field("signer_name", "立同意書人", "text", true, true),
      field("identity_type", "身分", "single_choice", true, true, identityOptions),
      field("national_id", "身分證字號", "text", true, true),
      field("phone", "聯絡電話", "text", true, true),
      field("confidentiality_confirmed", "確認遵守保密事項", "single_choice", true, true, ["同意", "不同意"]),
      field("signature", "立同意書人簽名", "signature", true, true),
      field("signed_date", "簽署日期", "date", true, false),
    ],
  };
}
