"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ScanLine } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { taipeiTime, type AttendanceRecord, type VolunteerWorker } from "@/lib/domain/volunteer-attendance";

type ClockResponse = {
  data?: {
    action?: "checkin" | "checkout";
    record?: AttendanceRecord | null;
    visitor?: VolunteerWorker;
  };
  error?: { message?: string };
};

export function OfficeKioskPanel() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [scanValue, setScanValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => taipeiTime(new Date()));
  const [result, setResult] = useState<{
    action: string;
    name: string;
    groupName: string;
    time: string;
    method: string;
  } | null>(null);
  const [message, setMessage] = useState("請掃描身分證條碼，或志工手機上的個人 QR");

  useEffect(() => {
    inputRef.current?.focus();
    const timer = window.setInterval(() => {
      setNow(taipeiTime(new Date()));
      inputRef.current?.focus();
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function punch(event: React.FormEvent) {
    event.preventDefault();
    const value = scanValue.trim();
    if (!value || busy) return;
    setBusy(true);
    setMessage("處理中…");
    try {
      const response = await fetch("/api/attendance/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scan: value,
          source: "office_kiosk",
        }),
      });
      const json = (await response.json()) as ClockResponse;
      if (!response.ok) {
        setResult(null);
        setMessage(json.error?.message ?? "刷證失敗");
        return;
      }
      const action = json.data?.action === "checkout" ? "簽退" : "簽到";
      const time = taipeiTime(json.data?.record?.checkoutAt || json.data?.record?.checkinAt);
      const channel = json.data?.record?.channel;
      setResult({
        action,
        name: json.data?.visitor?.name ?? "",
        groupName: json.data?.visitor?.groupName ?? "",
        time,
        method: channel === "badge_qr" ? "個人QR" : "身分證條碼",
      });
      setMessage("下一筆請繼續掃描");
      setScanValue("");
    } catch {
      setResult(null);
      setMessage("刷證失敗，請檢查登入與網路。");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BrandLogo size="md" />
          <div>
            <p className="text-sm font-medium text-primary">公所內勤</p>
            <h1 className="text-3xl font-semibold">刷證／個人 QR 簽到退</h1>
          </div>
        </div>
        <p className="font-mono text-3xl">{now}</p>
      </header>

      <form className="grid gap-4" onSubmit={(event) => void punch(event)}>
        <label className="grid gap-2 text-sm">
          掃描身分證條碼或志工個人 QR
          <input
            ref={inputRef}
            value={scanValue}
            onChange={(event) => setScanValue(event.target.value)}
            className="h-16 rounded-md border bg-background px-4 font-mono text-2xl tracking-wide"
            placeholder="掃描後會自動送出（支援 EVVOL:…）"
            autoComplete="off"
            autoFocus
          />
        </label>
        <button type="submit" className="sr-only">
          送出
        </button>
      </form>

      <section className="min-h-48 rounded-lg border bg-card px-6 py-8">
        {result ? (
          <>
            <p className="text-sm text-muted-foreground">
              {result.groupName} · {result.method}
            </p>
            <p className="mt-2 text-4xl font-semibold">{result.name}</p>
            <p className="mt-4 flex items-center gap-2 text-2xl text-primary">
              <ScanLine className="h-7 w-7" />
              {result.action}成功　{result.time}
            </p>
          </>
        ) : (
          <p className="text-xl text-muted-foreground">{message}</p>
        )}
        {result ? <p className="mt-6 text-sm text-muted-foreground">{message}</p> : null}
      </section>

      <p className="text-sm text-muted-foreground">
        電腦需先以承辦帳號登入。志工請在手機開啟
        <Link href="/volunteer/badge" className="mx-1 underline">
          個人識別 QR
        </Link>
        出示。外勤集合點請用
        <Link href="/volunteer/clock" className="mx-1 underline">
          掃集合點 QR
        </Link>
        。月結在
        <Link href="/manager/attendance" className="ml-1 underline">
          志工出勤
        </Link>
        。
      </p>
    </div>
  );
}
