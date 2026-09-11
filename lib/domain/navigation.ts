import type { ComponentType } from "react";
import {
  BarChart3,
  CalendarCheck2,
  ClipboardList,
  ContactRound,
  FileText,
  FileSignature,
  Files,
  FormInput,
  Home,
  IdCard,
  ListChecks,
  MessageSquareWarning,
  ShieldCheckIcon,
  SearchCheck,
  ShieldCheck,
  SlidersHorizontal,
  ServerCog,
  Map,
  QrCode,
  Timer,
  UserCog,
  UserRound,
  Wallet,
  Workflow,
} from "lucide-react";
import type { Capability, WorkspaceRoleKey } from "@/lib/domain/types";

export type NavKey =
  | "dashboard"
  | "badge"
  | "tasks"
  | "drafts"
  | "payments"
  | "profile"
  | "cases"
  | "assignments"
  | "dailyVisits"
  | "audit"
  | "kpi"
  | "engines"
  | "exports"
  | "forms"
  | "consent"
  | "permissions"
  | "notifications"
  | "sitemap"
  | "system"
  | "workspace"
  | "users"
  | "settings"
  | "clock"
  | "attendance"
  | "visitorConsents";

export type NavItem = {
  key: NavKey;
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  requiredCapabilities: Capability[];
  /** When set, only these roles see the item (capabilities still apply). */
  allowedRoles?: WorkspaceRoleKey[];
  group: "daily" | "operations" | "governance" | "system";
};

/** Pages that belong to the visitor workspace, not manager operations. */
const VISITOR_ONLY: WorkspaceRoleKey[] = ["visitor"];

export const navItems: NavItem[] = [
  {
    key: "dashboard",
    label: "總覽",
    href: "/dashboard",
    icon: Home,
    requiredCapabilities: ["dashboard.read"],
    group: "daily",
  },
  {
    key: "badge",
    label: "訪員證",
    href: "/visitor/home",
    icon: IdCard,
    requiredCapabilities: ["attendance.clock"],
    allowedRoles: VISITOR_ONLY,
    group: "daily",
  },
  {
    key: "tasks",
    label: "任務",
    href: "/visitor/tasks",
    icon: ListChecks,
    requiredCapabilities: ["visits.submit"],
    allowedRoles: VISITOR_ONLY,
    group: "daily",
  },
  {
    key: "drafts",
    label: "草稿",
    href: "/visitor/drafts",
    icon: Files,
    requiredCapabilities: ["visits.submit"],
    allowedRoles: VISITOR_ONLY,
    group: "daily",
  },
  {
    key: "payments",
    label: "核銷",
    href: "/visitor/payments",
    icon: Wallet,
    requiredCapabilities: ["payments.read"],
    allowedRoles: VISITOR_ONLY,
    group: "daily",
  },
  {
    key: "clock",
    label: "出勤簽到",
    href: "/volunteer/clock",
    icon: Timer,
    requiredCapabilities: ["attendance.clock"],
    allowedRoles: VISITOR_ONLY,
    group: "daily",
  },
  {
    key: "profile",
    label: "我的資料",
    href: "/visitor/profile",
    icon: UserRound,
    requiredCapabilities: ["visits.submit"],
    allowedRoles: VISITOR_ONLY,
    group: "daily",
  },
  {
    key: "visitorConsents",
    label: "同意書",
    href: "/visitor/consents",
    icon: FileSignature,
    requiredCapabilities: ["visits.submit"],
    allowedRoles: VISITOR_ONLY,
    group: "daily",
  },
  {
    key: "workspace",
    label: "空間規則",
    href: "/workspace/settings",
    icon: Workflow,
    requiredCapabilities: ["workspace.manage"],
    group: "system",
  },
  {
    key: "cases",
    label: "名冊",
    href: "/manager/cases",
    icon: ContactRound,
    requiredCapabilities: ["cases.read"],
    group: "operations",
  },
  {
    key: "assignments",
    label: "派案",
    href: "/manager/assignments",
    icon: ClipboardList,
    requiredCapabilities: ["assignment.manage"],
    group: "operations",
  },
  {
    key: "dailyVisits",
    label: "每日訪視統計",
    href: "/manager/daily-visits",
    icon: CalendarCheck2,
    requiredCapabilities: ["visits.read"],
    group: "operations",
  },
  {
    key: "attendance",
    label: "志工出勤",
    href: "/manager/attendance",
    icon: QrCode,
    requiredCapabilities: ["attendance.manage"],
    group: "operations",
  },
  {
    key: "audit",
    label: "稽核",
    href: "/manager/audit",
    icon: SearchCheck,
    requiredCapabilities: ["audit.run"],
    group: "operations",
  },
  {
    key: "kpi",
    label: "KPI",
    href: "/manager/kpi",
    icon: BarChart3,
    requiredCapabilities: ["kpi.read"],
    group: "operations",
  },
  {
    key: "engines",
    label: "引擎",
    href: "/manager/engines",
    icon: SlidersHorizontal,
    requiredCapabilities: ["engines.manage"],
    group: "governance",
  },
  {
    key: "exports",
    label: "匯出",
    href: "/manager/exports",
    icon: FileText,
    requiredCapabilities: ["exports.create"],
    group: "operations",
  },
  {
    key: "forms",
    label: "表單",
    href: "/manager/forms",
    icon: FormInput,
    requiredCapabilities: ["forms.manage"],
    group: "governance",
  },
  {
    key: "consent",
    label: "同意",
    href: "/manager/consent",
    icon: ShieldCheck,
    requiredCapabilities: ["consent.manage"],
    group: "governance",
  },
  {
    key: "permissions",
    label: "權限",
    href: "/workspace/permissions",
    icon: ShieldCheckIcon,
    requiredCapabilities: ["permissions.manage"],
    group: "governance",
  },
  {
    key: "users",
    label: "使用者",
    href: "/workspace/users",
    icon: UserCog,
    requiredCapabilities: ["users.manage"],
    group: "governance",
  },
  {
    key: "notifications",
    label: "通報",
    href: "/manager/notifications",
    icon: MessageSquareWarning,
    requiredCapabilities: ["notifications.manage"],
    group: "operations",
  },
  {
    key: "sitemap",
    label: "流程導覽",
    href: "/system/sitemap",
    icon: Map,
    requiredCapabilities: ["dashboard.read"],
    group: "system",
  },
  {
    key: "system",
    label: "參數",
    href: "/system/status",
    icon: ServerCog,
    requiredCapabilities: ["system.read"],
    group: "system",
  },
];

export const navGroups: Array<{
  key: NavItem["group"];
  label: string;
}> = [
  { key: "daily", label: "日常工作" },
  { key: "operations", label: "訪查營運" },
  { key: "governance", label: "治理與權限" },
  { key: "system", label: "系統設定" },
];

export function getVisibleNavItems(
  capabilities: Capability[],
  roleKey?: WorkspaceRoleKey | null,
) {
  return navItems.filter((item) => {
    if (roleKey === "visitor" && !item.allowedRoles?.includes("visitor")) {
      return false;
    }
    if (item.allowedRoles?.length) {
      if (!roleKey || !item.allowedRoles.includes(roleKey)) {
        return false;
      }
    }
    return item.requiredCapabilities.every((capability) => capabilities.includes(capability));
  });
}
