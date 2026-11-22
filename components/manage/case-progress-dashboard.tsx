"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, ContactRound, Download, RefreshCw } from "lucide-react";
import { PageIntro } from "@/components/ui/page-intro";
import { Button } from "@/components/ui/button";
import {
  CASE_PROGRESS_BUCKET_LABELS,
  type CaseProgressBucketListPayload,
  type CaseProgressBuckets,
  type CaseProgressSample,
  type CaseProgressSummaryPayload,
} from "@/lib/domain/case-progress";

const PAGE_SIZE = 50;

function Card({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function BucketTable({
  buckets,
  onSelect,
  selected,
}: {
  buckets: CaseProgressBuckets;
  selected: keyof CaseProgressBuckets | null;
  onSelect: (key: keyof CaseProgressBuckets) => void;
}) {
  const keys = Object.keys(CASE_PROGRESS_BUCKET_LABELS) as Array<keyof CaseProgressBuckets>;
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="min-w-[40rem] w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">清冊對照分桶</th>
            <th className="px-3 py-2 font-medium text-right">人數</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr
              key={key}
              className={`border-t cursor-pointer hover:bg-muted/30 ${selected === key ? "bg-muted/40" : ""}`}
              onClick={() => onSelect(key)}
            >
              <td className="px-3 py-2">{CASE_PROGRESS_BUCKET_LABELS[key]}</td>
              <td className="px-3 py-2 text-right tabular-nums">{buckets[key]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function escapeCsvCell(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function rowsToCsv(rows: CaseProgressSample[]) {
  const header = ["姓名", "身分證", "里", "系統狀態", "清冊狀態", "通道", "直KEY結果", "個案編號"];
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        row.name_masked,
        row.id_masked,
        row.village || "",
        row.visit_status || "",
        row.roster_status || "",
        row.channel || "",
        row.mark_outcome || "",
        row.case_id || "",
      ]
        .map((cell) => escapeCsvCell(String(cell)))
        .join(","),
    ),
  ];
  return `\uFEFF${lines.join("\n")}`;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function fetchBucketPage(
  bucket: keyof CaseProgressBuckets,
  page: number,
  pageSize = PAGE_SIZE,
): Promise<CaseProgressBucketListPayload> {
  const qs = new URLSearchParams({
    bucket,
    page: String(page),
    page_size: String(pageSize),
  });
  const response = await fetch(`/api/manager/case-progress/bucket?${qs.toString()}`);
  const json = (await response.json()) as {
    data?: CaseProgressBucketListPayload;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(json.error?.message ?? "無法載入分桶名單");
  }
  if (!json.data) throw new Error("無法載入分桶名單");
  return json.data;
}

export function CaseProgressDashboard() {
  const [data, setData] = useState<CaseProgressSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<keyof CaseProgressBuckets | null>(
    "D_careform_roster_pending",
  );
  const [bucketPage, setBucketPage] = useState(1);
  const [bucketList, setBucketList] = useState<CaseProgressBucketListPayload | null>(null);
  const [bucketLoading, setBucketLoading] = useState(false);
  const [bucketMessage, setBucketMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadBucket = useCallback(async (bucket: keyof CaseProgressBuckets, page: number) => {
    setBucketLoading(true);
    setBucketMessage(null);
    try {
      const payload = await fetchBucketPage(bucket, page, PAGE_SIZE);
      setBucketList(payload);
      setBucketPage(payload.page);
      if ((payload.notes ?? []).length > 0) {
        setBucketMessage(payload.notes!.join(" "));
      }
    } catch (error) {
      setBucketList(null);
      setBucketMessage(error instanceof Error ? error.message : "無法載入分桶名單");
    } finally {
      setBucketLoading(false);
    }
  }, []);

  async function load(force = false) {
    setLoading(true);
    setMessage(null);
    try {
      const qs = force ? "?force_refresh=1" : "";
      const response = await fetch(`/api/manager/case-progress/summary${qs}`);
      const json = (await response.json()) as {
        data?: CaseProgressSummaryPayload;
        error?: { message?: string };
      };
      if (!response.ok) {
        setMessage(json.error?.message ?? "無法載入個案進度");
        setData(null);
        return;
      }
      setData(json.data ?? null);
      if (force && selectedBucket) {
        setBucketPage(1);
        await loadBucket(selectedBucket, 1);
      }
    } catch {
      setMessage("無法載入個案進度，請稍後再試。");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  useEffect(() => {
    if (!selectedBucket) return;
    void loadBucket(selectedBucket, 1);
  }, [selectedBucket, loadBucket]);

  const crossRows = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.roster_status_cross).sort((a, b) => b[1].total - a[1].total);
  }, [data]);

  const selectedCount = selectedBucket && data ? data.buckets[selectedBucket] : 0;
  const listTotal = bucketList?.total ?? 0;
  const totalPages = bucketList?.total_pages ?? 0;

  async function exportAllCsv() {
    if (!selectedBucket) return;
    setExporting(true);
    setBucketMessage(null);
    try {
      const first = await fetchBucketPage(selectedBucket, 1, 100);
      const allRows = [...first.rows];
      const pages = first.total_pages || 0;
      for (let page = 2; page <= pages; page += 1) {
        const next = await fetchBucketPage(selectedBucket, page, 100);
        allRows.push(...next.rows);
      }
      if (allRows.length === 0) {
        setBucketMessage("此分桶沒有可匯出的列。若摘要人數非 0，請先強制重算。");
        return;
      }
      const label = CASE_PROGRESS_BUCKET_LABELS[selectedBucket].replace(/\s+/g, "_");
      downloadCsv(`case-progress-${selectedBucket}-${label}.csv`, rowsToCsv(allRows));
    } catch (error) {
      setBucketMessage(error instanceof Error ? error.message : "匯出失敗");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageIntro
        icon={ContactRound}
        eyebrow="個案視角"
        title="個案進度儀表板"
        description="以個案為母體：已 KEY 關懷表與直 KEY 分別標示；並對照清冊全量分桶（A–F）。點選分桶可開啟全量名單（分頁、遮罩）。里別進度請看衛福部進度儀表板。"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={loading} onClick={() => void load(false)}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "載入中…" : "重新整理"}
        </Button>
        <Button type="button" variant="outline" disabled={loading} onClick={() => void load(true)}>
          強制重算
        </Button>
        <Link
          href="/manager/mohw-progress"
          className="inline-flex items-center rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted/40"
        >
          <BarChart3 className="mr-2 h-4 w-4" />
          里別進度儀表板
        </Link>
      </div>

      {message && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {message}
        </p>
      )}

      {data && (
        <>
          <section className="rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground space-y-1">
            <p>
              清冊快照：
              {data.roster.loaded
                ? `已載入 ${data.roster.total.toLocaleString()} 人（${data.roster.snapshot_id || "未標版本"}）`
                : "尚未匯入 — 請執行清冊匯入腳本後再強制重算"}
              {data.from_cache ? " · 顯示快取" : " · 即時重算"}
              {data.computed_at ? ` · ${data.computed_at}` : ""}
            </p>
            {(data.notes ?? []).map((note) => (
              <p key={note}>{note}</p>
            ))}
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Card label="系統名冊" value={data.totals.system_roster} />
            <Card
              label="已 KEY 關懷表"
              value={data.totals.careform_keyed}
              hint="含同時有直 KEY 者"
            />
            <Card
              label="直 KEY 已回報"
              value={data.totals.direct_keyed}
              hint="無關懷表、僅有 mark"
            />
            <Card label="有紀錄（合計）" value={data.totals.any_record} hint="關懷表 ∪ 直 KEY" />
            <Card label="無痕跡" value={data.totals.no_trace} />
            <Card label="有紀錄率" value={`${data.totals.completion_rate}%`} />
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <Card
              label="資料落差：有直 KEY 仍未訪"
              value={data.gaps.mark_but_unvisited}
              hint="有 mark、無關懷表、visit_status 未完成"
            />
            <Card
              label="資料落差：有關懷表仍未訪狀態"
              value={data.gaps.careform_but_unvisited}
              hint="有關懷表但 visit_status 未完成"
            />
          </section>

          <section className="rounded-lg border bg-card p-4 space-y-3">
            <div>
              <h2 className="font-semibold">清冊全量對照</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                兩邊都有 {data.roster.both_sides.toLocaleString()} · 僅清冊{" "}
                {data.roster.roster_only.toLocaleString()} · 僅系統{" "}
                {data.roster.system_only.toLocaleString()}
                。點列即可開啟該桶全量名單。
              </p>
            </div>
            <BucketTable
              buckets={data.buckets}
              selected={selectedBucket}
              onSelect={(key) => {
                setBucketList(null);
                setBucketMessage(null);
                setSelectedBucket(key);
                setBucketPage(1);
              }}
            />
          </section>

          {crossRows.length > 0 && (
            <section className="rounded-lg border bg-card p-4 space-y-3">
              <h2 className="font-semibold">清冊狀態 × 系統通道（兩邊都有）</h2>
              <div className="overflow-x-auto rounded-md border">
                <table className="min-w-[40rem] w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">清冊狀態</th>
                      <th className="px-3 py-2 font-medium text-right">小計</th>
                      <th className="px-3 py-2 font-medium text-right">關懷表</th>
                      <th className="px-3 py-2 font-medium text-right">直 KEY</th>
                      <th className="px-3 py-2 font-medium text-right">無痕跡</th>
                      <th className="px-3 py-2 font-medium text-right">兩者</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crossRows.map(([status, row]) => (
                      <tr key={status} className="border-t">
                        <td className="px-3 py-2">{status || "（空白）"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.total}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.careform}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.direct}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.none}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.both}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">分桶全量名單（遮罩）</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedBucket ? CASE_PROGRESS_BUCKET_LABELS[selectedBucket] : "請選擇分桶"}
                  {selectedBucket
                    ? ` · 摘要 ${selectedCount.toLocaleString()} 人 · 索引 ${listTotal.toLocaleString()} 人`
                    : ""}
                  {` · 每頁 ${PAGE_SIZE} 筆`}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedBucket || exporting || bucketLoading || listTotal === 0}
                onClick={() => void exportAllCsv()}
              >
                <Download className="mr-2 h-4 w-4" />
                {exporting ? "匯出中…" : "匯出 CSV（遮罩）"}
              </Button>
            </div>

            {bucketMessage && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {bucketMessage}
              </p>
            )}

            {bucketLoading && !bucketList ? (
              <p className="text-sm text-muted-foreground">載入名單中…</p>
            ) : listTotal === 0 ? (
              <p className="text-sm text-muted-foreground">
                此分桶目前沒有索引列。
                {selectedCount > 0 ? "請按上方「強制重算」重建分桶索引後再開啟。" : ""}
              </p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <table className="min-w-[48rem] w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">姓名</th>
                        <th className="px-3 py-2 font-medium">身分證</th>
                        <th className="px-3 py-2 font-medium">里</th>
                        <th className="px-3 py-2 font-medium">系統狀態</th>
                        <th className="px-3 py-2 font-medium">清冊狀態</th>
                        <th className="px-3 py-2 font-medium">通道</th>
                        <th className="px-3 py-2 font-medium">直 KEY 結果</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(bucketList?.rows ?? []).map((row, idx) => (
                        <tr key={`${row.case_id}-${row.id_masked}-${idx}`} className="border-t">
                          <td className="px-3 py-2">{row.name_masked}</td>
                          <td className="px-3 py-2 font-mono text-xs">{row.id_masked}</td>
                          <td className="px-3 py-2">{row.village || "—"}</td>
                          <td className="px-3 py-2">{row.visit_status || "—"}</td>
                          <td className="px-3 py-2">{row.roster_status || "—"}</td>
                          <td className="px-3 py-2">{row.channel}</td>
                          <td className="px-3 py-2">{row.mark_outcome || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <p className="text-muted-foreground">
                    第 {bucketPage} / {Math.max(totalPages, 1)} 頁
                    {bucketLoading ? " · 載入中…" : ""}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={bucketLoading || bucketPage <= 1}
                      onClick={() => {
                        if (!selectedBucket) return;
                        const next = Math.max(1, bucketPage - 1);
                        setBucketPage(next);
                        void loadBucket(selectedBucket, next);
                      }}
                    >
                      上一頁
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={bucketLoading || totalPages === 0 || bucketPage >= totalPages}
                      onClick={() => {
                        if (!selectedBucket) return;
                        const next = bucketPage + 1;
                        setBucketPage(next);
                        void loadBucket(selectedBucket, next);
                      }}
                    >
                      下一頁
                    </Button>
                  </div>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
