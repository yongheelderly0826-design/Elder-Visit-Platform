"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { AuditQueueCard } from "@/components/audit/audit-queue-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { AuditQueueItem } from "@/lib/domain/types";

type QueueResponse = {
  data?: {
    mode: "gas" | "demo";
    total: number;
    items: AuditQueueItem[];
    note?: string;
  };
  error?: { message?: string };
};

export function AuditQueuePanel() {
  const [items, setItems] = useState<AuditQueueItem[]>([]);
  const [mode, setMode] = useState<"gas" | "demo">("demo");
  const [note, setNote] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/audit/queue?decision=pending");
      const json = (await response.json()) as QueueResponse;
      if (!response.ok) {
        setItems([]);
        setMessage(json.error?.message ?? "讀取稽核佇列失敗");
        return;
      }
      setItems(json.data?.items ?? []);
      setHiddenIds(new Set());
      setMode(json.data?.mode ?? "demo");
      setNote(json.data?.note ?? null);
    } catch {
      setItems([]);
      setMessage("讀取稽核佇列失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const visibleItems = items.filter((item) => !hiddenIds.has(item.id));

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">
              {mode === "gas" ? "GAS 真實佇列" : "示範佇列"}
            </p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            待審 {visibleItems.length} 筆。核准後關懷表改為「已稽核」，匯出頁可勾選。
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadQueue()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          重新整理
        </Button>
      </div>

      {note ? <p className="text-sm text-amber-800">{note}</p> : null}
      {message ? <p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">{message}</p> : null}

      {loading && visibleItems.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="載入中" description="正在讀取待稽核關懷表。" />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="目前沒有待稽核案件"
          description="訪員送出關懷表後會出現在這裡；核准後可至匯出管理勾選。"
        />
      ) : (
        <section className="grid gap-3 lg:grid-cols-2">
          {visibleItems.map((item) => (
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
      )}
    </div>
  );
}
