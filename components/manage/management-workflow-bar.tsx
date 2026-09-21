import Link from "next/link";
import { ClipboardCheck, FileText, ShieldCheck, UserRoundCog } from "lucide-react";

type ManagementStep = "assignments" | "follow_up" | "audit" | "exports";

export type ManagementWorkflowCounts = {
  pendingAssignments?: string;
  pendingFollowUp?: string;
  pendingAudit?: string;
  pendingExport?: string;
};

const steps = [
  {
    key: "assignments" as const,
    label: "待派案",
    detail: "18 件",
    countKey: "pendingAssignments" as const,
    href: "/manager/assignments",
    icon: UserRoundCog,
  },
  {
    key: "follow_up" as const,
    label: "待補件",
    detail: "6 件",
    countKey: "pendingFollowUp" as const,
    href: "/manager/notifications",
    icon: ClipboardCheck,
  },
  {
    key: "audit" as const,
    label: "待稽核",
    detail: "27 件",
    countKey: "pendingAudit" as const,
    href: "/manager/audit",
    icon: ShieldCheck,
  },
  {
    key: "exports" as const,
    label: "待核銷",
    detail: "2 批",
    countKey: "pendingExport" as const,
    href: "/manager/exports",
    icon: FileText,
  },
];

export function ManagementWorkflowBar({
  active,
  counts,
}: {
  active: ManagementStep;
  counts?: ManagementWorkflowCounts;
}) {
  return (
    <section className="rounded-lg border bg-card p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = step.key === active;

          return (
            <Link key={step.key} href={step.href}>
              <div
                className={`rounded-md border p-3 ${
                  isActive ? "border-primary bg-primary/5" : "bg-background"
                }`}
              >
                <p className="text-xs font-medium text-muted-foreground">步驟 {index + 1}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  <p className="text-sm font-semibold">{step.label}</p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {counts?.[step.countKey] ?? step.detail}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function ManagementPriorityQueue() {
  const items = [
    {
      title: "先處理待派案",
      detail: "高風險 5 件先分派，避免延後後續訪查。",
      href: "/manager/assignments",
    },
    {
      title: "再追待補件",
      detail: "缺定位、同意或照片者先通知訪員補正。",
      href: "/manager/notifications",
    },
    {
      title: "接著完成稽核",
      detail: "阻擋項目先退回，提醒項目由主管覆核放行。",
      href: "/manager/audit",
    },
    {
      title: "最後鎖定核銷",
      detail: "稽核通過後再鎖定批次並進入成果匯出。",
      href: "/manager/exports",
    },
  ];

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">今日建議處理順序</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            管理端先依阻塞關係往下處理，避免核銷與匯出卡在前段資料。
          </p>
        </div>
        <span className="rounded-md bg-secondary px-2.5 py-1 text-xs font-medium">
          依流程排序
        </span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        {items.map((item, index) => (
          <Link key={item.title} href={item.href} className="rounded-lg border bg-background p-3">
            <p className="text-xs font-semibold text-primary">優先 {index + 1}</p>
            <p className="mt-2 text-sm font-semibold">{item.title}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
