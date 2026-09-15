"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageIntro } from "@/components/ui/page-intro";
import type {
  DailyVisitAuditStatus,
  DailyVisitPaymentStatus,
  DailyVisitReport,
} from "@/lib/domain/daily-visit-report";
import { taipeiTime, taipeiToday } from "@/lib/domain/volunteer-attendance";

type ApiResponse = {
  data?: DailyVisitReport;
  error?: { message?: string };
};

export function DailyVisitReportPanel() {
  const [date, setDate] = useState(taipeiToday());
  const [report, setReport] = useState<DailyVisitReport | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal, fresh = false) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ date });
      if (fresh) query.set("fresh", "1");
      const response = await fetch(
        `/api/manager/daily-visits?${query.toString()}`,
        { signal, cache: "no-store" },
      );
      const json = (await response.json()) as ApiResponse;
      if (!response.ok || !json.data) {
        throw new Error(json.error?.message || "讀取每日訪視工作統計失敗");
      }
      setReport(json.data);
      setExpanded((current) =>
        current && json.data?.visitors.some((visitor) => visitor.visitorId === current)
          ? current
          : null,
      );
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setReport(null);
      setError(loadError instanceof Error ? loadError.message : "讀取每日訪視工作統計失敗");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <div className="grid gap-4">
      <PageIntro
        icon={CalendarDays}
        eyebrow="管理者每日工作檢視"
        title="每日訪視工作統計"
        description="按日期檢視每位訪員的派案、關懷表、到宅簽到退、服務時數、稽核與核銷資格。核銷欄僅依稽核結果顯示資格，不代表已付款。"
      />

      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="grid max-w-xs gap-1 text-sm font-medium">
            統計日期
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 font-normal"
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void load(undefined, true)}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "讀取中…" : "重新整理"}
          </Button>
        </div>
        {report?.note ? (
          <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">
            {report.note}
          </p>
        ) : null}
      </section>

      {loading && !report ? <LoadingState /> : null}

      {!loading && error ? (
        <section className="rounded-lg border border-destructive/40 bg-card p-6 text-center">
          <p className="font-medium">無法載入統計</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-4" type="button" onClick={() => void load(undefined, true)}>
            再試一次
          </Button>
        </section>
      ) : null}

      {report ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Stat label="派出訪員" value={`${report.summary.visitorCount} 人`} />
            <Stat label="派案數" value={`${report.summary.assignmentCount} 案`} />
            <Stat
              label="關懷表完成"
              value={`${report.summary.careFormCompletedCount} 案`}
            />
            <Stat label="已簽退" value={`${report.summary.checkedOutCount} 案`} />
            <Stat label="服務時數" value={`${report.summary.serviceHours} 小時`} />
            <Stat label="稽核通過" value={`${report.summary.auditApprovedCount} 案`} />
          </section>

          {report.visitors.length === 0 ? (
            <section className="rounded-lg border bg-card p-8 text-center">
              <p className="font-medium">這一天沒有派案資料</p>
              <p className="mt-1 text-sm text-muted-foreground">
                請改選其他日期，或確認派案日期已正確填寫。
              </p>
            </section>
          ) : (
            <section className="grid gap-3">
              {report.visitors.map((visitor) => {
                const isOpen = expanded === visitor.visitorId;
                const exportUrl = `/api/manager/daily-visits/export?date=${encodeURIComponent(report.date)}&visitorId=${encodeURIComponent(visitor.visitorId)}`;
                return (
                  <article key={visitor.visitorId} className="overflow-hidden rounded-lg border bg-card">
                    <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        aria-expanded={isOpen}
                        onClick={() => setExpanded(isOpen ? null : visitor.visitorId)}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                          {visitor.visitorName.slice(0, 1)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{visitor.visitorName}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {visitor.visitorId} · 點選查看工作明細
                          </span>
                        </span>
                        {isOpen ? (
                          <ChevronUp className="ml-auto h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="ml-auto h-5 w-5 text-muted-foreground" />
                        )}
                      </button>

                      <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm sm:grid-cols-4 lg:flex lg:items-center">
                        <Metric label="派案" value={`${visitor.assignedCount} 案`} />
                        <Metric
                          label="關懷表"
                          value={`${visitor.careFormCompletedCount}/${visitor.assignedCount}`}
                        />
                        <Metric
                          label="簽到／簽退"
                          value={`${visitor.checkedInCount}/${visitor.checkedOutCount}`}
                        />
                        <Metric label="服務" value={`${visitor.serviceHours} 小時`} />
                      </div>

                      <Button asChild size="sm">
                        <a href={exportUrl}>
                          <Download className="h-4 w-4" />
                          匯出此訪員 Excel
                        </a>
                      </Button>
                    </div>

                    {isOpen ? (
                      <div className="border-t bg-background/60">
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[78rem] text-left text-sm">
                            <thead className="bg-secondary/70 text-muted-foreground">
                              <tr>
                                <Header>個案</Header>
                                <Header>簽到／簽退</Header>
                                <Header>服務</Header>
                                <Header>關懷表</Header>
                                <Header>內容摘要</Header>
                                <Header>訪視結果</Header>
                                <Header>稽核</Header>
                                <Header>核銷資格</Header>
                              </tr>
                            </thead>
                            <tbody>
                              {visitor.details.map((detail) => (
                                <tr key={detail.assignmentId} className="border-t align-top">
                                  <Cell>
                                    <p className="font-medium">{detail.elderName}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {detail.caseCode} · {detail.assignmentId}
                                    </p>
                                  </Cell>
                                  <Cell>
                                    <p>到宅：{detail.checkinAt ? taipeiTime(detail.checkinAt) : "未簽到"}</p>
                                    <p>離宅：{detail.checkoutAt ? taipeiTime(detail.checkoutAt) : "未簽退"}</p>
                                  </Cell>
                                  <Cell>{detail.serviceMinutes} 分鐘（{detail.serviceHours} 小時）</Cell>
                                  <Cell>
                                    <p>{detail.careFormStatus}</p>
                                    <p className="text-xs text-muted-foreground">
                                      完成率 {detail.careFormCompletion}%
                                    </p>
                                  </Cell>
                                  <Cell>
                                    <p className="max-w-sm whitespace-normal">{detail.careSummary}</p>
                                  </Cell>
                                  <Cell>{detail.visitResult}</Cell>
                                  <Cell>
                                    <StatusBadge value={detail.auditStatus} />
                                  </Cell>
                                  <Cell>
                                    <PaymentBadge value={detail.paymentStatus} />
                                  </Cell>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-3" aria-label="正在載入每日訪視統計">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-lg border bg-card" />
        ))}
      </div>
      <div className="h-28 animate-pulse rounded-lg border bg-card" />
      <div className="h-28 animate-pulse rounded-lg border bg-card" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-3 font-medium">{children}</th>;
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3">{children}</td>;
}

function StatusBadge({ value }: { value: DailyVisitAuditStatus }) {
  const tone =
    value === "稽核通過"
      ? "bg-emerald-100 text-emerald-800"
      : value === "退回補件"
        ? "bg-rose-100 text-rose-800"
        : "bg-amber-100 text-amber-800";
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${tone}`}>{value}</span>;
}

function PaymentBadge({ value }: { value: DailyVisitPaymentStatus }) {
  const tone =
    value === "可核銷（稽核通過）"
      ? "bg-emerald-100 text-emerald-800"
      : value === "退回補件"
        ? "bg-rose-100 text-rose-800"
        : "bg-slate-100 text-slate-700";
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${tone}`}>{value}</span>;
}
