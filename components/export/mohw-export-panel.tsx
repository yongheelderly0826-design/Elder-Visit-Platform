"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useCan } from "@/components/auth/permission-provider";
import { MohwBatchErrorPanel } from "@/components/export/mohw-batch-error-panel";
import { Button } from "@/components/ui/button";
import type { MohwExportCandidate } from "@/lib/domain/mohw-export-candidates";

type CandidatesResponse = {
  data?: {
    mode: "gas" | "demo";
    total: number;
    readyCount: number;
    items: MohwExportCandidate[];
    note?: string;
  };
  error?: { message?: string };
};

type ExportResponse = {
  data?: {
    mode?: string;
    filename?: string;
    fileUrl?: string;
    content?: string;
    message?: string;
    validation?: {
      ok?: boolean;
      failCount?: number;
      errorLines?: string[];
    };
    skipped?: Array<{ case_id: string; reason: string }>;
  };
  error?: {
    code?: string;
    message?: string;
    errorLines?: string[];
  };
};

export function MohwExportPanel() {
  const canCreateExport = useCan("exports.create");
  const [items, setItems] = useState<MohwExportCandidate[]>([]);
  const [mode, setMode] = useState<"gas" | "demo">("demo");
  const [note, setNote] = useState<string | null>(null);
  const [onlyAudited, setOnlyAudited] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorLines, setErrorLines] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<Array<{ case_id: string; reason: string }>>([]);
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/exports/mohw/candidates?onlyAudited=${onlyAudited ? "true" : "false"}`,
      );
      const json = (await res.json()) as CandidatesResponse;
      if (!res.ok) {
        setItems([]);
        setMessage(json.error?.message ?? "讀取候選清單失敗");
        return;
      }
      const nextItems = json.data?.items ?? [];
      setItems(nextItems);
      setMode(json.data?.mode ?? "demo");
      setNote(json.data?.note ?? null);
      setSelected(new Set(nextItems.filter((item) => item.exportReady).map((item) => item.caseId)));
    } catch {
      setMessage("讀取候選清單失敗");
    } finally {
      setLoading(false);
    }
  }, [onlyAudited]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  const readyCount = useMemo(
    () => items.filter((item) => item.exportReady).length,
    [items],
  );

  const caseLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of items) {
      map[item.caseId] = item.name || item.externalId || item.encodedId || item.caseId;
    }
    return map;
  }, [items]);

  const errorCaseCount = useMemo(
    () => items.filter((item) => !item.validationOk && item.errorCount > 0).length,
    [items],
  );

  function toggle(caseId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });
  }

  function selectReady() {
    setSelected(new Set(items.filter((item) => item.exportReady).map((item) => item.caseId)));
  }

  function selectWithErrors() {
    setSelected(
      new Set(items.filter((item) => !item.validationOk && item.errorCount > 0).map((item) => item.caseId)),
    );
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function runExport() {
    if (!selected.size) {
      setMessage("請先勾選要匯出的個案");
      return;
    }

    setExporting(true);
    setMessage(null);
    setErrorLines([]);
    setSkipped([]);
    setFileUrl(null);
    setPreviewContent(null);

    try {
      const res = await fetch("/api/exports/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          templateId: "export_central_system_excel_v1",
          caseIds: Array.from(selected),
          onlyAudited,
          strict: true,
          purpose: "government_report",
        }),
      });
      const json = (await res.json()) as ExportResponse;

      if (!res.ok) {
        setErrorLines(json.error?.errorLines ?? []);
        setMessage(json.error?.message ?? "匯出失敗");
        return;
      }

      if (json.data?.fileUrl) {
        setFileUrl(json.data.fileUrl);
      }
      if (json.data?.content && !json.data.fileUrl) {
        setPreviewContent(json.data.content);
      }
      if (json.data?.validation?.errorLines?.length) {
        setErrorLines(json.data.validation.errorLines);
      }
      if (json.data?.skipped?.length) {
        setSkipped(json.data.skipped);
      }
      setMessage(json.data?.message ?? `已匯出 ${selected.size} 筆`);
    } catch {
      setMessage("匯出失敗，請稍後再試");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">衛福部中央系統匯出（102 欄）</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            勾選已填關懷表個案，系統會驗證後產生 xlsx 並存到 Google Drive，供手動上傳中央系統。
          </p>
        </div>
        <div className="rounded-md border bg-secondary px-3 py-2 text-sm text-muted-foreground">
          <p>模式：{mode === "gas" ? "GAS 正式匯出" : "示範預覽"}</p>
          <p className="mt-1">
            候選 {items.length} 筆 · 可匯出 {readyCount} 筆 · 驗證失敗 {errorCaseCount} 筆 · 已選{" "}
            {selected.size} 筆
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyAudited}
            onChange={(event) => setOnlyAudited(event.target.checked)}
          />
          只顯示稽核通過
        </label>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadCandidates()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          重新整理
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={selectReady}>
          全選可匯出
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={selectWithErrors}>
          全選驗證失敗
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={clearSelection}>
          清除選取
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canCreateExport || exporting || selected.size === 0}
          onClick={() => void runExport()}
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          匯出選取個案
        </Button>
      </div>

      {note ? <p className="mt-3 text-sm text-amber-800">{note}</p> : null}

      <div className="mt-4 overflow-x-auto rounded-md border">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="bg-secondary">
            <tr>
              <th className="px-3 py-2">選</th>
              <th className="px-3 py-2">姓名</th>
              <th className="px-3 py-2">案號</th>
              <th className="px-3 py-2">區里</th>
              <th className="px-3 py-2">關懷表</th>
              <th className="px-3 py-2">稽核</th>
              <th className="px-3 py-2">驗證</th>
              <th className="px-3 py-2">錯誤明細</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  {loading ? "載入中…" : "目前沒有可匯出候選"}
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const open = expandedCaseId === item.caseId;
                return (
                  <tr key={item.caseId} className="border-t align-top">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(item.caseId)}
                        onChange={() => toggle(item.caseId)}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">{item.name || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {item.externalId || item.encodedId || item.caseId}
                    </td>
                    <td className="px-3 py-2">
                      {item.district} {item.village}
                    </td>
                    <td className="px-3 py-2">{item.careformStatus}</td>
                    <td className="px-3 py-2">{item.auditDecision || "—"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          item.validationOk ? "text-emerald-700" : "text-amber-800"
                        }
                      >
                        {item.validationOk ? "通過" : `${item.errorCount} 錯`}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {item.errorLines.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="space-y-1">
                          <button
                            type="button"
                            className="text-left font-medium text-primary underline-offset-2 hover:underline"
                            onClick={() =>
                              setExpandedCaseId(open ? null : item.caseId)
                            }
                          >
                            {open ? "收合" : "展開"} {item.errorLines.length} 筆
                          </button>
                          {open ? (
                            <ul className="max-h-36 space-y-1 overflow-auto rounded border bg-background p-2 font-mono text-[11px] text-muted-foreground">
                              {item.errorLines.map((line) => (
                                <li key={`${item.caseId}-${line}`}>{line}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="font-mono text-muted-foreground">
                              {item.errorLines[0]}
                              {item.errorLines.length > 1 ? "…" : ""}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {message ? (
        <p className="mt-3 rounded-md bg-secondary p-3 text-sm text-muted-foreground">{message}</p>
      ) : null}

      {fileUrl ? (
        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          <ExternalLink className="h-4 w-4" />
          開啟 Google Drive xlsx
        </a>
      ) : null}

      <MohwBatchErrorPanel
        errorLines={errorLines}
        skipped={skipped}
        caseLabels={caseLabels}
        title="匯出批次錯誤（含儲存格座標）"
      />

      {previewContent ? (
        <textarea
          className="mt-3 min-h-40 w-full rounded-md border bg-background p-3 font-mono text-xs"
          readOnly
          value={previewContent}
        />
      ) : null}

      {!canCreateExport ? (
        <p className="mt-2 text-sm text-muted-foreground">目前角色沒有建立匯出權限。</p>
      ) : null}
    </section>
  );
}
