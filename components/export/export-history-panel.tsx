"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

const STORAGE_KEY = "mohw-export-history-v1";

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

export function buildSummaryFromItems(items: ExportHistoryItem[]): HistorySummary {
  let totalCases = 0;
  let mohwExports = 0;
  let mohwCases = 0;
  for (const item of items) {
    totalCases += item.caseCount;
    if (!item.exportType || item.exportType === "mohw_life_care") {
      mohwExports += 1;
      mohwCases += item.caseCount;
    }
  }
  return {
    totalExports: items.length,
    totalCases,
    mohwExports,
    mohwCases,
    lastExportedAt: items[0]?.exportedAt ?? "",
  };
}

/** 合併：新紀錄在前，同 exportId 不重複 */
export function mergeHistoryItems(
  existing: ExportHistoryItem[],
  incoming: ExportHistoryItem[],
): ExportHistoryItem[] {
  const map = new Map<string, ExportHistoryItem>();
  for (const item of [...incoming, ...existing]) {
    const key = item.exportId || `${item.fileName}|${item.exportedAt}`;
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values()).sort((a, b) =>
    String(b.exportedAt).localeCompare(String(a.exportedAt)),
  );
}

function readStoredHistory(): ExportHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { items?: ExportHistoryItem[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

function writeStoredHistory(items: ExportHistoryItem[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ items: items.slice(0, 100) }));
  } catch {
    // ignore quota
  }
}

export function ExportHistoryPanel({
  items,
  onItemsChange,
}: {
  /** 由父層持有；已載入的紀錄會留存，新匯出只追加 */
  items: ExportHistoryItem[];
  onItemsChange: (items: ExportHistoryItem[]) => void;
}) {
  const [mode, setMode] = useState<"gas" | "demo">("gas");
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const summary = useMemo(() => buildSummaryFromItems(items), [items]);

  // 初次：從 sessionStorage 還原，避免同頁重新整理又打 GAS
  useEffect(() => {
    const stored = readStoredHistory();
    if (stored.length && items.length === 0) {
      onItemsChange(stored);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在掛載時還原
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (items.length) writeStoredHistory(items);
  }, [items, hydrated]);

  const loadFull = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/exports/history?limit=50", { cache: "no-store" });
      const json = (await res.json()) as HistoryResponse;
      if (!res.ok) {
        setError(json.error?.message ?? "讀取匯出紀錄失敗（已保留畫面上的既有紀錄）");
        return;
      }
      const remote = json.data?.items ?? [];
      onItemsChange(mergeHistoryItems(items, remote));
      setMode(json.data?.mode ?? "gas");
      setNote(json.data?.note ?? null);
    } catch {
      setError("讀取匯出紀錄失敗（已保留畫面上的既有紀錄）");
    } finally {
      setLoading(false);
    }
  }, [items, onItemsChange]);

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">匯出紀錄報表</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            已載入的紀錄會留在本頁；新匯出只追加一筆，不必每次重抓全部。需要對帳時再按「同步伺服器」。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {mode === "gas" ? "GAS 正式紀錄" : "示範資料"}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadFull()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            同步伺服器
          </Button>
        </div>
      </div>

      {summary.totalExports > 0 ? (
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
