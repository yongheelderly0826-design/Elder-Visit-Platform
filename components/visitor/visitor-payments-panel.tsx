"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

type PaymentItem = {
  id: string;
  caseId: string;
  caseName: string;
  assignmentId: string;
  visitResult: string;
  auditDecision: string;
  status: "pending_audit" | "approved" | "locked" | "rejected";
  visitFee: number;
  dataProcessingFee: number;
  totalFee: number;
  lockedAt?: string | null;
  updatedAt: string;
};

type PaymentsResponse = {
  data?: {
    visitorName?: string | null;
    items?: PaymentItem[];
    feeRule?: {
      visitFee: number;
      dataProcessingFee: number;
      totalPerCompletedVisit: number;
    };
  };
  error?: { message?: string };
};

function statusLabel(status: PaymentItem["status"]) {
  if (status === "locked") return "核銷通過（已鎖定）";
  if (status === "approved") return "稽核通過，待鎖定";
  if (status === "rejected") return "未通過";
  return "待稽核";
}

export function VisitorPaymentsPanel() {
  const [items, setItems] = useState<PaymentItem[]>([]);
  const [visitorName, setVisitorName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const response = await fetch("/api/visitor/payments", { cache: "no-store" });
        const json = (await response.json()) as PaymentsResponse;
        if (!response.ok) {
          setMessage(json.error?.message ?? "無法讀取核銷狀態");
          return;
        }
        setVisitorName(json.data?.visitorName ?? null);
        setItems(json.data?.items ?? []);
      } catch {
        setMessage("網路異常，請稍後再試");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border bg-card p-4">
        <p className="text-sm font-medium text-primary">訪員核銷</p>
        <h1 className="mt-1 text-2xl font-semibold">我的核銷狀態</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {visitorName ? `${visitorName}，` : ""}
          訪視通過稽核並鎖定後，可在此查看核銷通過與金額。
        </p>
      </section>

      {loading ? (
        <p className="text-sm text-muted-foreground">讀取中…</p>
      ) : items.length === 0 ? (
        <section className="rounded-lg border bg-card p-4">
          <div className="flex items-start gap-3">
            <Wallet className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-semibold">尚無核銷紀錄</p>
              <p className="mt-1 text-sm text-muted-foreground">
                完成訪視並經督導核准後，這裡會顯示核銷狀態。
              </p>
              <Button asChild variant="outline" className="mt-3">
                <Link href="/visitor/tasks">前往任務</Link>
              </Button>
            </div>
          </div>
          {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
        </section>
      ) : (
        <section className="grid gap-3">
          {items.map((item) => {
            const passed = item.status === "locked" || item.status === "approved";
            return (
              <article key={item.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{item.caseName || item.caseId}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.visitResult || "訪視"} · {item.assignmentId}
                    </p>
                  </div>
                  {passed ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                  ) : (
                    <Clock3 className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                </div>
                <p className="mt-3 text-sm font-medium">{statusLabel(item.status)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  稽核：{item.auditDecision || "—"}
                  {item.lockedAt ? ` · 鎖定 ${new Date(item.lockedAt).toLocaleString("zh-TW")}` : ""}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-md bg-secondary p-2">
                    <p className="text-xs text-muted-foreground">訪視費</p>
                    <p className="font-semibold">{item.visitFee}</p>
                  </div>
                  <div className="rounded-md bg-secondary p-2">
                    <p className="text-xs text-muted-foreground">資料費</p>
                    <p className="font-semibold">{item.dataProcessingFee}</p>
                  </div>
                  <div className="rounded-md bg-secondary p-2">
                    <p className="text-xs text-muted-foreground">合計</p>
                    <p className="font-semibold">{item.totalFee} 元</p>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <Button asChild variant="outline">
        <Link href="/visitor/home">回訪員證</Link>
      </Button>
    </div>
  );
}
