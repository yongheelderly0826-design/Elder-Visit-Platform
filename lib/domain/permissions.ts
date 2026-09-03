import { currentAccount, getCurrentWorkspace } from "@/lib/domain/mock-data";
import type {
  Capability,
  DemoLoginAccount,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceRoleKey,
} from "@/lib/domain/types";

export const capabilityLabels: Record<Capability, string> = {
  "dashboard.read": "查看總覽",
  "kpi.read": "查看 KPI",
  "workspace.manage": "管理工作空間",
  "workspace.update": "修改工作空間",
  "workspace.soft_delete": "停用 / 可恢復刪除工作空間",
  "permissions.manage": "管理角色權限",
  "users.manage": "管理使用者",
  "users.create": "新增使用者",
  "users.update": "修改使用者",
  "users.delete": "刪除 / 停用使用者",
  "users.review": "審核註冊申請",
  "cases.read": "查看名冊",
  "cases.create": "新增名冊",
  "cases.update": "修改名冊",
  "cases.delete": "刪除 / 封存名冊",
  "cases.import": "匯入名冊",
  "assignment.manage": "管理派案",
  "assignment.create": "新增派案",
  "assignment.update": "修改派案",
  "assignment.delete": "取消派案",
  "assignment.confirm": "確認派案",
  "visits.read": "查看訪查紀錄",
  "visits.submit": "填報訪查",
  "visits.update": "修改訪查紀錄",
  "visits.delete": "刪除 / 作廢訪查紀錄",
  "audit.run": "執行稽核",
  "audit.approve": "核准稽核",
  "audit.reject": "退回稽核",
  "payments.calculate": "計算核銷",
  "payments.lock": "鎖定核銷",
  "payments.unlock": "解鎖核銷",
  "exports.create": "建立匯出",
  "exports.delete": "刪除匯出",
  "forms.manage": "管理政府表單",
  "consent.manage": "管理同意治理",
  "engines.manage": "管理流程引擎",
  "notifications.manage": "管理通報事件",
  "notifications.send": "發送通報",
  "pricing.manage": "管理方案限制",
  "sponsors.manage": "管理贊助聯名設定",
  "sponsors.create": "新增贊助企業",
  "sponsors.update": "修改贊助企業",
  "sponsors.delete": "刪除贊助企業",
  "system.read": "查看系統狀態",
  "onboarding.publish": "發布初始化設定",
  "attendance.clock": "志工掃碼簽到退",
  "attendance.manage": "管理志工出勤與月結",
};

export const workspaceRoles: WorkspaceRole[] = [
  {
    key: "workspace_owner",
    label: "工作空間擁有者",
    description: "最高權限，可管理成員、權限、設定與所有資料流程。",
    capabilities: Object.keys(capabilityLabels) as Capability[],
  },
  {
    key: "workspace_manager",
    label: "承辦管理者",
    description: "管理名冊、派案、稽核、核銷、匯出與工作空間設定。",
    capabilities: [
      "dashboard.read",
      "kpi.read",
      "workspace.manage",
      "workspace.update",
      "workspace.soft_delete",
      "permissions.manage",
      "users.manage",
      "users.create",
      "users.update",
      "users.delete",
      "users.review",
      "cases.read",
      "cases.create",
      "cases.update",
      "cases.delete",
      "cases.import",
      "assignment.manage",
      "assignment.create",
      "assignment.update",
      "assignment.delete",
      "assignment.confirm",
      "visits.read",
      "visits.update",
      "visits.delete",
      "audit.run",
      "audit.approve",
      "audit.reject",
      "payments.calculate",
      "payments.lock",
      "payments.unlock",
      "exports.create",
      "exports.delete",
      "forms.manage",
      "consent.manage",
      "engines.manage",
      "notifications.manage",
      "notifications.send",
      "pricing.manage",
      "sponsors.manage",
      "sponsors.create",
      "sponsors.update",
      "sponsors.delete",
      "system.read",
      "onboarding.publish",
      "attendance.clock",
      "attendance.manage",
    ],
  },
  {
    key: "supervisor",
    label: "督導",
    description: "覆核訪查資料、處理提醒項目、核准或退回稽核。",
    capabilities: [
      "dashboard.read",
      "kpi.read",
      "cases.read",
      "visits.read",
      "audit.run",
      "audit.approve",
      "audit.reject",
      "payments.calculate",
      "exports.create",
      "attendance.manage",
    ],
  },
  {
    key: "visitor",
    label: "訪員",
    description: "查看自己的訪查任務並送出訪查表，外勤可掃 QR 簽到退。",
    capabilities: [
      "dashboard.read",
      "visits.read",
      "visits.submit",
      "visits.update",
      "attendance.clock",
    ],
  },
  {
    key: "auditor",
    label: "稽核人員",
    description: "執行檢核與查看稽核佇列，但不可最終核准。",
    capabilities: ["dashboard.read", "cases.read", "visits.read", "audit.run", "audit.reject"],
  },
  {
    key: "viewer",
    label: "唯讀檢視者",
    description: "只能查看總覽、名冊與成果，不可更改資料。",
    capabilities: ["dashboard.read", "kpi.read", "cases.read", "visits.read", "system.read"],
  },
];

