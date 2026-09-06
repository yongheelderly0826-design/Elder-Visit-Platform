"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, QrCode } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";

type BadgeData = {
  visitorId: string;
  name: string;
  groupName: string;
  badgeNo: string;
  payload: string;
  qrUrl: string;
};

export function VolunteerBadgePanel({ initialVisitorId = "" }: { initialVisitorId?: string }) {
  const [idNumber, setIdNumber] = useState("");
  const [badge, setBadge] = useState<BadgeData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadBadge = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const query = initialVisitorId
        ? `?visitorId=${encodeURIComponent(initialVisitorId)}`
        : "";
      const response = await fetch(`/api/attendance/badge-qr${query}`, { cache: "no-store" });
      const json = (await response.json()) as { data?: BadgeData; error?: { message?: string } };
      if (!response.ok || !json.data) {
        setBadge(null);
        setMessage(json.error?.message ?? "無法產生個人 QR");
        return;
      }
      setBadge(json.data);
    } catch {
      setBadge(null);
      setMessage("網路異常，請稍後再試");
    } finally {
      setBusy(false);
    }
  }, [initialVisitorId]);

  useEffect(() => {
    void loadBadge();
  }, [loadBadge]);

  async function identify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/attendance/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idNumber }),
      });
      const json = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setMessage(json.error?.message ?? "找不到志工");
        return;
      }
      setIdNumber("");
      await loadBadge();
    } catch {
      setMessage("身分確認失敗");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/attendance/me", { method: "DELETE" });
    setBadge(null);
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BrandLogo size="sm" />
          <div>
            <p className="text-sm font-medium text-primary">志工出勤</p>
            <h1 className="text-xl font-semibold">個人識別 QR</h1>
          </div>
        </div>
        {badge ? (
          <button
            type="button"
            className="flex h-10 items-center gap-1 text-sm text-muted-foreground"
            onClick={() => void logout()}
          >
            <LogOut className="h-4 w-4" />
            登出
          </button>
        ) : null}
      </header>

      {!badge ? (
        <form className="grid gap-3 rounded-lg border bg-card p-4" onSubmit={(event) => void identify(event)}>
          <div>
            <h2 className="text-base font-semibold">先確認身分</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              登入後出示個人 QR，給公所櫃台掃描槍掃描即可簽到退。
            </p>
          </div>
          <label className="grid gap-1 text-sm">
            身分證字號
            <input
              value={idNumber}
              onChange={(event) => setIdNumber(event.target.value.toUpperCase())}
              className="h-12 rounded-md border bg-background px-3 font-mono text-lg"
              autoComplete="off"
              required
            />
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? "處理中…" : "顯示個人 QR"}
          </Button>
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </form>
      ) : (
        <section className="grid gap-4 rounded-lg border bg-card p-5 text-center">
          <div>
            <p className="text-sm text-muted-foreground">{badge.groupName || "志工"}</p>
            <p className="mt-1 text-3xl font-semibold">{badge.name}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{badge.visitorId}</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={badge.qrUrl}
            alt={`${badge.name} 個人 QR`}
            className="mx-auto h-64 w-64 rounded-md border bg-white p-2"
          />
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <QrCode className="h-4 w-4" />
            請將此畫面面向櫃台掃描槍
          </p>
          <p className="break-all font-mono text-[11px] text-muted-foreground">{badge.payload}</p>
          <Button type="button" variant="secondary" onClick={() => void loadBadge()} disabled={busy}>
            重新整理 QR
          </Button>
        </section>
      )}

      <p className="text-sm text-muted-foreground">
        外勤集合點簽到請改用
        <Link href="/volunteer/clock" className="mx-1 underline">
          掃集合點 QR
        </Link>
        。
      </p>
    </div>
  );
}
