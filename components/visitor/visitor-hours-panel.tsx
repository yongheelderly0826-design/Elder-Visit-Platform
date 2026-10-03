"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock3, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

type AttendanceRow = {
  attendanceId: string;
  sessionType: string;
  sessionDate: string;
  checkinAt: string;
  checkoutAt: string;
  durationMinutes: number | null;
  hours: string;
  siteName: string;
  channelLabel: string;
  assignmentId: string;
};

type HoursResponse = {
  data?: {
    visitorName?: string | null;
    period?: string;
    quarter?: string;
    records?: AttendanceRow[];
    summary?: {
      visitHours: string;
      volunteerHours: string;
      totalMinutes: number;
    };
    transportEstimate?: Record<string, unknown> | null;
  };
  error?: { message?: string };
};

function formatTime(iso: string) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function VisitorHoursPanel() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [payload, setPayload] = useState<HoursResponse["data"] | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const response = await fetch("/api/visitor/hours", { cache: "no-store" });
        const json = (await response.json()) as HoursResponse;
        if (!response.ok) {
          setMessage(json.error?.message ?? "無法讀取時數");
          return;
        }
        setPayload(json.data ?? null);
        setMessage(null);
      } catch {
        setMessage("網路異常，請稍後再試");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const transport = payload?.transportEstimate as
    | {
        amount?: number;
        title?: string;
        note?: string;
        period?: string;
        group?: string;
        hours?: number;
      }
    | null
    | undefined;

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border bg-card p-4">
        <p className="text-sm font-medium text-primary">時數與費用</p>
        <h1 className="mt-1 text-2xl font-semibold">我的簽到退與累積時數</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {payload?.visitorName ? `${payload.visitorName}，` : ""}
          可查看每次任務／出勤的簽到退時間、累積時數，以及車馬費試算。訪視費核銷請另見核銷頁。
        </p>
      </section>

      {loading ? (
        <p className="text-sm text-muted-foreground">讀取中…</p>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">訪查到宅時數（本月）</p>
              <p className="mt-1 text-2xl font-semibold">{payload?.summary?.visitHours ?? "0.0"} 小時</p>
            </article>
            <article className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">志工出勤時數（本月）</p>
              <p className="mt-1 text-2xl font-semibold">
                {payload?.summary?.volunteerHours ?? "0.0"} 小時
              </p>
            </article>
            <article className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">期間</p>
              <p className="mt-1 text-lg font-semibold">{payload?.period ?? "—"}</p>
              <p className="mt-1 text-xs text-muted-foreground">季結參考：{payload?.quarter}</p>
            </article>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 font-semibold">
                  <Wallet className="h-4 w-4" />
                  車馬費試算（志工規則）
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  獨居關懷組多為季結時數達標發放；與單案訪視費（核銷頁）不同。
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/visitor/payments">訪視費核銷</Link>
              </Button>
            </div>
            <div className="mt-3 text-sm">
              {transport?.amount != null ? (
                <p>
                  試算金額：<span className="font-semibold">{Number(transport.amount)} 元</span>
                  {transport.title ? `（${transport.title}）` : ""}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  {transport?.note || "尚無可試算資料；完成簽到退並累積時數後會顯示。"}
                </p>
              )}
              {transport?.hours != null ? (
                <p className="mt-1 text-muted-foreground">累積時數（試算用）：{transport.hours}</p>
              ) : null}
            </div>
          </section>

          <section className="grid gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Clock3 className="h-4 w-4" />
              簽到退明細
            </p>
            {(payload?.records?.length ?? 0) === 0 ? (
              <article className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                尚無簽到退紀錄。完成到宅門牌簽到或志工出勤後會顯示在此。
              </article>
            ) : (
              payload?.records?.map((row) => (
                <article key={row.attendanceId} className="rounded-lg border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {row.sessionType || "出勤"} · {row.sessionDate}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {row.siteName || row.channelLabel || "—"}
                        {row.assignmentId ? ` · ${row.assignmentId}` : ""}
                      </p>
                    </div>
                    <p className="text-sm font-medium">
                      {row.hours ? `${row.hours} 小時` : row.durationMinutes != null ? `${row.durationMinutes} 分` : "進行中"}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    簽到 {formatTime(row.checkinAt)} → 簽退 {formatTime(row.checkoutAt)}
                  </p>
                </article>
              ))
            )}
          </section>
        </>
      )}

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
