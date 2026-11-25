"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, ContactRound, Download, RefreshCw, X } from "lucide-react";
import { PageIntro } from "@/components/ui/page-intro";
import { Button } from "@/components/ui/button";
import {
  CASE_PROGRESS_BUCKET_LABELS,
  type CaseProgressBucketListPayload,
  type CaseProgressBuckets,
  type CaseProgressCaseDetail,
  type CaseProgressSample,
  type CaseProgressSummaryPayload,
} from "@/lib/domain/case-progress";

const PAGE_SIZE = 50;

function dash(value: string | null | undefined) {
  const s = String(value ?? "").trim();
  return s || "—";
}

function keyedSourceLabel(source: string | null | undefined) {
  if (source === "desk_temp") return "桌面 TEMP 登打";
  if (source === "visitor") return "訪查員";
  if (source === "direct_mark") return "直 KEY 回報";
  return source ? source : "—";
}

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

function displayName(row: CaseProgressSample) {
  return row.name?.trim() || row.name_masked || "—";
}

function displayNationalId(row: CaseProgressSample) {
  return row.national_id?.trim() || row.id_masked || "—";
}

function displayStaff(value: string | null | undefined) {
  const s = String(value ?? "").trim();
  return s || "—";
}

function rowsToCsv(rows: CaseProgressSample[]) {
  const header = [
    "姓名",
    "身分證",
    "里",
    "系統狀態",
    "清冊狀態",
    "社政訪員",
    "民政訪員",
    "建檔人員",
    "通道",
    "直KEY結果",
    "個案編號",
  ];
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        displayName(row),
        displayNationalId(row),
        row.village || "",
        row.visit_status || "",
        row.roster_status || "",
        row.social_worker_name || "",
        row.civil_worker_name || "",
        row.builder_name || "",
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

async function fetchCaseDetail(params: {
  case_id?: string;
  bucket?: string;
  seq?: number;
  has_careform?: boolean;
  has_direct_mark?: boolean;
  roster_status?: string;
  system_only?: boolean;
}): Promise<CaseProgressCaseDetail> {
  const qs = new URLSearchParams();
  if (params.case_id) qs.set("case_id", params.case_id);
  if (!params.case_id && params.bucket) qs.set("bucket", params.bucket);
  if (!params.case_id && params.seq) qs.set("seq", String(params.seq));
  if (params.has_careform != null) qs.set("has_careform", params.has_careform ? "1" : "0");
  if (params.has_direct_mark != null) qs.set("has_direct_mark", params.has_direct_mark ? "1" : "0");
  if (params.roster_status != null) qs.set("roster_status", params.roster_status);
  qs.set("skip_roster", "1");
  if (params.system_only) qs.set("system_only", "1");
  const response = await fetch(`/api/manager/case-progress/detail?${qs.toString()}`);
  const json = (await response.json()) as {
    data?: CaseProgressCaseDetail;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(json.error?.message ?? "無法載入個案詳情");
  }
  if (!json.data) throw new Error("無法載入個案詳情");
  return json.data;
}

function previewFromSample(row: CaseProgressSample): CaseProgressCaseDetail {
  return {
    case_id: row.case_id || "",
    name_masked: displayName(row),
    id_masked: displayNationalId(row),
    village: row.village,
    visit_status: row.visit_status,
    roster_status: row.roster_status,
    channel: row.channel,
    has_careform: row.has_careform,
    has_direct_mark: row.has_direct_mark,
    roster_only: !row.case_id,
    system_only: Boolean(row.case_id && !row.roster_status),
    civil_worker_name: row.civil_worker_name?.trim() || null,
    social_worker_name: row.social_worker_name?.trim() || null,
    builder_name: row.builder_name?.trim() || null,
    builder_source: null,
    builder_clerk_id: null,
    builder_at: null,
    careforms: [],
    marks: [],
    desk_logs: [],
    notes: [],
  };
}

function CaseDetailModal({
  detail,
  loading,
  error,
  onClose,
}: {
  detail: CaseProgressCaseDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="個案訪視詳情"
      onClick={onClose}
    >
      <section
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border bg-card shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
          <div>
            <p className="text-sm font-medium text-primary">個案訪視詳情</p>
            <h2 className="mt-1 text-lg font-semibold">
              {detail ? `${detail.name_masked} · ${detail.id_masked}` : loading ? "載入中…" : "個案"}
            </h2>
            {detail ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {dash(detail.village)} · {dash(detail.channel)}
                {detail.case_id ? ` · ${detail.case_id}` : ""}
              </p>
            ) : null}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
            關閉
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
          {loading && detail ? (
            <p className="text-muted-foreground">正在補齊關懷表／直 KEY 明細…</p>
          ) : null}
          {loading && !detail ? <p className="text-muted-foreground">載入個案詳情中…</p> : null}
          {error ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
              {error}
            </p>
          ) : null}

          {detail ? (
            <>
              {(detail.notes ?? []).length > 0 ? (
                <div className="space-y-1 rounded-md border border-dashed bg-muted/20 px-3 py-2 text-muted-foreground">
                  {detail.notes.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
              ) : null}

              <section className="space-y-2">
                <h3 className="font-semibold">基本資料</h3>
                <dl className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">系統訪視狀態</dt>
                    <dd>{dash(detail.visit_status)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">清冊狀態</dt>
                    <dd>{dash(detail.roster_status)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">通道</dt>
                    <dd>{dash(detail.channel)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">里</dt>
                    <dd>{dash(detail.village)}</dd>
                  </div>
                </dl>
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold">建檔人員</h3>
                <div className="rounded-md border px-3 py-2">
                  <p className="font-medium">
                    {loading && !detail.builder_name ? "載入中…" : dash(detail.builder_name)}
                    {detail.builder_clerk_id ? `（${detail.builder_clerk_id}）` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {detail.builder_source ? keyedSourceLabel(detail.builder_source) : "尚無建檔／KEY 紀錄"}
                    {detail.builder_at ? ` · ${detail.builder_at}` : ""}
                  </p>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold">訪視側（社政／民政）</h3>
                <dl className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border px-3 py-2">
                    <dt className="text-xs text-muted-foreground">民政</dt>
                    <dd className="mt-1 font-medium">{dash(detail.civil_worker_name)}</dd>
                  </div>
                  <div className="rounded-md border px-3 py-2">
                    <dt className="text-xs text-muted-foreground">社政</dt>
                    <dd className="mt-1 font-medium">{dash(detail.social_worker_name)}</dd>
                  </div>
                </dl>
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold">
                  關懷表{loading ? "" : `（${detail.careforms.length}）`}
                </h3>
                {loading && detail.careforms.length === 0 ? (
                  <p className="text-muted-foreground">載入中…</p>
                ) : detail.careforms.length === 0 ? (
                  <p className="text-muted-foreground">無關懷表</p>
                ) : (
                  <div className="space-y-2">
                    {detail.careforms.map((cf) => (
                      <div key={cf.careform_id || `${cf.status}-${cf.submitted_at}`} className="rounded-md border px-3 py-2 space-y-1">
                        <p className="font-medium">
                          {dash(cf.status)}
                          {cf.visit_result ? ` · ${cf.visit_result}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          送出 {dash(cf.submitted_at)}
                          {cf.audited_at ? ` · 稽核 ${cf.audited_at}` : ""}
                        </p>
                        <p>
                          建檔／KEY：{dash(cf.keyed_by_name)}
                          {cf.keyed_clerk_id ? `（${cf.keyed_clerk_id}）` : ""}
                          {" · "}
                          {keyedSourceLabel(cf.keyed_source)}
                          {cf.visitor_side_label ? ` · ${cf.visitor_side_label}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          訪視日時 {dash(cf.visit_date)}{" "}
                          {cf.visit_start_time || cf.visit_end_time
                            ? `${dash(cf.visit_start_time)}–${dash(cf.visit_end_time)}`
                            : ""}
                        </p>
                        <p className="text-xs">
                          表內民政 {dash(cf.civil_worker_name)}
                          {cf.civil_worker_date ? `（${cf.civil_worker_date}）` : ""}
                          {" · "}
                          表內社政 {dash(cf.social_worker_name)}
                          {cf.social_worker_date ? `（${cf.social_worker_date}）` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold">
                  直 KEY 標記{loading ? "" : `（${detail.marks.length}）`}
                </h3>
                {loading && detail.marks.length === 0 ? (
                  <p className="text-muted-foreground">載入中…</p>
                ) : detail.marks.length === 0 ? (
                  <p className="text-muted-foreground">無直 KEY 標記</p>
                ) : (
                  <div className="space-y-2">
                    {detail.marks.map((mark) => (
                      <div key={mark.mark_id || `${mark.outcome}-${mark.reported_at}`} className="rounded-md border px-3 py-2 space-y-1">
                        <p className="font-medium">{dash(mark.outcome)}</p>
                        <p>
                          民政 {dash(mark.civil_worker_name)}
                          {" · "}
                          社政 {dash(mark.social_worker_name)}
                        </p>
                        <p>
                          KEY 者 {dash(mark.keyed_by_name)}
                          {mark.keyed_by_id ? `（${mark.keyed_by_id}）` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          回報 {dash(mark.reported_at)}
                          {mark.reported_by ? ` · ${mark.reported_by}` : ""}
                          {mark.source ? ` · ${mark.source}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {detail.desk_logs.length > 0 ? (
                <section className="space-y-2">
                  <h3 className="font-semibold">桌面 TEMP 登打紀錄（{detail.desk_logs.length}）</h3>
                  <div className="space-y-2">
                    {detail.desk_logs.map((log) => (
                      <div key={log.log_id || `${log.clerk_id}-${log.keyed_at}`} className="rounded-md border px-3 py-2 text-xs space-y-1">
                        <p>
                          {dash(log.display_name)}
                          {log.clerk_id ? `（${log.clerk_id}）` : ""}
                          {log.visit_result ? ` · ${log.visit_result}` : ""}
                        </p>
                        <p className="text-muted-foreground">
                          {dash(log.visit_date)} · KEY 於 {dash(log.keyed_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
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
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<CaseProgressCaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

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

  async function openCaseDetail(row: CaseProgressSample) {
    setDetailOpen(true);
    setDetail(previewFromSample(row));
    setDetailError(null);
    setDetailLoading(true);
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const hints = {
      has_careform: row.has_careform,
      has_direct_mark: row.has_direct_mark,
      roster_status: row.roster_status,
      system_only: Boolean(row.case_id && !row.roster_status),
    };
    try {
      const payload = row.case_id
        ? await fetchCaseDetail({ case_id: row.case_id, ...hints })
        : await fetchCaseDetail({
            bucket: selectedBucket ?? undefined,
            seq: row.seq,
            ...hints,
          });
      setDetail(payload);
      const elapsed = Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0,
      );
      console.info(`[case-progress detail] ${elapsed}ms case_id=${row.case_id || "-"}`);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "無法載入個案詳情");
    } finally {
      setDetailLoading(false);
    }
  }

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
        description="以個案為母體：已 KEY 關懷表與直 KEY 分別標示；並對照清冊全量分桶（A–F）。點選分桶可開啟全量名單（分頁、遮罩）；再點列可看訪視／KEY 詳情。里別進度請看衛福部進度儀表板。"
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
                <h2 className="font-semibold">分桶全量名單</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedBucket ? CASE_PROGRESS_BUCKET_LABELS[selectedBucket] : "請選擇分桶"}
                  {selectedBucket
                    ? ` · 摘要 ${selectedCount.toLocaleString()} 人 · 索引 ${listTotal.toLocaleString()} 人`
                    : ""}
                  {` · 每頁 ${PAGE_SIZE} 筆 · 點列開詳情`}
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
                {exporting ? "匯出中…" : "匯出 CSV"}
              </Button>
            </div>

            {bucketMessage && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <p className="flex-1 min-w-[12rem]">{bucketMessage}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-amber-400 bg-white hover:bg-amber-100"
                  disabled={loading}
                  onClick={() => void load(true)}
                >
                  強制重算
                </Button>
              </div>
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
                  <table className="min-w-[64rem] w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">姓名</th>
                        <th className="px-3 py-2 font-medium">身分證</th>
                        <th className="px-3 py-2 font-medium">里</th>
                        <th className="px-3 py-2 font-medium">系統狀態</th>
                        <th className="px-3 py-2 font-medium">清冊狀態</th>
                        <th className="px-3 py-2 font-medium">社政訪員</th>
                        <th className="px-3 py-2 font-medium">民政訪員</th>
                        <th className="px-3 py-2 font-medium">建檔人員</th>
                        <th className="px-3 py-2 font-medium">通道</th>
                        <th className="px-3 py-2 font-medium">直 KEY 結果</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(bucketList?.rows ?? []).map((row, idx) => (
                        <tr
                          key={`${row.case_id}-${row.seq ?? idx}-${displayNationalId(row)}-${idx}`}
                          className="border-t cursor-pointer hover:bg-muted/30"
                          onClick={() => void openCaseDetail(row)}
                        >
                          <td className="px-3 py-2">{displayName(row)}</td>
                          <td className="px-3 py-2 font-mono text-xs">{displayNationalId(row)}</td>
                          <td className="px-3 py-2">{row.village || "—"}</td>
                          <td className="px-3 py-2">{row.visit_status || "—"}</td>
                          <td className="px-3 py-2">{row.roster_status || "—"}</td>
                          <td className="px-3 py-2">{displayStaff(row.social_worker_name)}</td>
                          <td className="px-3 py-2">{displayStaff(row.civil_worker_name)}</td>
                          <td className="px-3 py-2">{displayStaff(row.builder_name)}</td>
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

      {detailOpen ? (
        <CaseDetailModal
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onClose={() => {
            setDetailOpen(false);
            setDetail(null);
            setDetailError(null);
          }}
        />
      ) : null}
    </div>
  );
}
