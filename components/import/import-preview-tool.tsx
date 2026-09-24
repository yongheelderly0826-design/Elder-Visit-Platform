"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Database, Download, FileSpreadsheet, RotateCcw, Upload } from "lucide-react";
import {
  parseCsvPreview,
  SAMPLE_ELDER_CASE_IMPORT_CSV,
  SAMPLE_ELDER_CASE_IMPORT_FILENAME,
  type ImportPreview,
} from "@/lib/domain/imports";

export function ImportPreviewTool({ compact = false }: { compact?: boolean }) {
  const [csvText, setCsvText] = useState(SAMPLE_ELDER_CASE_IMPORT_CSV);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadedPreview, setUploadedPreview] = useState<ImportPreview | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const preview = useMemo(() => uploadedPreview ?? parseCsvPreview(csvText), [csvText, uploadedPreview]);

  function resetToSample() {
    setCsvText(SAMPLE_ELDER_CASE_IMPORT_CSV);
    setFileName(SAMPLE_ELDER_CASE_IMPORT_FILENAME);
    setUploadedPreview(null);
    setCommitResult(null);
    setCommitError(null);
  }

  function downloadSample() {
    const blob = new Blob([`${SAMPLE_ELDER_CASE_IMPORT_CSV}\n`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = SAMPLE_ELDER_CASE_IMPORT_FILENAME;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function readImportFile(file: File | null) {
    if (!file) return;

    setFileName(file.name);
    setCommitResult(null);
    setCommitError(null);
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/import/preview", {
      method: "POST",
      body: formData,
    });
    const result = (await response.json()) as { data?: ImportPreview };
    if (result.data) {
      setUploadedPreview(result.data);
    }

    if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
      setCsvText(await file.text());
      return;
    }
  }

  async function commitImport() {
    if (preview.validation.rowsWithWarnings > 0 || !csvText.trim()) return;

    const confirmed = window.confirm(
      `確認將 ${preview.validation.validRows} 筆可匯入資料正式寫入名冊？重複案號會自動略過。`,
    );
    if (!confirmed) return;

    setIsCommitting(true);
    setCommitResult(null);
    setCommitError(null);

    try {
      const response = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csvText, fileName }),
      });
      const result = (await response.json()) as {
        data?: ImportCommitResult;
        error?: { message?: string };
      };

      if (!response.ok || !result.data) {
        setCommitError(result.error?.message ?? "寫入失敗，請稍後再試。");
        return;
      }

      setCommitResult(result.data);
    } finally {
      setIsCommitting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          {compact ? (
            <h3 className="text-base font-semibold">名冊匯入預覽</h3>
          ) : (
            <h1 className="text-2xl font-semibold">名冊匯入預覽</h1>
          )}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          可上傳 CSV/TXT 名冊檔或直接貼上內容；系統先偵測第一列欄位，管理者確認對應後才寫入名冊。
        </p>
        <div className="mt-3 rounded-md border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">必填欄位</p>
          <p className="mt-1">測試編號（或案號）、姓名、訪視地址（或地址）、訪視行政區（或行政區）</p>
          <p className="mt-2 font-medium text-foreground">建議欄位</p>
          <p className="mt-1">個案類型、年齡、戶籍里、主要電話、備用電話、派案優先級</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-secondary"
            onClick={downloadSample}
          >
            <Download className="h-4 w-4" />
            下載匯入範例 CSV
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-secondary"
            onClick={resetToSample}
          >
            <RotateCcw className="h-4 w-4" />
            載入範例到編輯區
          </button>
        </div>
        <label className="mt-4 flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-background p-4 text-center text-sm transition-colors hover:bg-secondary">
          <Upload className="h-5 w-5 text-primary" />
          <span className="font-medium">上傳名冊檔</span>
          <span className="text-muted-foreground">
            支援 CSV/TXT 預覽；XLSX 會先標記為待後端解析
          </span>
          <input
            className="hidden"
            type="file"
            accept=".csv,.txt,.xlsx"
            onChange={(event) => void readImportFile(event.target.files?.[0] ?? null)}
          />
        </label>
        {fileName && (
          <p className="mt-2 rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">
            已選擇：{fileName}
          </p>
        )}
        <textarea
          className="mt-4 min-h-60 w-full rounded-md border bg-background p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
          value={csvText}
          onChange={(event) => {
            setUploadedPreview(null);
            setCommitResult(null);
            setCommitError(null);
            setCsvText(event.target.value);
          }}
          aria-label="名冊 CSV 內容"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          預設已載入 3 筆永和示範資料（案號 DEMO-YH-*）；正式清冊請替換成實際案號後再寫入。
        </p>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-base font-semibold">欄位對應建議</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <ImportMetric label="總筆數" value={preview.validation.totalRows} />
          <ImportMetric label="可匯入" value={preview.validation.validRows} />
          <ImportMetric label="需修正" value={preview.validation.rowsWithWarnings} />
        </div>
        {preview.validation.warnings.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {preview.validation.warnings.join("；")}
          </div>
        )}
        <div className="mt-4 rounded-lg border bg-background p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">正式寫入流程</p>
              <p className="mt-1 text-sm text-muted-foreground">
                完成檢核後寫入名冊；已有相同個案編碼者會略過，不重複新增。
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                isCommitting || preview.validation.validRows === 0 || preview.validation.rowsWithWarnings > 0
              }
              onClick={() => void commitImport()}
            >
              <Database className="h-4 w-4" />
              {isCommitting ? "寫入中" : "確認寫入名冊"}
            </button>
          </div>
          {commitError && (
            <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {commitError}
            </p>
          )}
          {commitResult && (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                匯入批次 {commitResult.batchCode} 已完成
              </div>
              <p className="mt-1">
                新增 {commitResult.insertedRows} 筆，略過重複 {commitResult.skippedRows} 筆。
              </p>
            </div>
          )}
        </div>
        <div className="mt-4 space-y-3">
          {preview.suggestedMappings.map((mapping) => (
            <div key={mapping.sourceColumn} className="rounded-md border bg-background p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{mapping.sourceColumn}</span>
                <span className="rounded-md bg-secondary px-2 py-1 text-xs">
                  {mapping.confidence}%
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">→ {mapping.targetField}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-6 text-base font-semibold">前 5 筆資料</h2>
        <div className="mt-3 overflow-x-auto rounded-md border">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="bg-secondary">
              <tr>
                {preview.columns.map((column) => (
                  <th key={column} className="px-3 py-2 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, index) => (
                <tr key={index} className="border-t">
                  {preview.columns.map((column) => (
                    <td key={column} className="px-3 py-2">
                      {row[column]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type ImportCommitResult = {
  batchCode: string;
  totalRows: number;
  parsedRows: number;
  insertedRows: number;
  skippedRows: number;
  skippedCaseCodes: string[];
  columns: string[];
};

function ImportMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
