"use client";

import { useEffect, useState } from "react";
import { CircleDollarSign, PackageCheck } from "lucide-react";
import { useCan } from "@/components/auth/permission-provider";
import { Button } from "@/components/ui/button";
import { paymentFeeRules } from "@/lib/domain/payments";
import type { PaymentBatch, PaymentFeeRule } from "@/lib/domain/types";

export function PaymentBatchPanel({
  initialBatch,
  initialFeeRule,
  onBatchCreated,
}: {
  initialBatch?: PaymentBatch | null;
  initialFeeRule?: PaymentFeeRule;
  onBatchCreated?: (batch: PaymentBatch) => void;
} = {}) {
  const canCalculatePayments = useCan("payments.calculate");
  const [batch, setBatch] = useState<PaymentBatch | null>(initialBatch ?? null);
  const [feeRule, setFeeRule] = useState<PaymentFeeRule>(initialFeeRule ?? paymentFeeRules);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialBatch) {
      setBatch(initialBatch);
      if (initialFeeRule) setFeeRule(initialFeeRule);
      return;
    }
    void loadPreview();
  }, [initialBatch, initialFeeRule]);

  async function loadPreview() {
    const response = await fetch("/api/payments/batch");
    const result = (await response.json()) as { data?: PaymentBatch; feeRule?: PaymentFeeRule };
    setBatch(result.data ?? null);
    setFeeRule(result.feeRule ?? paymentFeeRules);
  }

  async function createBatch() {
    const response = await fetch("/api/payments/batch", { method: "POST" });
    const result = (await response.json()) as { data?: PaymentBatch; feeRule?: PaymentFeeRule };
    setBatch(result.data ?? null);
    setFeeRule(result.feeRule ?? paymentFeeRules);
    if (result.data) {
      setMessage(`已建立核銷批次 ${result.data.batchNo}`);
      onBatchCreated?.(result.data);
    } else {
      setMessage("建立批次失敗。");
    }
  }

  const showBatch = batch !== null;

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <PackageCheck className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">核銷批次</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        將稽核通過的訪視彙整成核銷批次（訪視費 180 元＋資料處理費 30 元／案），確認後再匯出。
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MiniMetric label="訪視費" value={`${feeRule.visitFee} 元`} />
        <MiniMetric label="資料處理費" value={`${feeRule.dataProcessingFee} 元`} />
        <MiniMetric label="每案合計" value={`${feeRule.totalPerCompletedVisit} 元`} />
      </div>
      <p className="mt-2 rounded-md bg-secondary p-3 text-sm text-muted-foreground">
        {feeRule.description}
      </p>

      {showBatch && batch && (
        <div className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetric label="批次編號" value={batch.batchNo} />
            <MiniMetric label="筆數" value={`${batch.itemCount}`} />
            <MiniMetric label="總額" value={`${batch.totalAmount.toLocaleString("zh-TW")} 元`} />
          </div>

          {batch.warnings.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {batch.warnings.join(" ")}
            </div>
          )}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-secondary">
                <tr>
                  <th className="px-3 py-2 font-medium">案號</th>
                  <th className="px-3 py-2 font-medium">姓名</th>
                  <th className="px-3 py-2 font-medium">鎖定時間</th>
                  <th className="px-3 py-2 font-medium">訪視費</th>
                  <th className="px-3 py-2 font-medium">資料費</th>
                  <th className="px-3 py-2 font-medium">金額</th>
                </tr>
              </thead>
              <tbody>
                {batch.items.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{item.caseCode}</td>
                    <td className="px-3 py-2">{item.elderName}</td>
                    <td className="px-3 py-2">
                      {new Date(item.lockedAt).toLocaleString("zh-TW", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2">{item.visitFee.toLocaleString("zh-TW")}</td>
                    <td className="px-3 py-2">{item.dataProcessingFee.toLocaleString("zh-TW")}</td>
                    <td className="px-3 py-2">{item.totalFee.toLocaleString("zh-TW")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button
            disabled={!canCalculatePayments || batch.itemCount === 0}
            onClick={createBatch}
          >
            <CircleDollarSign className="h-4 w-4" />
            建立核銷批次
          </Button>
          {!canCalculatePayments && (
            <p className="text-sm text-muted-foreground">
              目前角色沒有建立核銷批次權限。
            </p>
          )}
        </div>
      )}

      {message && (
        <p className="mt-3 rounded-md bg-secondary p-3 text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
