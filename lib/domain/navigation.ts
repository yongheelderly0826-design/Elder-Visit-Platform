import type { ComponentType } from "react";
import {
  BarChart3,
  ClipboardList,
  ContactRound,
  FileText,
  Files,
  FormInput,
  Home,
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
  Workflow,
} from "lucide-react";
import type { Capability } from "@/lib/domain/types";

export type NavKey =
  | "dashboard"
  | "tasks"
  | "drafts"
  | "profile"
  | "cases"
  | "assignments"
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
  | "attendance";

export type NavItem = {
  key: NavKey;
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  requiredCapabilities: Capability[];
  group: "daily" | "operations" | "governance" | "system";
};

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
    key: "tasks",
    label: "任務",
    href: "/visitor/tasks",
    icon: ListChecks,
    requiredCapabilities: ["visits.submit"],
    group: "daily",
  },
  {
    key: "drafts",
    label: "草稿",
    href: "/visitor/drafts",
    icon: Files,
    requiredCapabilities: ["visits.submit"],
    group: "daily",
  },
  {
    key: "clock",
    label: "出勤簽到",
    href: "/volunteer/clock",
    icon: Timer,
    requiredCapabilities: ["attendance.clock"],
    group: "daily",
  },
  {
    key: "profile",
    label: "我的資料",
    href: "/visitor/profile",
    icon: UserRound,
    requiredCapabilities: ["visits.submit"],
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

export function getVisibleNavItems(capabilities: Capability[]) {
  return navItems.filter((item) =>
    item.requiredCapabilities.every((capability) => capabilities.includes(capability)),
  );
}
