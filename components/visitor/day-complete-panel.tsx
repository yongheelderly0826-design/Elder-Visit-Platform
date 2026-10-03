"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OFFICE_KIOSK_SITE_ID } from "@/lib/domain/volunteer-attendance";

export function DayCompletePanel({
  totalTasks,
  remainingTasks,
  visitorName,
}: {
  totalTasks: number;
  remainingTasks: number;
  visitorName?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [checkedOut, setCheckedOut] = useState(false);

  if (totalTasks === 0 || remainingTasks > 0) return null;

  async function confirmCheckout() {
    const ok = window.confirm(
      "確認簽退今日志工出勤？\n（這不會取消已送出的訪查紀錄；若下午還要繼續出勤，請勿簽退。）",
    );
    if (!ok) return;

    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/attendance/clock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId: OFFICE_KIOSK_SITE_ID,
          channel: "badge_qr",
          source: "office_kiosk",
        }),
      });
      const json = (await response.json()) as {
        data?: { action?: "checkin" | "checkout"; visitor?: { name?: string } };
        error?: { message?: string };
      };
      if (!response.ok) {
        setMessage(
          json.error?.message ??
            "無法簽退。若尚未做志工集合點／櫃檯簽到，請先至訪員證頁簽到後再簽退。",
        );
        return;
      }
      if (json.data?.action === "checkin") {
        setMessage("目前沒有進行中的出勤，系統改為簽到。若要簽退，請稍後再按一次確認。");
        return;
      }
      setCheckedOut(true);
      setMessage(`${json.data?.visitor?.name ?? visitorName ?? ""} 已確認簽退今日出勤。`);
    } catch {
      setMessage("網路異常，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">已完成今日任務</p>
          <p className="mt-1 text-sm text-muted-foreground">
            本日派案共 {totalTasks} 件皆已送出。可選擇確認簽退志工出勤（需先有今日簽到）。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void confirmCheckout()} disabled={busy || checkedOut}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
              {checkedOut ? "已確認簽退" : "確認簽退今日出勤"}
            </Button>
            <Button asChild variant="outline">
              <Link href="/visitor/hours">查看時數／費用</Link>
            </Button>
          </div>
          {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
        </div>
      </div>
    </section>
  );
}
