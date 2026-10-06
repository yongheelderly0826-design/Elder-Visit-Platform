"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, History, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ExportHistoryItem = {
  exportId: string;
  exportType: string;
  caseCount: number;
  fileName: string;
  fileId: string;
  fileUrl: string;
  columnCount: number;
  skippedCount: number;
  exportedBy: string;
  exportedAt: string;
};

export type HistorySummary = {
  totalExports: number;
  totalCases: number;
  mohwExports: number;
  mohwCases: number;
  lastExportedAt: string;
};

type HistoryResponse = {
  data?: {
    mode: "gas" | "demo";
    items: ExportHistoryItem[];
    summary: HistorySummary;
    note?: string;
  };
  error?: { message?: string };
};

function formatTaipei(iso: string) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function typeLabel(type: string) {
  if (type === "mohw_life_care" || !type) return "生活關懷表";
  return type;
}

export function ExportHistoryPanel({
  refreshToken = 0,
  initialItems,
  initialSummary,
}: {
  refreshToken?: number;
  initialItems?: ExportHistoryItem[] | null;
  initialSummary?: HistorySummary | null;
}) {
  const [items, setItems] = useState<ExportHistoryItem[]>(initialItems ?? []);
  const [summary, setSummary] = useState<HistorySummary | null>(initialSummary ?? null);
  const [mode, setMode] = useState<"gas" | "demo">("gas");
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialItems) {
      setItems(initialItems);
      setError(null);
    }
    if (initialSummary) setSummary(initialSummary);
  }, [initialItems, initialSummary]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/exports/history?limit=50", { cache: "no-store" });
      const json = (await res.json()) as HistoryResponse;
      if (!res.ok) {
        // 若頁面已有 bundle 帶入的資料，保留顯示，只提示可稍後重試
        if (!(initialItems && initialItems.length)) {
          setItems([]);
          setSummary(null);
        }
        setError(json.error?.message ?? "讀取匯出紀錄失敗（可稍後再按重新整理）");
        return;
      }
      setItems(json.data?.items ?? []);
      setSummary(json.data?.summary ?? null);
      setMode(json.data?.mode ?? "gas");
      setNote(json.data?.note ?? null);
    } catch {
      setError("讀取匯出紀錄失敗（可稍後再按重新整理）");
    } finally {
      setLoading(false);
    }
  }, [initialItems]);

  useEffect(() => {
    // 已有 bundle 資料時，初次不必再打 history（避免與候選 API 並行打爆 GAS）
    if (refreshToken === 0 && initialItems && initialItems.length > 0) return;
    if (refreshToken === 0 && initialSummary && initialSummary.totalExports > 0) return;
    // 匯出成功後 refreshToken>0，或尚無初始資料時才抓
    if (refreshToken > 0 || !initialItems) {
      void load();
    }
  }, [load, refreshToken, initialItems, initialSummary]);

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">匯出紀錄報表</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            每次生活關懷表匯出會留下檔名流水號（日期時間）與內容筆數，方便對帳與追查。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {mode === "gas" ? "GAS 正式紀錄" : "示範資料"}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            重新整理
          </Button>
        </div>
      </div>

      {summary ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="匯出次數" value={`${summary.totalExports} 次`} />
          <Stat label="累計個案筆數" value={`${summary.totalCases} 筆`} />
          <Stat label="關懷表匯出" value={`${summary.mohwExports} 次／${summary.mohwCases} 筆`} />
          <Stat label="最近一次" value={formatTaipei(summary.lastExportedAt)} />
        </div>
      ) : null}

      {note ? <p className="mt-3 text-sm text-amber-800">{note}</p> : null}
      {error ? <p className="mt-3 text-sm text-amber-800">{error}</p> : null}

      <div className="mt-4 overflow-x-auto rounded-md border">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="bg-secondary">
            <tr>
              <th className="px-3 py-2">匯出時間</th>
              <th className="px-3 py-2">檔名（流水號）</th>
              <th className="px-3 py-2">類型</th>
              <th className="px-3 py-2">內容筆數</th>
              <th className="px-3 py-2">略過</th>
              <th className="px-3 py-2">操作者</th>
              <th className="px-3 py-2">檔案</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  {loading ? "載入中…" : "尚無匯出紀錄。完成一次匯出後會顯示在這裡。"}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.exportId || item.fileName || item.exportedAt} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{formatTaipei(item.exportedAt)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{item.fileName || item.exportId || "—"}</td>
                  <td className="px-3 py-2">{typeLabel(item.exportType)}</td>
                  <td className="px-3 py-2 font-medium">{item.caseCount} 筆</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {item.skippedCount > 0 ? `${item.skippedCount} 筆` : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{item.exportedBy || "—"}</td>
                  <td className="px-3 py-2">
                    {item.fileUrl ? (
                      <a
                        href={item.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        開啟
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-secondary/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
