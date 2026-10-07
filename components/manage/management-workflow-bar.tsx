"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ClipboardCheck,
  FileText,
  Route,
  ShieldCheck,
  UserRoundCog,
} from "lucide-react";
import type { ManagementWorkflowCounts } from "@/lib/domain/management-workflow-counts";

export type { ManagementWorkflowCounts };

type ManagementStep = "assignments" | "in_progress" | "follow_up" | "audit" | "exports";

const steps = [
  {
    key: "assignments" as const,
    label: "待派案",
    countKey: "pendingAssignments" as const,
    href: "/manager/assignments",
    icon: UserRoundCog,
  },
  {
    key: "in_progress" as const,
    label: "訪視中",
    countKey: "inProgressVisits" as const,
    href: "/manager/daily-visits",
    icon: Route,
  },
  {
    key: "follow_up" as const,
    label: "待補件",
    countKey: "pendingFollowUp" as const,
    href: "/manager/audit",
    icon: ClipboardCheck,
  },
  {
    key: "audit" as const,
    label: "待稽核",
    countKey: "pendingAudit" as const,
    href: "/manager/audit",
    icon: ShieldCheck,
  },
  {
    key: "exports" as const,
    label: "待核銷",
    countKey: "pendingExport" as const,
    href: "/manager/exports",
    icon: FileText,
  },
];

function useWorkflowCounts(override?: ManagementWorkflowCounts) {
  const [counts, setCounts] = useState<ManagementWorkflowCounts | undefined>(override);
  const [loading, setLoading] = useState(!override);

  useEffect(() => {
    if (override) {
      setCounts(override);
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch("/api/manager/workflow-counts", { cache: "no-store" });
        const json = (await response.json()) as {
          data?: { counts?: ManagementWorkflowCounts };
        };
        if (!cancelled && response.ok) {
          setCounts(json.data?.counts);
        }
      } catch {
        if (!cancelled) setCounts(undefined);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [override]);

  return { counts, loading };
}

export function ManagementWorkflowBar({
  active,
  counts: overrideCounts,
}: {
  active: ManagementStep;
  /** 若傳入則覆寫自動抓取；建議各頁都不要傳，改走共用 API */
  counts?: ManagementWorkflowCounts;
}) {
  const { counts, loading } = useWorkflowCounts(overrideCounts);

  return (
    <section className="rounded-lg border bg-card p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = step.key === active;
          const detail = counts?.[step.countKey] ?? (loading ? "讀取中…" : "—");

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
                <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
              </div>
            </Link>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        名冊對照：待派案＋訪視中＋已核准核銷 ≈ 個案總數；待補件／待稽核是進行中的子狀態，不另加總。
      </p>
    </section>
  );
}

export function ManagementPriorityQueue() {
  const items = [
    {
      title: "先處理待派案",
      detail: "高風險個案先分派，避免延後後續訪查。",
      href: "/manager/assignments",
    },
    {
      title: "掌握訪視中",
      detail: "進行中個案依日期→訪員→進度分層追蹤，加總對齊步驟數字。",
      href: "/manager/daily-visits",
    },
    {
      title: "再追待補件",
      detail: "缺定位、同意或照片者先通知訪員補正。",
      href: "/manager/audit",
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
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
