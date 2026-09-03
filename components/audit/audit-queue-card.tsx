"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  RotateCcw,
  Stamp,
} from "lucide-react";
import { useCan } from "@/components/auth/permission-provider";
import { Button } from "@/components/ui/button";
import { getAuditFormReviewItems } from "@/lib/domain/visit-form-flow";
import type {
  AuditDecisionResult,
  AuditQueueItem,
  PaymentLockResult,
} from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export function AuditQueueCard({
  item,
  onDecided,
}: {
  item: AuditQueueItem;
  onDecided?: () => void;
}) {
  const isBlocked = item.auditState === "blocked";
  const canApproveAudit = useCan("audit.approve");
  const canRejectAudit = useCan("audit.reject");
  const canLockPayment = useCan("payments.lock");
  const hasWarnings = item.checks.some((check) => check.severity === "warning" && !check.passed);
  const formReviewItems = getAuditFormReviewItems(item);
  const [supervisorNote, setSupervisorNote] = useState("");
  const [overrideWarnings, setOverrideWarnings] = useState(false);
  const [decisionResult, setDecisionResult] = useState<AuditDecisionResult | null>(null);
  const [paymentLockResult, setPaymentLockResult] = useState<PaymentLockResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitDecision(decision: "approve" | "request_changes") {
    setSubmitting(true);
    setErrorMessage(null);
    const response = await fetch("/api/audit/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        auditId: item.id,
        decision,
        supervisorNote,
        overrideWarnings,
      }),
    });
    const result = (await response.json()) as {
      data?: AuditDecisionResult;
      error?: { message?: string; errorLines?: string[] };
    };
    if (!response.ok) {
      const extra = result.error?.errorLines?.length
        ? `：${result.error.errorLines.slice(0, 3).join("；")}`
        : "";
      setErrorMessage(`${result.error?.message ?? "稽核決策失敗"}${extra}`);
      setSubmitting(false);
      return;
    }
    setDecisionResult(result.data ?? null);
    setPaymentLockResult(null);
    setSubmitting(false);
    onDecided?.();
  }

  async function lockPayment() {
    if (!decisionResult?.payment) {
      return;
    }

    setSubmitting(true);
    const response = await fetch("/api/payments/lock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paymentId: `payment_${item.visitRecordId}`,
        calculation: decisionResult.payment,
      }),
    });
    const result = (await response.json()) as { data?: PaymentLockResult };
    setPaymentLockResult(result.data ?? null);
    setSubmitting(false);
  }

  return (
    <article className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{item.elderName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{item.caseCode}</p>
          {item.village ? (
            <p className="mt-1 text-xs text-muted-foreground">{item.village}</p>
          ) : null}
        </div>
        <span
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium",
            isBlocked ? "bg-destructive text-destructive-foreground" : "bg-secondary",
          )}
        >
          {isBlocked ? "阻擋" : "可稽核"}
        </span>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {item.careformStatus ? `關懷表：${item.careformStatus}` : "關懷表：—"}
        {item.visitResult ? ` · ${item.visitResult}` : ""}
        {item.completionPct ? ` · 完成 ${item.completionPct}%` : ""}
      </p>

      <div className="mt-4 space-y-2">
        {item.checks.map((check) => (
          <div key={check.key} className="flex gap-2 rounded-md border bg-background p-2 text-sm">
            {check.passed ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            )}
            <div>
              <p className="font-medium">{check.label}</p>
              <p className="mt-1 text-muted-foreground">{check.message}</p>
            </div>
          </div>
        ))}
      </div>

      {item.errorLines && item.errorLines.length > 0 ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          <p className="font-medium">驗證錯誤（前 {item.errorLines.length} 筆）</p>
          <ul className="mt-2 max-h-28 list-disc space-y-1 overflow-auto pl-4 font-mono">
            {item.errorLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="mt-4 rounded-md border bg-background p-3">
        <div className="flex items-center gap-2">
          <FileCheck2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">四份表單覆核</h3>
        </div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          督導先確認派案前保密同意書，稽核再確認個資同意書與生活關懷表是否完整。
        </p>
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {formReviewItems.map((form) => (
            <div key={form.templateId} className="rounded-md border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">{form.name}</p>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-2 py-1 text-xs font-medium",
                    form.status === "blocked"
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-secondary",
                  )}
                >
                  {form.statusLabel}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {form.stageLabel} · {form.owner}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                完成規則：{form.completionRule}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-4 flex items-center gap-2 rounded-md bg-secondary p-2 text-sm">
        <CircleDollarSign className="h-4 w-4" />
        {isBlocked ? "阻擋項目未通過，暫不核銷／匯出" : "可核准後進入匯出批次"}
      </div>

      <div className="mt-4 grid gap-3">
        <label className="text-sm font-medium">
          主管備註
          <textarea
            className="mt-2 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            value={supervisorNote}
            onChange={(event) => setSupervisorNote(event.target.value)}
            placeholder="補件原因、覆核說明或核准備註"
          />
        </label>

        {hasWarnings && (
          <label className="flex items-start gap-2 rounded-md border bg-background p-3 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={overrideWarnings}
              onChange={(event) => setOverrideWarnings(event.target.checked)}
            />
            <span>主管已覆核提醒項目，同意放行至核銷草稿。</span>
          </label>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            onClick={() => submitDecision("approve")}
            disabled={submitting || isBlocked || !canApproveAudit}
          >
            <Stamp className="h-4 w-4" />
            核准
          </Button>
          <Button
            variant="outline"
            onClick={() => submitDecision("request_changes")}
            disabled={submitting || !canRejectAudit}
          >
            <RotateCcw className="h-4 w-4" />
            退回補件
          </Button>
        </div>
        {(!canApproveAudit || !canRejectAudit) && (
          <p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">
            目前角色缺少部分稽核決策權限，只能執行允許的操作。
          </p>
        )}
        {errorMessage ? (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {errorMessage}
          </p>
        ) : null}
      </div>

      {decisionResult && (
        <div className="mt-4 rounded-md border bg-background p-3 text-sm">
          <p className="font-semibold">{decisionResult.nextStep}</p>
          <p className="mt-1 text-muted-foreground">
            狀態：{getAuditStateLabel(decisionResult.auditState)}，紀錄時間：
            {new Date(decisionResult.decisionLog.createdAt).toLocaleString("zh-TW")}
          </p>
          {decisionResult.payment && (
            <div className="mt-3">
              <p className="font-medium">
                核銷草稿金額：{decisionResult.payment.totalFee.toLocaleString("zh-TW")} 元
              </p>
              <Button
                className="mt-3 w-full"
                variant="outline"
                onClick={lockPayment}
                disabled={submitting || !canLockPayment}
              >
                <CircleDollarSign className="h-4 w-4" />
                鎖定核銷
              </Button>
              {!canLockPayment && (
                <p className="mt-2 text-sm text-muted-foreground">
                  目前角色沒有「鎖定核銷」權限。
                </p>
              )}
            </div>
          )}
          {paymentLockResult && (
            <p className="mt-3 rounded-md bg-secondary p-2 text-muted-foreground">
              {paymentLockResult.message}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function getAuditStateLabel(state: AuditDecisionResult["auditState"]) {
  const labels: Record<AuditDecisionResult["auditState"], string> = {
    ready: "待覆核",
    blocked: "已阻擋",
    approved: "已核准",
    rejected: "已退回",
  };

  return labels[state];
}
