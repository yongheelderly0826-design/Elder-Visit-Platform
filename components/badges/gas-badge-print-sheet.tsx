"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { GasSleeveBadgeTile } from "@/components/badges/gas-sleeve-badge-tile";
import { PrintButton } from "@/components/badges/print-button";
import { useGasBadgePrintTray } from "@/components/badges/use-gas-badge-print-data";
import {
  chunkForA4Pages,
  GAS_BADGES_PER_A4_PAGE,
  placeBackSlots,
  visitorMatchesPrintQuery,
  type GasBadgePrintMode,
  type GasBadgePrintVisitor,
} from "@/lib/domain/gas-physical-badge-print";

type SheetPage =
  | { kind: "front"; visitors: GasBadgePrintVisitor[] }
  | { kind: "back"; slots: Array<GasBadgePrintVisitor | null> }
  | { kind: "check-front" }
  | { kind: "check-back" };

const HEADSHOT_CONCURRENCY = 3;

export function GasBadgePrintSheet({
  initialVisitorIds,
  initialMode = "duplex",
}: {
  initialVisitorIds?: string[];
  initialMode?: GasBadgePrintMode;
}) {
  const [catalog, setCatalog] = useState<GasBadgePrintVisitor[]>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "error">("loading");
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [mode, setMode] = useState<GasBadgePrintMode>(initialMode);
  const [query, setQuery] = useState("");
  const { visitors, stagedIds, stageVisitor, unstageVisitor, clearTray } = useGasBadgePrintTray(
    catalog,
    initialVisitorIds,
  );
  const [portraitMap, setPortraitMap] = useState<Record<string, string>>({});
  const [portraitsLoading, setPortraitsLoading] = useState(false);
  const [portraitProgress, setPortraitProgress] = useState({ done: 0, total: 0, ok: 0 });
  const [loadedPortraitKey, setLoadedPortraitKey] = useState("");
  const objectUrlsRef = useRef<string[]>([]);

  // 名冊改由客戶端載入，避免伺服器等 GAS 時整頁白屏
  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      setCatalogState("loading");
      setCatalogError(null);
      try {
        const response = await fetch("/api/users/gas-badge-print", { cache: "no-store" });
        const json = (await response.json()) as {
          data?: { visitors?: GasBadgePrintVisitor[] };
          error?: { message?: string };
        };
        if (!response.ok || !Array.isArray(json.data?.visitors)) {
          throw new Error(json.error?.message ?? "無法載入訪查員名冊。");
        }
        if (!cancelled) {
          setCatalog(json.data.visitors);
          setCatalogState("ready");
        }
      } catch (cause) {
        if (!cancelled) {
          setCatalog([]);
          setCatalogState("error");
          setCatalogError(cause instanceof Error ? cause.message : "無法載入訪查員名冊。");
        }
      }
    }
    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  // 限流載入證件照，避免一次打爆 GAS
  useEffect(() => {
    let cancelled = false;

    async function loadPortraits() {
      const batchKey = visitors.map((visitor) => visitor.visitorId).join("\u0000");
      setLoadedPortraitKey("");
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
      objectUrlsRef.current = [];
      setPortraitMap({});

      if (visitors.length === 0) {
        setPortraitsLoading(false);
        setPortraitProgress({ done: 0, total: 0, ok: 0 });
        setLoadedPortraitKey("");
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
        setLoadedPortraitKey(batchKey);
      }
    }

    void loadPortraits();
    return () => {
      cancelled = true;
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
      objectUrlsRef.current = [];
    };
  }, [visitors]);

  const searchHits = useMemo(() => {
    if (!query.trim()) return [];
    return catalog
      .filter((visitor) => visitorMatchesPrintQuery(visitor, query))
      .filter((visitor) => !stagedIds.includes(visitor.visitorId))
      .slice(0, 8);
  }, [catalog, query, stagedIds]);
  const pages = useMemo(() => buildPages(visitors, mode), [visitors, mode]);
  const withPhoto = visitors.filter((row) => row.hasPhoto).length;
  const physicalSheets =
    mode === "check" ? 1 : Math.ceil(visitors.length / GAS_BADGES_PER_A4_PAGE);
  const remainder = visitors.length % GAS_BADGES_PER_A4_PAGE;
  const remainingForFullSheet =
    remainder === 0 ? 0 : GAS_BADGES_PER_A4_PAGE - remainder;
  const visitorKey = visitors.map((visitor) => visitor.visitorId).join("\u0000");
  const imagesReady =
    mode === "check" ||
    (!portraitsLoading && visitors.length > 0 && loadedPortraitKey === visitorKey);
  const actualMissingPhotos = Math.max(0, portraitProgress.total - portraitProgress.ok);
  const printConfirmMessage =
    mode === "duplex"
      ? `請確認印表機使用 A4、100% 比例、雙面長邊翻面。${
          actualMissingPhotos > 0
            ? `\n\n目前有 ${actualMissingPhotos} 位未載入證件照，將以「無證件照」列印。`
            : ""
        }`
      : actualMissingPhotos > 0
        ? `目前有 ${actualMissingPhotos} 位未載入證件照，將以「無證件照」列印。確定繼續嗎？`
        : undefined;

  function addVisitor(visitorId: string) {
    stageVisitor(visitorId);
    setQuery("");
  }

  return (
    <div className="gas-print-root min-h-screen bg-slate-100 text-slate-950 print:bg-white">
      <style>{printStyles}</style>

      <div className="print-toolbar mx-auto mb-4 max-w-5xl rounded-lg border bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold">紙本訪查員證（證件套）列印</h1>
            <p className="mt-1 text-sm text-slate-600">
              搜尋一位加入待列印清單，再繼續找下一位。每 4 位排成一張 A4（2×2），超過 4 位會自動接下一張。
            </p>
            <p className="mt-2 text-sm text-slate-500" aria-live="polite">
              {catalogState === "loading"
                ? "正在載入已核准訪查員名冊…"
                : catalogState === "error"
                  ? catalogError || "目前讀不到已核准訪查員名冊。"
                  : `待列印 ${visitors.length} 位 · A4 ${physicalSheets} 張 · 列印 ${pages.length} 面 · 缺照片 ${visitors.length - withPhoto} 位 · 名冊 ${catalog.length} 人`}
            </p>
            {visitors.length > 0 && (
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
                  ["duplex", "雙面列印"],
                  ["check", "對位檢查"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`min-h-11 rounded-md px-3 py-1.5 text-sm font-medium ${
                    mode === value
                      ? "bg-emerald-700 text-white"
                      : "border bg-white text-slate-700"
                  }`}
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                >
                  {label}
                </button>
              ))}
            </div>
            <PrintButton disabled={!imagesReady} confirmMessage={printConfirmMessage} />
            {mode !== "check" && visitors.length > 0 && remainingForFullSheet > 0 ? (
              <p className="text-xs text-amber-800">
                尚未滿版，再加入 {remainingForFullSheet} 位可填滿最後一張；現在仍可列印。
              </p>
            ) : mode !== "check" && visitors.length > 0 ? (
              <p className="text-xs font-medium text-emerald-700">
                最後一張已滿版，可直接列印。
              </p>
            ) : null}
            {mode === "duplex" ? (
              <p className="max-w-sm text-xs leading-5 text-slate-600">
                雙面列印請選 A4、100% 比例、關閉頁首頁尾，並使用長邊翻面；第一次列印建議先做對位檢查。
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 border-t pt-4">
          <label className="grid gap-1 text-sm font-medium">
            搜尋一位加入待列印清單
            <input
              className="h-11 w-full rounded-md border px-3 text-sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="姓名、訪查員編碼或 Email"
            />
          </label>

          {query.trim() ? (
            <div className="grid gap-2" aria-live="polite">
              {searchHits.map((visitor) => (
                <button
                  key={visitor.visitorId}
                  type="button"
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => addVisitor(visitor.visitorId)}
                >
                  <span>
                    <span className="font-semibold">{visitor.name}</span>
                    <span className="mt-0.5 block text-slate-500">
                      {visitor.visitorCode}
                      {visitor.hasPhoto ? " · 有證件照" : " · 尚無證件照"}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium text-emerald-700">加入暫存</span>
                </button>
              ))}
              {searchHits.length === 0 ? (
                <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  找不到尚未加入的已核准訪查員。
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              搜到一位就加入；改搜下一位時，前面的人會繼續保留。
            </p>
          )}

          {visitors.length > 0 ? (
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">待列印清單 {visitors.length} 位</p>
                <button
                  type="button"
                  className="text-sm font-medium text-slate-600 underline-offset-2 hover:underline"
                  onClick={clearTray}
                >
                  全部清空
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {visitors.map((visitor) => (
                  <span
                    key={visitor.visitorId}
                    className="inline-flex items-center gap-2 rounded-full border bg-slate-50 px-3 py-1 text-sm"
                  >
                    {visitor.name}
                    <button
                      type="button"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                      onClick={() => unstageVisitor(visitor.visitorId)}
                      aria-label={`移除 ${visitor.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {catalogState === "loading" ? (
        <div className="mx-auto mb-4 flex max-w-5xl items-center justify-center gap-2 rounded-lg border bg-white p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在讀取 GAS 訪查員名冊，畫面可先操作搜尋列，名冊就緒後即可加入。
        </div>
      ) : null}

      {catalogState === "error" ? (
        <div className="mx-auto mb-4 max-w-5xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {catalogError || "目前讀不到已核准訪查員名冊，請稍後重新整理。"}
        </div>
      ) : null}

      {visitors.length === 0 && mode !== "check" ? (
        <div className="mx-auto max-w-5xl rounded-lg border border-dashed bg-white p-8 text-center text-slate-500">
          {catalogState === "loading"
            ? "名冊載入中，載入完成後即可搜尋並加入待列印清單。"
            : "先在上方搜尋一位並加入待列印清單；加入後可繼續搜尋其他人。"}
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-full flex-col items-center gap-6 print:max-w-none print:gap-0">
          {portraitsLoading && mode !== "check" && (
            <div className="print:hidden flex items-center justify-center gap-2 rounded-lg border bg-white p-3 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在限速載入證件照（每次 {HEADSHOT_CONCURRENCY} 張），請勿關閉此頁…
            </div>
          )}
          {mode === "check" && (
            <p className="print:hidden mx-auto max-w-5xl rounded-md border bg-white px-3 py-2 text-sm text-slate-600">
              請用雙面、長邊翻面列印這兩頁。翻面後對光看，同一格應看到同一個數字。若 1 對到 2，代表印表機改成了短邊翻面。
            </p>
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
                  : null}
                {page.kind === "front"
                  ? Array.from({ length: Math.max(0, 4 - page.visitors.length) }).map((_, index) => (
                      <div key={`empty-${pageIndex}-${index}`} className="a4-cell a4-cell-empty" />
                    ))
                  : null}
                {page.kind === "back"
                  ? page.slots.map((visitor, index) =>
                      visitor ? (
                        <div key={`${visitor.visitorId}-back-${index}`} className="a4-cell">
                          <GasSleeveBadgeTile side="back" />
                        </div>
                      ) : (
                        <div key={`back-empty-${pageIndex}-${index}`} className="a4-cell a4-cell-empty" />
                      ),
                    )
                  : null}
                {page.kind === "check-front" || page.kind === "check-back"
                  ? checkSlotNumbers(page.kind).map((label, index) => (
                      <div key={`${page.kind}-${index}`} className="a4-cell">
                        <div className="align-check-cell">
                          <span className="align-check-num">{label}</span>
                          <span className="align-check-cap">
                            {page.kind === "check-front" ? "正面" : "背面"}
                          </span>
                        </div>
                      </div>
                    ))
                  : null}
              </div>
              <p className="page-footer print:hidden">
                第 {pageIndex + 1} / {pages.length} 面 · {pageLabel(page.kind)}
              </p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function buildPages(visitors: GasBadgePrintVisitor[], mode: GasBadgePrintMode): SheetPage[] {
  if (mode === "check") {
    return [{ kind: "check-front" }, { kind: "check-back" }];
  }

  const frontChunks = chunkForA4Pages(visitors);
  if (frontChunks.length === 0) return [];

  if (mode === "front") {
    return frontChunks.map((chunk) => ({ kind: "front", visitors: chunk }));
  }
  if (mode === "back") {
    return frontChunks.map((chunk) => ({ kind: "back", slots: placeBackSlots(chunk) }));
  }

  const duplex: SheetPage[] = [];
  for (const chunk of frontChunks) {
    duplex.push({ kind: "front", visitors: chunk });
    duplex.push({ kind: "back", slots: placeBackSlots(chunk) });
  }
  return duplex;
}

function checkSlotNumbers(kind: "check-front" | "check-back"): number[] {
  const front = [1, 2, 3, 4];
  if (kind === "check-front") return front;
  return placeBackSlots(front).map((value) => value ?? 0);
}

function pageLabel(kind: SheetPage["kind"]) {
  if (kind === "front" || kind === "check-front") return "正面";
  return "背面";
}

const printStyles = `
  @page {
    size: A4 portrait;
    margin: 6mm;
  }

  .a4-page {
    width: min(210mm, 100%);
    max-width: 100%;
    min-height: 0;
    box-sizing: border-box;
    padding: 4mm;
    margin-left: auto;
    margin-right: auto;
    overflow: hidden;
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
    gap: 3mm;
    width: 100%;
    height: 270mm;
    max-height: calc(100vh - 14rem);
    box-sizing: border-box;
    margin: 0 auto;
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
    width: auto;
    height: 100%;
    max-width: 100%;
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

  .align-check-cell {
    display: flex;
    height: 100%;
    width: 100%;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1.2pt solid #0f766e;
    background: #f0fdfa;
    color: #0f766e;
  }

  .align-check-num {
    font-size: 48pt;
    font-weight: 700;
    line-height: 1;
  }

  .align-check-cap {
    margin-top: 4mm;
    font-size: 14pt;
    font-weight: 600;
  }

  @media print {
    .print-toolbar { display: none !important; }
    .gas-print-root {
      width: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
    .a4-page {
      width: 100%;
      max-width: 100%;
      height: 285mm;
      min-height: 0;
      padding: 0;
      margin: 0 auto;
      box-shadow: none;
      overflow: hidden;
    }
    .a4-grid {
      width: 100%;
      height: 100%;
      max-height: none;
      min-height: 0;
      gap: 2.5mm;
      margin: 0 auto;
    }
    .a4-cell {
      border-color: #94a3b8;
    }
  }
`;
