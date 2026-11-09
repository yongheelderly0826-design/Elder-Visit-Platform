"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, ClipboardCheck, RefreshCw } from "lucide-react";
import { PageIntro } from "@/components/ui/page-intro";
import { Button } from "@/components/ui/button";
import type {
  MohwProgressSummaryPayload,
  MohwProgressVillageSummary,
} from "@/lib/domain/mohw-progress";

function formatRate(rate: number) {
  if (!Number.isFinite(rate)) return "—";
  return `${rate}%`;
}

function TotalsCards({ totals }: { totals: MohwProgressSummaryPayload["totals"] }) {
  const cards = [
    { label: "名冊總人數", value: totals.roster_total },
    { label: "本系統已KEY", value: totals.platform_keyed },
    {
      label: "直KEY已回報",
      value: totals.direct_done + totals.direct_missed + totals.direct_not_found,
    },
    { label: "整體已完成進度", value: totals.reported },
    { label: "尚未完成", value: totals.remaining },
    { label: "完成率", value: formatRate(totals.completion_rate) },
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border bg-card px-3 py-3">
          <p className="text-xs text-muted-foreground">{card.label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{card.value}</p>
        </div>
      ))}
    </section>
  );
}

function VillageTable({ villages }: { villages: MohwProgressVillageSummary[] }) {
  if (!villages.length) {
    return (
      <p className="rounded-md bg-secondary px-3 py-4 text-sm text-muted-foreground">
        尚無里別進度資料。請先至「衛福部進度回報」確認直KEY狀態，或確認本平台已有關懷表。
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="min-w-[56rem] w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">里別</th>
            <th className="px-3 py-2 font-medium text-right">名冊</th>
            <th className="px-3 py-2 font-medium text-right">本系統已KEY</th>
            <th className="px-3 py-2 font-medium text-right">直KEY已完成</th>
            <th className="px-3 py-2 font-medium text-right">未遇</th>
            <th className="px-3 py-2 font-medium text-right">查無此人</th>
            <th className="px-3 py-2 font-medium text-right">直KEY尚未勾選</th>
            <th className="px-3 py-2 font-medium text-right">整體進度</th>
            <th className="px-3 py-2 font-medium text-right">完成率</th>
            <th className="px-3 py-2 font-medium text-right">尚未完成</th>
          </tr>
        </thead>
        <tbody>
          {villages.map((row) => (
            <tr key={row.village_name} className="border-t">
              <td className="px-3 py-2 font-medium">{row.village_name}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.roster_total}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.platform_keyed}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.direct_done}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.direct_missed}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.direct_not_found}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.direct_unset}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.reported}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatRate(row.completion_rate)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{row.remaining}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MohwProgressDashboard() {
  const [data, setData] = useState<MohwProgressSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/manager/mohw-progress/summary");
      const json = (await response.json()) as {
        data?: MohwProgressSummaryPayload;
        error?: { message?: string };
      };
      if (!response.ok) {
        setMessage(json.error?.message ?? "無法載入儀表板");
        setData(null);
        return;
      }
      setData(json.data ?? null);
    } catch {
      setMessage("無法載入儀表板，請稍後再試。");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-4">
      <PageIntro
        icon={BarChart3}
        eyebrow="里別匯總"
        title="衛福部進度儀表板"
        description="各里名冊進度：本系統已KEY關懷表＋直KEY衛福部狀態（已完成／未遇／查無此人），供承辦掌握完成率。"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "載入中…" : "重新整理"}
        </Button>
        <Link
          href="/desk/mohw-progress"
          className="inline-flex items-center rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted/40"
        >
          <ClipboardCheck className="mr-2 h-4 w-4" />
          前往進度回報
        </Link>
      </div>

      {message && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {message}
        </p>
      )}

      {data && (
        <>
          <TotalsCards totals={data.totals} />
          <section className="rounded-lg border bg-card p-4 space-y-3">
            <div>
              <h2 className="font-semibold">各里進度</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                整體進度＝本系統已KEY ∪ 直KEY有狀態；完成率＝整體進度／名冊。
              </p>
            </div>
            <VillageTable villages={data.villages} />
          </section>
        </>
      )}

      {!data && !loading && !message && (
        <p className="text-sm text-muted-foreground">尚無資料。</p>
      )}
    </div>
  );
}
