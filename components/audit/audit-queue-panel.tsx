"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, Loader2, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { AuditQueueCard } from "@/components/audit/audit-queue-card";
import { ManagementWorkflowBar } from "@/components/manage/management-workflow-bar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { AuditQueueItem } from "@/lib/domain/types";

type QueueResponse = {
  data?: {
    mode: "gas" | "demo";
    total: number;
    items: AuditQueueItem[];
    pendingItems?: AuditQueueItem[];
    supplementItems?: AuditQueueItem[];
    approvedItems?: AuditQueueItem[];
    note?: string;
  };
  error?: { message?: string };
};

function groupByVisitor(items: AuditQueueItem[]) {
  const groups = new Map<string, AuditQueueItem[]>();
  for (const item of items) {
    const key = item.visitorName || item.visitorId || "未指派訪員";
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh-Hant"));
}

export function AuditQueuePanel() {
  const [pendingItems, setPendingItems] = useState<AuditQueueItem[]>([]);
  const [supplementItems, setSupplementItems] = useState<AuditQueueItem[]>([]);
  const [mode, setMode] = useState<"gas" | "demo">("demo");
  const [note, setNote] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/audit/queue?decision=pending&overview=1");
      const json = (await response.json()) as QueueResponse;
      if (!response.ok) {
        setPendingItems([]);
        setSupplementItems([]);
        setMessage(json.error?.message ?? "讀取稽核佇列失敗");
        return;
      }
      setPendingItems(json.data?.pendingItems ?? json.data?.items ?? []);
      setSupplementItems(json.data?.supplementItems ?? []);
      setHiddenIds(new Set());
      setMode(json.data?.mode ?? "demo");
      setNote(json.data?.note ?? null);
    } catch {
      setPendingItems([]);
      setSupplementItems([]);
      setMessage("讀取稽核佇列失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const visiblePending = pendingItems.filter((item) => !hiddenIds.has(item.id));
  const pendingByVisitor = groupByVisitor(visiblePending);
  const supplementByVisitor = groupByVisitor(supplementItems);

  return (
    <div className="grid gap-3">
      <ManagementWorkflowBar active="audit" />

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">
              {mode === "gas" ? "GAS 真實佇列" : "示範佇列"}
            </p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            待稽核 {visiblePending.length} 筆 · 待補件 {supplementItems.length} 筆。核准後關懷表改為「已稽核」，匯出頁可勾選。
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadQueue()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          重新整理
        </Button>
      </div>

      {note ? <p className="text-sm text-amber-800">{note}</p> : null}
      {message ? <p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">{message}</p> : null}

      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">待補件（已派給訪員）</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          退回補件後需由原派案訪員補正；以下依訪員分組。
        </p>
        {loading && supplementItems.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">載入中…</p>
        ) : supplementItems.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">目前沒有待補件案件。</p>
        ) : (
          <div className="mt-3 grid gap-3">
            {supplementByVisitor.map(([visitor, items]) => (
              <article key={visitor} className="rounded-md border bg-background p-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <UserRound className="h-4 w-4 text-primary" />
                  {visitor}
                  <span className="font-normal text-muted-foreground">· {items.length} 件</span>
                </p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {items.map((item) => (
                    <li key={item.id}>
                      {item.elderName} · {item.caseCode}
                      {item.village ? ` · ${item.village}` : ""}
                      {item.careformStatus ? ` · ${item.careformStatus}` : ""}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-base font-semibold">待稽核</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            訪員送出關懷表後會出現在這裡；卡片會顯示個案編碼與負責訪員。
          </p>
        </div>

        {loading && visiblePending.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="載入中" description="正在讀取待稽核關懷表。" />
        ) : visiblePending.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="目前沒有待稽核案件"
            description="真實待審為 0 筆時這裡會空白；上方步驟數字已改為即時統計，不再顯示示範的 27 件。"
          />
        ) : (
          <>
            {pendingByVisitor.length > 1 ? (
              <section className="rounded-lg border bg-card p-4">
                <p className="text-sm font-semibold">依訪員分組</p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {pendingByVisitor.map(([visitor, items]) => (
                    <li key={visitor}>
                      {visitor} · {items.length} 件
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section className="grid gap-3 lg:grid-cols-2">
              {visiblePending.map((item) => (
                <AuditQueueCard
                  key={item.id}
                  item={item}
                  onDecided={() =>
                    setHiddenIds((current) => {
                      const next = new Set(current);
                      next.add(item.id);
                      return next;
                    })
                  }
                />
              ))}
            </section>
          </>
        )}
      </section>
    </div>
  );
}
