"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { GasSleeveBadgeTile } from "@/components/badges/gas-sleeve-badge-tile";
import { PrintButton } from "@/components/badges/print-button";
import {
  chunkForA4Pages,
  type GasBadgePrintMode,
  type GasBadgePrintVisitor,
} from "@/lib/domain/gas-physical-badge-print";

type SheetPage =
  | { kind: "front"; visitors: GasBadgePrintVisitor[] }
  | { kind: "back"; count: number };

const HEADSHOT_CONCURRENCY = 3;

export function GasBadgePrintSheet({
  initialVisitorIds,
  initialMode = "duplex",
}: {
  initialVisitorIds?: string[];
  initialMode?: GasBadgePrintMode;
}) {
  const [mode, setMode] = useState<GasBadgePrintMode>(initialMode);
  const [visitors, setVisitors] = useState<GasBadgePrintVisitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portraitMap, setPortraitMap] = useState<Record<string, string>>({});
  const [portraitsLoading, setPortraitsLoading] = useState(false);
  const [portraitProgress, setPortraitProgress] = useState({ done: 0, total: 0, ok: 0 });
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (initialVisitorIds && initialVisitorIds.length > 0) {
          params.set("visitorIds", initialVisitorIds.join(","));
        }
        const response = await fetch(`/api/users/gas-badge-print?${params.toString()}`, {
          cache: "no-store",
        });
        const json = (await response.json()) as {
          data?: { visitors: GasBadgePrintVisitor[] };
          error?: { message?: string };
        };
        if (!response.ok || !json.data) {
          throw new Error(json.error?.message ?? "無法載入訪員名冊。");
        }
        if (!cancelled) setVisitors(json.data.visitors);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "無法載入訪員名冊。");
          setVisitors([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [initialVisitorIds]);

  // 限流載入證件照，避免一次打爆 GAS
  useEffect(() => {
    let cancelled = false;

    async function loadPortraits() {
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
      objectUrlsRef.current = [];
      setPortraitMap({});

      if (visitors.length === 0) {
        setPortraitsLoading(false);
        setPortraitProgress({ done: 0, total: 0, ok: 0 });
        return;
      }

      setPortraitsLoading(true);
      setPortraitProgress({ done: 0, total: visitors.length, ok: 0 });

      const nextMap: Record<string, string> = {};
      let done = 0;
      let ok = 0;
      let index = 0;

      async function worker() {
        while (index < visitors.length) {
          if (cancelled) return;
          const current = visitors[index];
          index += 1;
          try {
            const response = await fetch(
              `/api/users/gas-headshot/${encodeURIComponent(current.visitorId)}`,
              { cache: "no-store" },
            );
            if (response.ok) {
              const blob = await response.blob();
              if (blob.type.startsWith("image/") && blob.size > 0) {
                const objectUrl = URL.createObjectURL(blob);
                objectUrlsRef.current.push(objectUrl);
                nextMap[current.visitorId] = objectUrl;
                ok += 1;
              }
            }
          } catch {
            // keep empty; tile shows 無證件照
          } finally {
            done += 1;
            if (!cancelled) {
              setPortraitProgress({ done, total: visitors.length, ok });
              setPortraitMap({ ...nextMap });
            }
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(HEADSHOT_CONCURRENCY, visitors.length) }, () => worker()),
      );

      if (!cancelled) {
        setPortraitMap({ ...nextMap });
        setPortraitsLoading(false);
      }
    }

    void loadPortraits();
    return () => {
      cancelled = true;
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
      objectUrlsRef.current = [];
    };
  }, [visitors]);

  const pages = useMemo(() => buildPages(visitors, mode), [visitors, mode]);
  const withPhoto = visitors.filter((row) => row.hasPhoto).length;
  const imagesReady = !loading && !portraitsLoading && visitors.length > 0;

  return (
    <div className="gas-print-root min-h-screen bg-slate-100 text-slate-950 print:bg-white">
      <style>{printStyles}</style>

      <div className="print-toolbar mx-auto mb-4 flex max-w-5xl flex-col gap-3 rounded-lg border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">GAS 紙本訪員證（證件套）列印</h1>
          <p className="mt-1 text-sm text-slate-600">
            A4 每頁 2×2 張，可裁切。正面含證件照與姓名；背面為統一守則版。證件照會限速載入，請等完成後再列印。
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {loading
              ? "載入名冊中…"
              : `共 ${visitors.length} 人（名冊標示有照 ${withPhoto}）· 列印頁 ${pages.length} 面`}
          </p>
          {!loading && visitors.length > 0 && (
            <p className="mt-1 text-sm text-slate-500">
              {portraitsLoading
                ? `證件照載入中 ${portraitProgress.done}/${portraitProgress.total}（成功 ${portraitProgress.ok}）…`
                : `證件照已載入：成功 ${portraitProgress.ok}／共 ${portraitProgress.total}`}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["front", "只印正面"],
                ["back", "只印背面"],
                ["duplex", "正反交錯（雙面）"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  mode === value
                    ? "bg-emerald-700 text-white"
                    : "border bg-white text-slate-700"
                }`}
                onClick={() => setMode(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <PrintButton disabled={!imagesReady} />
        </div>
      </div>

      {error && (
        <div className="mx-auto mb-4 max-w-5xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          正在讀取 GAS 訪員名冊…
        </div>
      ) : visitors.length === 0 ? (
        <div className="mx-auto max-w-5xl rounded-lg border border-dashed bg-white p-8 text-center text-slate-500">
          沒有可列印的已核准訪員。請確認 GAS 名冊後再試。
        </div>
      ) : (
        <div className="a4-sheet-stack mx-auto flex max-w-5xl flex-col gap-6 print:max-w-none print:gap-0">
          {portraitsLoading && (
            <div className="print:hidden flex items-center justify-center gap-2 rounded-lg border bg-white p-3 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在限速載入證件照（每次 {HEADSHOT_CONCURRENCY} 張），請勿關閉此頁…
            </div>
          )}
          {pages.map((page, pageIndex) => (
            <section
              key={`${page.kind}-${pageIndex}`}
              className="a4-page relative mx-auto bg-white shadow-sm print:shadow-none"
              data-side={page.kind}
            >
              <div className="a4-grid">
                {page.kind === "front"
                  ? page.visitors.map((visitor) => (
                      <div key={visitor.visitorId} className="a4-cell">
                        <GasSleeveBadgeTile
                          side="front"
                          name={visitor.name}
                          visitorId={visitor.visitorId}
                          portraitSrc={portraitMap[visitor.visitorId] || null}
                        />
                        <p className="cut-caption print:hidden">{visitor.visitorId}</p>
                      </div>
                    ))
                  : Array.from({ length: page.count }).map((_, index) => (
                      <div key={`back-${pageIndex}-${index}`} className="a4-cell">
                        <GasSleeveBadgeTile side="back" />
                      </div>
                    ))}
                {page.kind === "front" &&
                  Array.from({ length: Math.max(0, 4 - page.visitors.length) }).map((_, index) => (
                    <div key={`empty-${pageIndex}-${index}`} className="a4-cell a4-cell-empty" />
                  ))}
              </div>
              <p className="page-footer print:hidden">
                第 {pageIndex + 1} / {pages.length} 面 · {page.kind === "front" ? "正面" : "背面"}
              </p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function buildPages(visitors: GasBadgePrintVisitor[], mode: GasBadgePrintMode): SheetPage[] {
  const frontChunks = chunkForA4Pages(visitors);
  if (frontChunks.length === 0) return [];

  if (mode === "front") {
    return frontChunks.map((chunk) => ({ kind: "front", visitors: chunk }));
  }
  if (mode === "back") {
    return frontChunks.map((chunk) => ({ kind: "back", count: chunk.length }));
  }

  const duplex: SheetPage[] = [];
  for (const chunk of frontChunks) {
    duplex.push({ kind: "front", visitors: chunk });
    duplex.push({ kind: "back", count: chunk.length });
  }
  return duplex;
}

const printStyles = `
  /* 紙張邊界只設一次；內容寬度不可再寫死 210mm，否則會右溢出 */
  @page {
    size: A4 portrait;
    margin: 10mm;
  }

  .a4-sheet-stack {
    width: 100%;
  }

  /* 螢幕預覽：模擬 A4 可印區域（210-20=190mm × 297-20=277mm） */
  .a4-page {
    box-sizing: border-box;
    width: min(100%, 190mm);
    min-height: 277mm;
    margin-left: auto;
    margin-right: auto;
    padding: 0;
    page-break-after: always;
    break-after: page;
    overflow: hidden;
  }

  .a4-page:last-child {
    page-break-after: auto;
    break-after: auto;
  }

  .a4-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 4mm;
    box-sizing: border-box;
    width: 100%;
    height: 277mm;
    margin: 0;
    padding: 0;
  }

  .a4-cell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 0.3pt dashed #cbd5e1;
    padding: 1mm;
    box-sizing: border-box;
  }

  .a4-cell-empty {
    border-style: dotted;
    opacity: 0.35;
  }

  .a4-cell .gas-sleeve-badge {
    box-sizing: border-box;
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 100%;
    margin: 0 auto;
  }

  .cut-caption {
    position: absolute;
    left: 1.5mm;
    bottom: 0.8mm;
    font-size: 7px;
    color: #94a3b8;
    max-width: 90%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .page-footer {
    margin-top: 3mm;
    text-align: center;
    font-size: 12px;
    color: #64748b;
  }

  @media print {
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      background: #fff !important;
    }

    .gas-print-root {
      margin: 0 !important;
      padding: 0 !important;
      max-width: none !important;
      width: 100% !important;
      background: #fff !important;
    }

    .print-toolbar,
    .page-footer,
    .cut-caption {
      display: none !important;
    }

    .a4-sheet-stack {
      max-width: none !important;
      width: 100% !important;
      margin: 0 !important;
      gap: 0 !important;
    }

    .a4-page {
      width: 100% !important;
      max-width: 100% !important;
      min-height: 0 !important;
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
      overflow: hidden !important;
    }

    .a4-grid {
      width: 100% !important;
      height: 277mm !important;
      max-width: 100% !important;
      gap: 4mm !important;
    }

    .a4-cell {
      border-color: #94a3b8;
    }
  }
`;
