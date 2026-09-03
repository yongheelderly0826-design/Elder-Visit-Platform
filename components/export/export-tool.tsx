"use client";

import { useMemo, useState } from "react";
import { Download, FileOutput } from "lucide-react";
import { useCan } from "@/components/auth/permission-provider";
import { Button } from "@/components/ui/button";
import { getConsentPurposeOptions } from "@/lib/domain/consent";
import { exportTemplates } from "@/lib/domain/engines";
import { createExportPreview } from "@/lib/domain/exports";
import { evaluatePlanLimit } from "@/lib/domain/limits";
import { getCurrentWorkspace } from "@/lib/domain/mock-data";
import type { ConsentScope } from "@/lib/domain/types";

export function ExportTool() {
  const canCreateExport = useCan("exports.create");
  const workspace = getCurrentWorkspace();
  const [templateId, setTemplateId] = useState(exportTemplates[0].id);
  const [purpose, setPurpose] = useState<ConsentScope>("government_report");
  const [downloadContent, setDownloadContent] = useState<string | null>(null);
  const [apiMessage, setApiMessage] = useState<string | null>(null);
  const purposeOptions = useMemo(() => getConsentPurposeOptions(), []);
  const exportLimit = useMemo(
    () => evaluatePlanLimit(workspace.planLimits, "max_exports"),
    [workspace.planLimits],
  );
  const preview = useMemo(() => createExportPreview(templateId, purpose), [templateId, purpose]);

  async function createExport() {
    setApiMessage(null);
    const response = await fetch("/api/exports/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateId, purpose }),
    });
    const result = (await response.json()) as {
      data?: { filename: string; content: string };
      error?: { message: string };
    };

    if (!response.ok) {
      setDownloadContent(null);
      setApiMessage(result.error?.message ?? "匯出失敗，請稍後再試。");
      return;
    }

    if (result.data) {
      setDownloadContent(`${result.data.filename}\n\n${result.data.content}`);
      setApiMessage("匯出已依方案限制與同意治理規則產生。");
    }
  }

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileOutput className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">匯出報表</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            依模板、用途與同意治理規則產生匯出內容。已填關懷表可做 DOCX 欄位對照，後台 Excel 可供社會局匯入中央系統。
          </p>
        </div>

        <div
          className={`rounded-md border px-3 py-2 text-sm xl:min-w-72 ${
            exportLimit.state === "ok"
              ? "bg-secondary text-muted-foreground"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <p className="font-medium">方案限制</p>
          <p className="mt-1">{exportLimit.message}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <label className="block text-sm font-medium">
          匯出模板
          <select
            className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            value={templateId}
            onChange={(event) => {
              setTemplateId(event.target.value);
              setDownloadContent(null);
            }}
          >
            {exportTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium">
          匯出用途
          <select
            className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            value={purpose}
            onChange={(event) => {
              setPurpose(event.target.value as ConsentScope);
              setDownloadContent(null);
            }}
          >
            {purposeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <Button className="h-10 w-full lg:w-auto" disabled={!canCreateExport} onClick={createExport}>
          <Download className="h-4 w-4" />
          產生匯出內容
        </Button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">已填關懷表</p>
          <p className="mt-1">
            目前已建立 DOCX 欄位對照模板；下一步要把新北市政府 Word 空白表套版成真正可下載的已勾選 DOCX。
          </p>
        </div>
        <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">中央系統 Excel</p>
          <p className="mt-1">
            請使用上方「衛福部中央系統匯出」面板：勾選個案後由 GAS 產生 xlsx，並顯示 Drive 連結與錯誤座標。
          </p>
        </div>
      </div>

      {preview.governance.warnings.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">同意治理提醒</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {preview.governance.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-lg border bg-background p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">匯出預覽</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              目前用途：{preview.governance.purposeLabel}
              {preview.governance.redactedColumns.length > 0
                ? `，已遮罩 ${preview.governance.redactedColumns.join("、")}`
                : "，可保留必要欄位"}
            </p>
          </div>
          <span className="rounded-md bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
            {preview.template.name}
          </span>
        </div>

        <div className="mt-4 overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="bg-secondary">
              <tr>
                {preview.headers.map((header) => (
                  <th key={header} className="px-3 py-2 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t">
                  {row.map((cell, cellIndex) => (
                    <td key={`${rowIndex}-${cellIndex}`} className="px-3 py-2">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!canCreateExport && (
        <p className="mt-2 text-sm text-muted-foreground">
          目前角色沒有建立匯出權限。
        </p>
      )}

      {apiMessage && (
        <p className="mt-3 rounded-md bg-secondary p-3 text-sm text-muted-foreground">
          {apiMessage}
        </p>
      )}

      {downloadContent && (
        <textarea
          className="mt-4 min-h-56 w-full rounded-md border bg-background p-3 font-mono text-xs"
          readOnly
          value={downloadContent}
        />
      )}
    </section>
  );
}
