"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [imagesReady, setImagesReady] = useState(false);

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

  const pages = useMemo(() => buildPages(visitors, mode), [visitors, mode]);

  useEffect(() => {
    if (loading || visitors.length === 0) {
      setImagesReady(false);
      return;
    }
    let cancelled = false;
    async function waitForImages() {
      // 給瀏覽器一點時間掛上 img，再等 decode
      await new Promise((resolve) => setTimeout(resolve, 50));
      const images = Array.from(document.querySelectorAll<HTMLImageElement>(".gas-print-root img"));
      await Promise.all(
        images.map(
          (img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  img.addEventListener("load", () => resolve(), { once: true });
                  img.addEventListener("error", () => resolve(), { once: true });
                }),
        ),
      );
      if (!cancelled) setImagesReady(true);
    }
    void waitForImages();
    return () => {
      cancelled = true;
    };
  }, [loading, visitors, mode, pages.length]);

  const withPhoto = visitors.filter((row) => row.hasPhoto).length;

  return (
    <div className="gas-print-root min-h-screen bg-slate-100 text-slate-950 print:bg-white">
      <style>{printStyles}</style>

      <div className="print-toolbar mx-auto mb-4 flex max-w-5xl flex-col gap-3 rounded-lg border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">GAS 紙本訪員證（證件套）列印</h1>
          <p className="mt-1 text-sm text-slate-600">
            A4 每頁 2×2 張，可裁切。正面含證件照與姓名；背面為統一守則版。建議用瀏覽器「另存
            PDF」或雙面列印。
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {loading
              ? "載入名冊中…"
              : `共 ${visitors.length} 人（有證件照 ${withPhoto}）· 列印頁 ${pages.length} 面`}
            {!loading && !imagesReady ? " · 影像載入中…" : ""}
          </p>
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
          <PrintButton disabled={loading || visitors.length === 0 || !imagesReady} />
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
        <div className="mx-auto flex max-w-5xl flex-col gap-6 print:max-w-none print:gap-0">
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
                          portraitSrc={`/api/users/gas-headshot/${encodeURIComponent(visitor.visitorId)}`}
                        />
                        <p className="cut-caption print:hidden">{visitor.visitorId}</p>
                      </div>
                    ))
                  : Array.from({ length: page.count }).map((_, index) => (
                      <div key={`back-${pageIndex}-${index}`} className="a4-cell">
                        <GasSleeveBadgeTile side="back" />
                      </div>
                    ))}
                {/* 補齊空格，維持裁切格線一致 */}
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
  @page {
    size: A4 portrait;
    margin: 8mm;
  }

  .a4-page {
    width: 210mm;
    min-height: 297mm;
    box-sizing: border-box;
    padding: 8mm;
    page-break-after: always;
    break-after: page;
  }

  .a4-page:last-child {
    page-break-after: auto;
    break-after: auto;
  }

  .a4-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 5mm;
    height: calc(297mm - 16mm);
    width: 100%;
    box-sizing: border-box;
  }

  .a4-cell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    border: 0.3pt dashed #cbd5e1;
    padding: 1.5mm;
    box-sizing: border-box;
  }

  .a4-cell-empty {
    border-style: dotted;
    opacity: 0.35;
  }

  .a4-cell .gas-sleeve-badge {
    width: 100%;
    max-height: 100%;
  }

  .cut-caption {
    position: absolute;
    left: 2mm;
    bottom: 1mm;
    font-size: 8px;
    color: #94a3b8;
    max-width: 90%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .page-footer {
    margin-top: 4mm;
    text-align: center;
    font-size: 12px;
    color: #64748b;
  }

  @media print {
    .print-toolbar { display: none !important; }
    .a4-page {
      width: auto;
      min-height: auto;
      padding: 0;
      margin: 0;
      box-shadow: none;
    }
    .a4-grid {
      height: auto;
      min-height: 270mm;
    }
    .a4-cell {
      border-color: #94a3b8;
    }
  }
`;
