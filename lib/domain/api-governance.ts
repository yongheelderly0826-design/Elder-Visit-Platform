import type { Capability } from "@/lib/domain/types";

export type ApiRiskLevel = "low" | "medium" | "high";
export type ApiGovernanceStatus = "covered" | "needs_rls" | "planned";

export type ApiEndpointGovernance = {
  key: string;
  method: "GET" | "POST";
  path: string;
  feature: string;
  purpose: string;
  requiredCapabilities: Capability[];
  riskLevel: ApiRiskLevel;
  status: ApiGovernanceStatus;
  dataBoundary: string;
  maintenanceNote: string;
};

export const apiEndpointGovernance: ApiEndpointGovernance[] = [
  {
    key: "cases_get",
    method: "GET",
    path: "/api/cases",
    feature: "名冊管理",
    purpose: "讀取個案名冊、風險等級與派案狀態。",
    requiredCapabilities: ["cases.read"],
    riskLevel: "high",
    status: "needs_rls",
    dataBoundary: "workspace_id + cases.read",
    maintenanceNote: "正式資料庫需依 workspace_id 過濾，避免跨工作空間讀取名冊。",
  },
  {
    key: "cases_post",
    method: "POST",
    path: "/api/cases",
    feature: "名冊管理",
    purpose: "更新個案狀態，例如送稽核、結案。",
    requiredCapabilities: ["cases.update"],
    riskLevel: "high",
    status: "needs_rls",
    dataBoundary: "workspace_id + cases.update",
    maintenanceNote: "狀態變更需寫入 case_status_logs 與 workspace_activity_logs。",
  },
  {
    key: "assignments_post",
    method: "POST",
    path: "/api/assignments",
    feature: "派案管理",
    purpose: "確認 AI 或規則產生的派案建議。",
    requiredCapabilities: ["assignment.confirm"],
    riskLevel: "high",
    status: "needs_rls",
    dataBoundary: "workspace_id + assignment.confirm",
    maintenanceNote: "需記錄確認者、確認時間、人工覆核原因與 AI 信心資訊。",
  },
  {
    key: "audit_decision",
    method: "POST",
    path: "/api/audit/decision",
    feature: "稽核佇列",
    purpose: "核准或退回訪查紀錄。",
    requiredCapabilities: ["audit.approve", "audit.reject"],
    riskLevel: "high",
    status: "needs_rls",
    dataBoundary: "workspace_id + audit decision capability",
    maintenanceNote: "核准寫入 GAS audit.decide；通過後關懷表改已稽核，方可進入匯出批次。",
  },
  {
    key: "payments_lock",
    method: "POST",
    path: "/api/payments/lock",
    feature: "核銷管理",
    purpose: "鎖定核銷草稿金額。",
    requiredCapabilities: ["payments.lock"],
    riskLevel: "high",
    status: "needs_rls",
    dataBoundary: "workspace_id + payments.lock",
    maintenanceNote: "金額鎖定後需限制修改，解鎖需更高權限與原因。",
  },
  {
    key: "exports_create",
    method: "POST",
    path: "/api/exports/create",
    feature: "匯出報表",
    purpose: "依同意治理與方案限制建立匯出內容。",
    requiredCapabilities: ["exports.create"],
    riskLevel: "high",
    status: "needs_rls",
    dataBoundary: "workspace_id + consent scope + exports.create",
    maintenanceNote: "匯出前需檢查用途、同意範圍、遮罩欄位與方案限制。",
  },
  {
    key: "users_post",
    method: "POST",
    path: "/api/users",
    feature: "使用者管理",
    purpose: "審核註冊申請，建立工作空間成員資格。",
    requiredCapabilities: ["users.review"],
    riskLevel: "high",
    status: "needs_rls",
    dataBoundary: "workspace_id + users.review",
    maintenanceNote: "審核通過後需寫入 workspace_memberships 與 permission logs。",
  },
  {
    key: "workspace_settings",
    method: "POST",
    path: "/api/workspace/settings",
    feature: "系統設定",
    purpose: "儲存工作空間設定與贊助企業露出設定。",
    requiredCapabilities: ["workspace.update", "sponsors.manage"],
    riskLevel: "high",
    status: "needs_rls",
    dataBoundary: "workspace_id + settings capability",
    maintenanceNote: "正式版需拆分 workspace_settings、sponsor_exposure_settings 與 activity logs。",
  },
  {
    key: "notifications",
    method: "POST",
    path: "/api/notifications",
    feature: "異常通報",
    purpose: "處理異常事件、通知督導或標記結案。",
    requiredCapabilities: ["notifications.manage", "notifications.send"],
    riskLevel: "medium",
    status: "needs_rls",
    dataBoundary: "workspace_id + notifications capability",
    maintenanceNote: "對外通知屬代表性溝通，正式發送前要有明確授權與紀錄。",
  },
  {
    key: "attendance_clock",
    method: "POST",
    path: "/api/attendance/clock",
    feature: "志工出勤",
    purpose: "外勤掃 QR 或公所刷身分證完成簽到退。",
    requiredCapabilities: ["attendance.clock", "attendance.manage"],
    riskLevel: "high",
    status: "covered",
    dataBoundary: "visitor_id cookie 或承辦刷證 + 身分證字號",
    maintenanceNote: "公所刷證需承辦登入；外勤需先 identify。簽退必須寫回同一筆出勤。",
  },
  {
    key: "attendance_export",
    method: "GET",
    path: "/api/attendance/export",
    feature: "志工出勤月結",
    purpose: "匯出含身分證與出勤時數的月結 Excel。",
    requiredCapabilities: ["attendance.manage"],
    riskLevel: "high",
    status: "covered",
    dataBoundary: "workspace 出勤紀錄 + attendance.manage",
    maintenanceNote: "檔案含身分證字號，僅供承辦匯入既有系統。",
  },
  {
    key: "kpi_get",
    method: "GET",
    path: "/api/kpi",
    feature: "KPI 成果",
    purpose: "讀取成果指標與追蹤提醒。",
    requiredCapabilities: ["kpi.read"],
    riskLevel: "medium",
    status: "covered",
    dataBoundary: "workspace_id + kpi.read",
    maintenanceNote: "接 Supabase 後需改讀 kpi_reports，避免跨專案彙總。",
  },
  {
    key: "system_status",
    method: "GET",
    path: "/api/system/status",
    feature: "系統狀態",
    purpose: "檢查資料來源模式、Supabase 環境與 log tiering。",
    requiredCapabilities: ["system.read"],
    riskLevel: "medium",
    status: "covered",
    dataBoundary: "system.read",
    maintenanceNote: "不要回傳 secret，只顯示是否已設定。",
  },
];

export function getApiGovernanceSummary() {
  return {
    total: apiEndpointGovernance.length,
    highRisk: apiEndpointGovernance.filter((api) => api.riskLevel === "high").length,
    covered: apiEndpointGovernance.filter((api) => api.status === "covered").length,
    needsRls: apiEndpointGovernance.filter((api) => api.status === "needs_rls").length,
  };
}
