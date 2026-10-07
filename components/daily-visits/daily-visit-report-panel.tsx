"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageIntro } from "@/components/ui/page-intro";
import type {
  InProgressCaseProgress,
  InProgressDateBucket,
  InProgressVisitBoard,
  InProgressVisitorGroup,
} from "@/lib/domain/in-progress-visit-board";
import {
  UNASSIGNED_VISITOR_ID,
  UNSCHEDULED_DATE_KEY,
} from "@/lib/domain/in-progress-visit-board";
import { taipeiTime } from "@/lib/domain/volunteer-attendance";

type ApiResponse = {
  data?: InProgressVisitBoard;
  error?: { message?: string };
};

export function DailyVisitReportPanel() {
  const [board, setBoard] = useState<InProgressVisitBoard | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal, fresh = false) => {
    setLoading(true);
    setError("");
    try {
      const query = fresh ? "?fresh=1" : "";
      const response = await fetch(`/api/manager/in-progress-visits${query}`, {
        signal,
        cache: "no-store",
      });
      const json = (await response.json()) as ApiResponse;
      if (!response.ok || !json.data) {
        throw new Error(json.error?.message || "讀取訪視中分層統計失敗");
      }
      setBoard(json.data);
      setSelectedDateKey((current) =>
        current && json.data?.dateBuckets.some((bucket) => bucket.dateKey === current)
          ? current
          : null,
      );
      setExpanded(null);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setBoard(null);
      setError(loadError instanceof Error ? loadError.message : "讀取訪視中分層統計失敗");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const selectedBucket = useMemo(
    () => board?.dateBuckets.find((bucket) => bucket.dateKey === selectedDateKey) ?? null,
    [board, selectedDateKey],
  );

  return (
    <div className="grid gap-4">
      <PageIntro
        icon={CalendarDays}
        eyebrow="管理者訪視中檢視"
        title="訪視中個案（依日期分層）"
        description="以進行中個案為唯一來源：先看日期與案數，再看各訪員派案，最後展開個案訪視進度。各日案數加總應對齊工作流「訪視中」。"
      />

      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">進行中個案總數</p>
            <p className="text-2xl font-semibold">
              {board ? `${board.totalCases} 件` : loading ? "讀取中…" : "—"}
            </p>
          </div>
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
        {board?.note ? (
          <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">
            {board.note}
          </p>
        ) : null}
      </section>

      {loading && !board ? <LoadingState /> : null}

      {!loading && error ? (
        <section className="rounded-lg border border-destructive/40 bg-card p-6 text-center">
          <p className="font-medium">無法載入統計</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-4" type="button" onClick={() => void load(undefined, true)}>
            再試一次
          </Button>
        </section>
      ) : null}

      {board && !selectedBucket ? (
        <DateBucketList
          buckets={board.dateBuckets}
          totalCases={board.totalCases}
          onSelect={(dateKey) => {
            setSelectedDateKey(dateKey);
            setExpanded(null);
          }}
        />
      ) : null}

      {board && selectedBucket ? (
        <VisitorLevel
          bucket={selectedBucket}
          expanded={expanded}
          onBack={() => {
            setSelectedDateKey(null);
            setExpanded(null);
          }}
          onToggle={(visitorId) =>
            setExpanded((current) => (current === visitorId ? null : visitorId))
          }
        />
      ) : null}
    </div>
  );
}

function DateBucketList({
  buckets,
  totalCases,
  onSelect,
}: {
  buckets: InProgressDateBucket[];
  totalCases: number;
  onSelect: (dateKey: string) => void;
}) {
  if (buckets.length === 0) {
    return (
      <section className="rounded-lg border bg-card p-8 text-center">
        <p className="font-medium">目前沒有進行中個案</p>
        <p className="mt-1 text-sm text-muted-foreground">
          工作流「訪視中」為 0 時，此處也會是空的。
        </p>
      </section>
    );
  }

  const summed = buckets.reduce((sum, bucket) => sum + bucket.caseCount, 0);

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">步驟 1｜依日期檢視</h2>
        <p className="text-xs text-muted-foreground">
          加總 {summed} 件{summed === totalCases ? "＝進行中總數" : `（總數 ${totalCases}）`}
        </p>
      </div>
      <div className="grid gap-2">
        {buckets.map((bucket) => (
          <button
            key={bucket.dateKey}
            type="button"
            onClick={() => onSelect(bucket.dateKey)}
            className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-left transition hover:border-primary/40 hover:bg-secondary/40"
          >
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{bucket.label}</span>
                <KindBadge kind={bucket.kind} />
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                點選查看指派給各訪員的案數
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-lg font-semibold">{bucket.caseCount} 案</span>
              <span className="block text-xs text-muted-foreground">
                {bucket.visitorCount} 位訪員／群組
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function VisitorLevel({
  bucket,
  expanded,
  onBack,
  onToggle,
}: {
  bucket: InProgressDateBucket;
  expanded: string | null;
  onBack: () => void;
  onToggle: (visitorId: string) => void;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          返回日期列表
        </Button>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">步驟 2｜{bucket.label}</h2>
          <p className="text-xs text-muted-foreground">
            {bucket.caseCount} 案 · {bucket.visitorCount} 位訪員／群組 · 點訪員看進度
          </p>
        </div>
      </div>

      {bucket.visitors.map((visitor) => {
        const isOpen = expanded === visitor.visitorId;
        const canExport =
          bucket.dateKey !== UNSCHEDULED_DATE_KEY &&
          visitor.visitorId !== UNASSIGNED_VISITOR_ID &&
          Boolean(visitor.visitorId);
        const exportUrl = `/api/manager/daily-visits/export?date=${encodeURIComponent(bucket.dateKey)}&visitorId=${encodeURIComponent(visitor.visitorId)}`;

        return (
          <article key={visitor.visitorId} className="overflow-hidden rounded-lg border bg-card">
            <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                aria-expanded={isOpen}
                onClick={() => onToggle(visitor.visitorId)}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                  {visitor.visitorName.slice(0, 1)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{visitor.visitorName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {visitor.visitorId === UNASSIGNED_VISITOR_ID
                      ? "尚未指派 · 點選查看個案"
                      : `${visitor.visitorId} · 點選查看訪視進度`}
                  </span>
                </span>
                {isOpen ? (
                  <ChevronUp className="ml-auto h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="ml-auto h-5 w-5 text-muted-foreground" />
                )}
              </button>

              <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm sm:grid-cols-4 lg:flex lg:items-center">
                <Metric label="案數" value={`${visitor.caseCount} 案`} />
                <Metric label="未完成" value={`${visitor.incompleteCount} 案`} />
                <Metric
                  label="關懷表"
                  value={`${visitor.careFormCompletedCount}/${visitor.caseCount}`}
                />
                <Metric label="已簽到" value={`${visitor.checkedInCount}/${visitor.caseCount}`} />
              </div>

              {canExport ? (
                <Button asChild size="sm">
                  <a href={exportUrl}>
                    <Download className="h-4 w-4" />
                    匯出此訪員 Excel
                  </a>
                </Button>
              ) : null}
            </div>

            {isOpen ? <CaseProgressTable visitor={visitor} /> : null}
          </article>
        );
      })}
    </section>
  );
}

function CaseProgressTable({ visitor }: { visitor: InProgressVisitorGroup }) {
  return (
    <div className="border-t bg-background/60">
      <div className="px-4 py-2 text-xs text-muted-foreground">
        步驟 3｜訪視進度（未簽到 → 關懷表未完成 → 待稽核）
      </div>
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
            {visitor.cases.map((detail) => (
              <CaseRow key={detail.assignmentId || detail.caseId} detail={detail} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CaseRow({ detail }: { detail: InProgressCaseProgress }) {
  return (
    <tr className="border-t align-top">
      <Cell>
        <p className="font-medium">{detail.elderName}</p>
        <p className="text-xs text-muted-foreground">
          {detail.caseCode}
          {detail.assignmentId ? ` · ${detail.assignmentId}` : ""}
        </p>
      </Cell>
      <Cell>
        <p>到宅：{detail.checkinAt ? taipeiTime(detail.checkinAt) : "未簽到"}</p>
        <p>離宅：{detail.checkoutAt ? taipeiTime(detail.checkoutAt) : "未簽退"}</p>
      </Cell>
      <Cell>
        {detail.serviceMinutes} 分鐘（{detail.serviceHours} 小時）
      </Cell>
      <Cell>
        <p>{detail.careFormStatus}</p>
        <p className="text-xs text-muted-foreground">完成率 {detail.careFormCompletion}%</p>
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
  );
}

function KindBadge({ kind }: { kind: InProgressDateBucket["kind"] }) {
  const label =
    kind === "overdue"
      ? "逾期"
      : kind === "today"
        ? "今天"
        : kind === "future"
          ? "未來"
          : "未排程";
  const tone =
    kind === "overdue"
      ? "bg-rose-100 text-rose-800"
      : kind === "today"
        ? "bg-emerald-100 text-emerald-800"
        : kind === "future"
          ? "bg-sky-100 text-sky-800"
          : "bg-amber-100 text-amber-800";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-3" aria-label="正在載入訪視中分層統計">
      <div className="h-24 animate-pulse rounded-lg border bg-card" />
      <div className="h-20 animate-pulse rounded-lg border bg-card" />
      <div className="h-20 animate-pulse rounded-lg border bg-card" />
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

function StatusBadge({ value }: { value: InProgressCaseProgress["auditStatus"] }) {
  const tone =
    value === "稽核通過"
      ? "bg-emerald-100 text-emerald-800"
      : value === "退回補件"
        ? "bg-rose-100 text-rose-800"
        : "bg-amber-100 text-amber-800";
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${tone}`}>
      {value}
    </span>
  );
}

function PaymentBadge({ value }: { value: InProgressCaseProgress["paymentStatus"] }) {
  const tone =
    value === "可核銷（稽核通過）"
      ? "bg-emerald-100 text-emerald-800"
      : value === "退回補件"
        ? "bg-rose-100 text-rose-800"
        : "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${tone}`}>
      {value}
    </span>
  );
}
