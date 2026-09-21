"use client";

import { useCallback, useEffect, useState } from "react";
import { ExportTool } from "@/components/export/export-tool";
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
  const [counts, setCounts] = useState({ pending_audit: 0, approved: 0, returned: 0 });
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const loadBundle = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const started = Date.now();
    try {
      const response = await fetch(
        `/api/exports/manager-bundle?onlyAudited=${onlyAudited ? "true" : "false"}`,
        { cache: "no-store" },
      );
      const json = (await response.json()) as BundleResponse;
      setElapsedMs(Date.now() - started);
      if (!response.ok) {
        setItems([]);
        setLoadError(json.error?.message ?? "讀取匯出／核銷資料失敗");
        return;
      }
      const nextItems = json.data?.candidates.items ?? [];
      setItems(nextItems);
      setMode(json.data?.mode ?? "gas");
      setPayment(mapPaymentBatch(json.data));
      setCounts(json.data?.counts ?? { pending_audit: 0, approved: 0, returned: 0 });
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
      <ManagementWorkflowBar
        active="exports"
        counts={{
          pendingAudit: `${counts.pending_audit} 件`,
          pendingExport: `${counts.approved} 件已核准`,
          pendingFollowUp: `${counts.returned} 件`,
        }}
      />
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
      />
      <PaymentBatchPanel
        initialBatch={payment.batch}
        initialFeeRule={payment.feeRule}
        onBatchCreated={() => void loadBundle()}
      />
      <ExportTool />
    </div>
  );
}