export const workspaceMembers: WorkspaceMember[] = [
  {
    id: "member_manager",
    accountId: currentAccount.id,
    fullName: currentAccount.fullName,
    email: currentAccount.email,
    roleKey: "workspace_manager",
    status: "active",
  },
  {
    id: "member_supervisor",
    accountId: "acc_demo_supervisor",
    fullName: "示範督導",
    email: "supervisor@eldervisit.org",
    roleKey: "supervisor",
    status: "active",
  },
  {
    id: "member_visitor",
    accountId: "acc_demo_visitor",
    fullName: "王訪員",
    email: "visitor@eldervisit.org",
    roleKey: "visitor",
    status: "active",
  },
  {
    id: "member_auditor",
    accountId: "acc_demo_auditor",
    fullName: "稽核人員",
    email: "auditor@eldervisit.org",
    roleKey: "auditor",
    status: "active",
  },
];

export const demoLoginAccounts: DemoLoginAccount[] = [
  {
    email: "owner@eldervisit.org",
    password: "owner123",
    fullName: "工作空間擁有者",
    roleKey: "workspace_owner",
    landingPath: "/dashboard",
  },
  {
    email: "manager@eldervisit.org",
    password: "manager123",
    fullName: "示範承辦人",
    roleKey: "workspace_manager",
    landingPath: "/dashboard",
  },
  {
    email: "supervisor@eldervisit.org",
    password: "supervisor123",
    fullName: "示範督導",
    roleKey: "supervisor",
    landingPath: "/manager/audit",
  },
  {
    email: "visitor@eldervisit.org",
    password: "visitor123",
    fullName: "王訪員",
    roleKey: "visitor",
    landingPath: "/visitor/tasks",
  },
  {
    email: "auditor@eldervisit.org",
    password: "auditor123",
    fullName: "稽核人員",
    roleKey: "auditor",
    landingPath: "/manager/audit",
  },
  {
    email: "viewer@eldervisit.org",
    password: "viewer123",
    fullName: "唯讀檢視者",
    roleKey: "viewer",
    landingPath: "/dashboard",
  },
];

export function getRoleByKey(roleKey: WorkspaceRoleKey) {
  return workspaceRoles.find((role) => role.key === roleKey) ?? workspaceRoles[0];
}

export function getCurrentRole(roleKey: WorkspaceRoleKey = "workspace_manager") {
  return getRoleByKey(roleKey);
}

export function getCurrentCapabilities(roleKey: WorkspaceRoleKey = "workspace_manager") {
  return getCurrentRole(roleKey).capabilities;
}

export function can(capability: Capability, roleKey: WorkspaceRoleKey = "workspace_manager") {
  return getCurrentCapabilities(roleKey).includes(capability);
}

export function authenticateDemoAccount(email: string, password: string) {
  return demoLoginAccounts.find(
    (account) =>
      account.email.toLowerCase() === email.toLowerCase() && account.password === password,
  );
}

export function getPermissionOverview() {
  const workspace = getCurrentWorkspace();

  return {
    workspaceId: workspace.id,
    currentRole: getCurrentRole(),
    roles: workspaceRoles,
    members: workspaceMembers,
    demoLoginAccounts,
    capabilityLabels,
  };
}
