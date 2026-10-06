"use client";

import { useCallback, useEffect, useState } from "react";
import { ExportTool } from "@/components/export/export-tool";
import { ExportHistoryPanel } from "@/components/export/export-history-panel";
import { MohwExportPanel } from "@/components/export/mohw-export-panel";
import { PaymentBatchPanel } from "@/components/export/payment-batch-panel";
import { ManagementWorkflowBar } from "@/components/manage/management-workflow-bar";
import type { MohwExportCandidate } from "@/lib/domain/mohw-export-candidates";
import { createPaymentBatchPreview, paymentFeeRules } from "@/lib/domain/payments";
import type { PaymentBatch, PaymentFeeRule } from "@/lib/domain/types";

type BundleResponse = {
  data?: {
    mode: "gas" | "demo";
    candidates: { total: number; readyCount: number; items: MohwExportCandidate[] };
    payments: {
      batch_no?: string;
      item_count: number;
      total_amount: number;
      items: Array<Record<string, unknown>>;
      warnings?: string[];
    };
    counts: { pending_audit: number; approved: number; returned: number };
  };
  error?: { message?: string };
};

function mapPaymentBatch(raw: BundleResponse["data"]): { batch: PaymentBatch; feeRule: PaymentFeeRule } {
  const items = (raw?.payments.items ?? []).map((row) => ({
    id: String(row.id ?? row.visit_record_id ?? ""),
    caseCode: String(row.case_code ?? row.case_id ?? ""),
    elderName: String(row.elder_name ?? ""),
    visitRecordId: String(row.visit_record_id ?? row.id ?? ""),
    lockedAt: String(row.locked_at ?? new Date().toISOString()),
    visitFee: Number(row.visit_fee ?? 180),
    dataProcessingFee: Number(row.data_processing_fee ?? 30),
    totalFee: Number(row.total_fee ?? 210),
    status: (String(row.status) === "exported" ? "exported" : "locked") as "locked" | "exported",
  }));
  const batch = createPaymentBatchPreview(items);
  return {
    batch: {
      ...batch,
      batchNo: String(raw?.payments.batch_no ?? batch.batchNo),
      warnings: raw?.payments.warnings?.length ? raw.payments.warnings : batch.warnings,
    },
    feeRule: paymentFeeRules,
  };
}

export function ExportsWorkspace() {
  const [onlyAudited, setOnlyAudited] = useState(true);
  const [items, setItems] = useState<MohwExportCandidate[]>([]);
  const [mode, setMode] = useState<"gas" | "demo">("gas");
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payment, setPayment] = useState(() => mapPaymentBatch(undefined));
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);

  const loadBundle = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const started = Date.now();
    try {
      const response = await fetch(
        `/api/exports/manager-bundle?onlyAudited=${onlyAudited ? "true" : "false"}`,
        { cache: "no-store" },
      );
      const raw = await response.text();
      let json: BundleResponse;
      try {
        json = JSON.parse(raw) as BundleResponse;
      } catch {
        // bundle 偶發非 JSON（閘道 HTML）→ 改打較輕的候選 API
        const fallback = await fetch(
          `/api/exports/mohw/candidates?onlyAudited=${onlyAudited ? "true" : "false"}`,
          { cache: "no-store" },
        );
        const fallbackJson = (await fallback.json()) as {
          data?: { mode?: "gas" | "demo"; items?: MohwExportCandidate[]; note?: string };
          error?: { message?: string };
        };
        setElapsedMs(Date.now() - started);
        if (!fallback.ok) {
          setItems([]);
          setLoadError(fallbackJson.error?.message ?? "讀取匯出／核銷資料失敗");
          return;
        }
        const nextItems = fallbackJson.data?.items ?? [];
        setItems(nextItems);
        setMode(fallbackJson.data?.mode ?? "gas");
        setPayment(mapPaymentBatch(undefined));
        setNote(
          nextItems.length === 0
            ? onlyAudited
              ? "目前沒有稽核通過的關懷表。若剛核准，請再按一次重新整理。"
              : "目前沒有已提交或已稽核的關懷表。"
            : "核銷彙整暫時改用簡速載入；匯出功能可照常使用。",
        );
        return;
      }
      setElapsedMs(Date.now() - started);
      if (!response.ok) {
        // 502／GAS 失敗時同樣降級
        const fallback = await fetch(
          `/api/exports/mohw/candidates?onlyAudited=${onlyAudited ? "true" : "false"}`,
          { cache: "no-store" },
        );
        const fallbackJson = (await fallback.json()) as {
          data?: { mode?: "gas" | "demo"; items?: MohwExportCandidate[] };
          error?: { message?: string };
        };
        if (fallback.ok) {
          const nextItems = fallbackJson.data?.items ?? [];
          setItems(nextItems);
          setMode(fallbackJson.data?.mode ?? "gas");
          setPayment(mapPaymentBatch(undefined));
          setLoadError(null);
          setNote(
            nextItems.length === 0
              ? onlyAudited
                ? "目前沒有稽核通過的關懷表。若剛核准，請再按一次重新整理。"
                : "目前沒有已提交或已稽核的關懷表。"
              : "核銷彙整暫時改用簡速載入；匯出功能可照常使用。",
          );
          return;
        }
        setItems([]);
        setLoadError(json.error?.message ?? fallbackJson.error?.message ?? "讀取匯出／核銷資料失敗");
        return;
      }
      const nextItems = json.data?.candidates.items ?? [];
      setItems(nextItems);
      setMode(json.data?.mode ?? "gas");
      setPayment(mapPaymentBatch(json.data));
      setNote(
        nextItems.length === 0
          ? onlyAudited
            ? "目前沒有稽核通過的關懷表。若剛核准，請再按一次重新整理。"
            : "目前沒有已提交或已稽核的關懷表。"
          : null,
      );
    } catch {
      setElapsedMs(Date.now() - started);
      setLoadError("讀取匯出／核銷資料失敗");
    } finally {
      setLoading(false);
    }
  }, [onlyAudited]);

  useEffect(() => {
    void loadBundle();
  }, [loadBundle]);

  return (
    <div className="space-y-4">
      <ManagementWorkflowBar active="exports" />
      {elapsedMs != null ? (
        <p className="text-xs text-muted-foreground">
          這次讀取 {Math.round(elapsedMs / 100) / 10} 秒
          {elapsedMs > 8000 ? "（首次連 GAS 會較慢，再按一次通常會在 5 秒內）" : ""}
        </p>
      ) : null}
      <MohwExportPanel
        items={items}
        mode={mode}
        note={loadError ?? note}
        loading={loading}
        onlyAudited={onlyAudited}
        onOnlyAuditedChange={setOnlyAudited}
        onRefresh={() => void loadBundle()}
        onExportSuccess={() => {
          setHistoryRefreshToken((n) => n + 1);
          void loadBundle();
        }}
      />
      <ExportHistoryPanel refreshToken={historyRefreshToken} />
      <PaymentBatchPanel
        initialBatch={payment.batch}
        initialFeeRule={payment.feeRule}
        onBatchCreated={() => void loadBundle()}
      />
      <ExportTool />
    </div>
  );
}
