import type { Capability } from "@/lib/domain/types";

export type GovernanceOperation = "read" | "create" | "update" | "delete" | "approve" | "export";

export type FeatureDataGovernance = {
  key: string;
  group: "日常工作" | "訪查營運" | "治理與權限" | "系統設定";
  feature: string;
  dataScope: string;
  editableFields: string[];
  restrictedFields: string[];
  operations: Partial<Record<GovernanceOperation, Capability[]>>;
  governanceNote: string;
};

export const featureDataGovernance: FeatureDataGovernance[] = [
  {
    key: "cases",
    group: "訪查營運",
    feature: "名冊管理",
    dataScope: "長者姓名、電話、地址、行政區、風險等級、案件狀態",
    editableFields: ["姓名", "電話", "地址", "行政區", "風險等級", "案件狀態", "備註"],
    restrictedFields: ["身分證字號", "精準定位", "醫療診斷", "敏感家戶狀態"],
    operations: {
      read: ["cases.read"],
      create: ["cases.create", "cases.import"],
      update: ["cases.update"],
      delete: ["cases.delete"],
      export: ["exports.create"],
    },
    governanceNote: "刪除應採封存或停用，正式刪除需留存稽核紀錄。",
  },
  {
    key: "assignments",
    group: "訪查營運",
    feature: "派案管理",
    dataScope: "訪員、案件、訪查日期、派案原因、推薦分數",
    editableFields: ["訪員", "訪查日期", "派案狀態", "派案原因", "覆核備註"],
    restrictedFields: ["AI 推薦原始權重", "訪員私人聯絡資訊"],
    operations: {
      read: ["assignment.manage"],
      create: ["assignment.create"],
      update: ["assignment.update"],
      delete: ["assignment.delete"],
      approve: ["assignment.confirm"],
    },
    governanceNote: "AI 推薦只能輔助，人工確認需記錄決策者與原因。",
  },
  {
    key: "visits",
    group: "日常工作",
    feature: "訪查紀錄 / 政府生活關懷表",
    dataScope: "訪查結果、健康觀察、生活支持、政府關懷表欄位、同意範圍、簽名、照片、GPS",
    editableFields: ["訪查結果", "政府關懷表欄位", "健康觀察", "生活支持", "同意範圍", "補充紀錄", "附件"],
    restrictedFields: ["簽名", "GPS", "照片", "個案敏感備註"],
    operations: {
      read: ["visits.read"],
      create: ["visits.submit"],
      update: ["visits.update"],
      delete: ["visits.delete"],
      approve: ["audit.approve"],
    },
    governanceNote: "送出後修改需保留版本紀錄；簽名與 GPS 不應被一般管理者任意改寫。",
  },
  {
    key: "government_forms",
    group: "治理與權限",
    feature: "政府表單與同意書模板",
    dataScope: "生活關懷表欄位、個資同意書、社政保密同意書、民政保密同意書、欄位敏感度與版本",
    editableFields: ["表單名稱", "版本", "欄位", "選項", "必填設定", "敏感資料標記", "保存說明"],
    restrictedFields: ["已簽署同意紀錄", "已送出訪查紀錄", "訪查人員身分證字號"],
    operations: {
      read: ["forms.manage"],
      create: ["forms.manage"],
      update: ["forms.manage"],
      delete: ["forms.manage"],
      approve: ["forms.manage"],
    },
    governanceNote: "表單版本變更不得改寫既有填答紀錄，正式上線需以版本鎖定方式保存。",
  },
  {
    key: "audit",
    group: "訪查營運",
    feature: "稽核與補件",
    dataScope: "檢核結果、阻擋項目 / 提醒項目、主管決策、退回原因",
    editableFields: ["稽核狀態", "主管備註", "退回原因", "提醒項目覆核說明"],
    restrictedFields: ["自動檢核規則結果", "原始訪查資料"],
    operations: {
      read: ["audit.run"],
      update: ["audit.run"],
      approve: ["audit.approve", "audit.reject"],
    },
    governanceNote: "核准、退回、覆寫提醒項目都應產生不可竄改紀錄。",
  },
  {
    key: "payments",
    group: "訪查營運",
    feature: "核銷批次",
    dataScope: "核銷批次、計算規則、金額、鎖定狀態",
    editableFields: ["批次名稱", "計算條件", "核銷狀態", "鎖定備註"],
    restrictedFields: ["已鎖定金額", "已核准批次明細"],
    operations: {
      read: ["payments.calculate"],
      create: ["payments.calculate"],
      update: ["payments.calculate"],
      approve: ["payments.lock", "payments.unlock"],
      export: ["exports.create"],
    },
    governanceNote: "金額鎖定後只能由高權限解鎖，且需記錄理由。",
  },
  {
    key: "exports",
    group: "訪查營運",
    feature: "成果匯出",
    dataScope: "政府報表、匿名 KPI、核銷明細、贊助成果",
    editableFields: ["匯出用途", "資料期間", "欄位模板", "匿名化選項"],
    restrictedFields: ["個資欄位", "未取得同意用途", "原始照片與簽名"],
    operations: {
      create: ["exports.create"],
      delete: ["exports.delete"],
    },
    governanceNote: "匯出前需檢查同意範圍與用途，不符合時遮罩或移除欄位。",
  },
  {
    key: "users",
    group: "治理與權限",
    feature: "使用者與註冊審核",
    dataScope: "帳號、姓名、Email、角色、申請工作空間、審核狀態",
    editableFields: ["姓名", "Email", "角色", "狀態", "審核備註"],
    restrictedFields: ["密碼", "登入權杖", "第三方 OAuth 識別"],
    operations: {
      read: ["users.manage"],
      create: ["users.create"],
      update: ["users.update"],
      delete: ["users.delete"],
      approve: ["users.review"],
    },
    governanceNote: "使用者刪除建議先停用，保留歷史操作責任歸屬。",
  },
  {
    key: "permissions",
    group: "治理與權限",
    feature: "角色權限",
    dataScope: "角色、權限、成員授權、能力矩陣",
    editableFields: ["角色名稱", "角色說明", "權限項目", "成員角色"],
    restrictedFields: ["工作空間擁有者保底權限", "系統必要權限"],
    operations: {
      read: ["permissions.manage"],
      update: ["permissions.manage"],
      approve: ["permissions.manage"],
    },
    governanceNote: "改權限需留下變更者、變更前後差異與生效時間。",
  },
  {
    key: "sponsors",
    group: "系統設定",
    feature: "贊助企業聯名",
    dataScope: "企業名稱、簡稱、企業 LOGO 圖片、備援文字、主色、合作期間、露出位置",
    editableFields: ["企業全名", "顯示簡稱", "產業", "支持內容", "企業 LOGO 圖片", "備援文字", "主色", "期間", "露出位置"],
    restrictedFields: ["合約金額", "個案名單", "可識別成果明細"],
    operations: {
      read: ["sponsors.manage"],
      create: ["sponsors.create"],
      update: ["sponsors.update"],
      delete: ["sponsors.delete"],
      approve: ["sponsors.manage"],
    },
    governanceNote: "贊助露出不得靠近個資與同意書欄位，成果只用彙整或匿名資料。",
  },
  {
    key: "workspace",
    group: "系統設定",
    feature: "工作空間設定",
    dataScope: "藍圖、模組、責任歸屬、日誌保留、可恢復停用",
    editableFields: ["啟用模組", "責任單位", "責任人", "保險資訊", "服務聲明", "保留天數"],
    restrictedFields: ["藍圖綁定原始紀錄", "刪除後恢復期限"],
    operations: {
      read: ["workspace.manage"],
      update: ["workspace.update"],
      delete: ["workspace.soft_delete"],
      approve: ["workspace.manage"],
    },
    governanceNote: "停用不是立即刪除，需提供恢復期限與資料封存紀錄。",
  },
  {
    key: "engines",
    group: "治理與權限",
    feature: "流程引擎",
    dataScope: "狀態機、核銷規則、稽核檢核、通知規則",
    editableFields: ["流程狀態", "轉換條件", "檢核規則", "通知規則"],
    restrictedFields: ["已套用歷史版本", "已鎖定核銷規則"],
    operations: {
      read: ["engines.manage"],
      update: ["engines.manage"],
      approve: ["engines.manage"],
    },
    governanceNote: "規則變更需版本化，不能回頭改寫已完成的流程判斷。",
  },
  {
    key: "notifications",
    group: "訪查營運",
    feature: "通報通知 / 工作群組訊息",
    dataScope: "事件類型、通報對象、公告內容、群組或個別收件者、已讀未讀、回覆紀錄、LINE 轉發狀態",
    editableFields: ["事件狀態", "處理備註", "通知對象", "通知模板", "公告標題", "公告內容", "收件群組", "收件個人", "有效期限"],
    restrictedFields: ["外部通訊紀錄", "緊急通報個資", "LINE userId 對應", "個別私訊內容"],
    operations: {
      read: ["notifications.manage"],
      update: ["notifications.manage"],
      approve: ["notifications.send"],
    },
    governanceNote: "對外通知屬代表性溝通，正式發送前需明確授權。",
  },
  {
    key: "attendance",
    group: "訪查營運",
    feature: "志工出勤簽到",
    dataScope: "志工姓名、身分證字號、組別、簽到退時間、地點、出勤時數",
    editableFields: ["組別", "志工名冊", "出勤地點 QR"],
    restrictedFields: ["身分證字號", "出勤原始時間戳"],
    operations: {
      read: ["attendance.manage"],
      create: ["attendance.clock", "attendance.manage"],
      update: ["attendance.manage"],
      export: ["attendance.manage"],
    },
    governanceNote: "月結 Excel 含身分證字號，僅供承辦匯入既有出勤系統，不得外流。",
  },
];

export const governanceOperationLabels: Record<GovernanceOperation, string> = {
  read: "查看",
  create: "新增",
  update: "修改",
  delete: "刪除",
  approve: "審核 / 核准",
  export: "匯出",
};
