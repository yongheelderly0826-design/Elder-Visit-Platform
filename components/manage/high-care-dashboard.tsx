"use client";

import { useEffect, useMemo, useState } from "react";
import { HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageIntro } from "@/components/ui/page-intro";
import { HIGH_CARE_COLOR_ORDER, HIGH_CARE_STATUSES } from "@/lib/domain/high-care-rules";
import type { HighCareRecord } from "@/lib/domain/high-care-demo";

type Stats = Record<string, number>;

export function HighCareDashboard() {
  const [items, setItems] = useState<HighCareRecord[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [color, setColor] = useState("");
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (color) params.set("color", color);
    if (status) params.set("status", status);
    return params.toString();
  }, [color, status]);

  async function load() {
    const response = await fetch(`/api/high-care${query ? `?${query}` : ""}`);
    const result = (await response.json()) as {
      data?: { items: HighCareRecord[]; stats: Stats };
      error?: { message?: string };
    };
    if (!response.ok) {
      setMessage(result.error?.message ?? "無法讀取高關懷名冊");
      return;
    }
    setItems(result.data?.items ?? []);
    setStats(result.data?.stats ?? {});
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function updateStatus(id: string, next: string) {
    setMessage(null);
    const response = await fetch("/api/high-care", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ high_care_id: id, status: next }),
    });
    if (!response.ok) {
      const result = (await response.json()) as { error?: { message?: string } };
      setMessage(result.error?.message ?? "更新失敗");
      return;
    }
    await load();
  }

  return (
    <div className="grid gap-4">
      <PageIntro
        icon={HeartPulse}
        eyebrow="高關懷名冊"
        title="橘／黃／綠自動列管"
        description="紙本色塊選項一經勾選（對應 102 欄風險值），送出關懷表後自動列入，不必再填一張表。可依顏色篩選與更新追蹤狀態。"
        aside={
          <div className="grid gap-2 text-sm sm:min-w-[16rem] sm:grid-cols-2">
            <SummaryStat label="列管中" value={String(stats.追蹤中 ?? 0)} />
            <SummaryStat label="合計" value={String(stats.total ?? 0)} />
            <SummaryStat label="橘" value={String(stats.橘 ?? 0)} />
            <SummaryStat label="黃" value={String(stats.黃 ?? 0)} />
            <SummaryStat label="綠" value={String(stats.綠 ?? 0)} />
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={color === "" ? "default" : "outline"} onClick={() => setColor("")}>
          全部顏色
        </Button>
        {HIGH_CARE_COLOR_ORDER.map((item) => (
          <Button
            key={item}
            type="button"
            variant={color === item ? "default" : "outline"}
            onClick={() => setColor(item)}
          >
            {item}
          </Button>
        ))}
        <span className="mx-2 hidden h-8 w-px bg-border sm:block" />
        <Button type="button" variant={status === "" ? "default" : "outline"} onClick={() => setStatus("")}>
          全部狀態
        </Button>
        {HIGH_CARE_STATUSES.map((item) => (
          <Button
            key={item}
            type="button"
            variant={status === item ? "default" : "outline"}
            onClick={() => setStatus(item)}
          >
            {item}
          </Button>
        ))}
      </div>

      {message && <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm">{message}</p>}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">案號／姓名</th>
              <th className="px-3 py-2">顏色</th>
              <th className="px-3 py-2">觸發題項</th>
              <th className="px-3 py-2">狀態</th>
              <th className="px-3 py-2">更新</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.high_care_id} className="border-t">
                <td className="px-3 py-2">
                  <p className="font-medium">{row.elder_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{row.encoded_id || row.case_id}</p>
                </td>
                <td className="px-3 py-2">{row.colors || row.primary_color}</td>
                <td className="max-w-md px-3 py-2 text-xs leading-6">{row.trigger_labels}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {HIGH_CARE_STATUSES.filter((item) => item !== row.status).map((item) => (
                      <Button key={item} size="sm" type="button" variant="outline" onClick={() => void updateStatus(row.high_care_id, item)}>
                        {item}
                      </Button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-muted-foreground" colSpan={5}>
                  目前沒有符合篩選的高關懷列。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
