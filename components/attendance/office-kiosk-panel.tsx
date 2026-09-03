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
  const [idNumber, setIdNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => taipeiTime(new Date()));
  const [result, setResult] = useState<{
    action: string;
    name: string;
    groupName: string;
    time: string;
  } | null>(null);
  const [message, setMessage] = useState("請將身分證條碼對準掃描器");

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
    const value = idNumber.trim();
    if (!value || busy) return;
    setBusy(true);
    setMessage("處理中…");
    try {
      const response = await fetch("/api/attendance/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idNumber: value,
          channel: "barcode",
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
      setResult({
        action,
        name: json.data?.visitor?.name ?? "",
        groupName: json.data?.visitor?.groupName ?? "",
        time,
      });
      setMessage("下一筆請繼續刷證");
      setIdNumber("");
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
            <h1 className="text-3xl font-semibold">身分證條碼簽到退</h1>
          </div>
        </div>
        <p className="font-mono text-3xl">{now}</p>
      </header>

      <form className="grid gap-4" onSubmit={(event) => void punch(event)}>
        <label className="grid gap-2 text-sm">
          掃描身分證條碼
          <input
            ref={inputRef}
            value={idNumber}
            onChange={(event) => setIdNumber(event.target.value.toUpperCase())}
            className="h-16 rounded-md border bg-background px-4 font-mono text-2xl tracking-wide"
            placeholder="將掃描器對準條碼後會自動送出"
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
            <p className="text-sm text-muted-foreground">{result.groupName}</p>
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
        電腦需先以承辦帳號登入。外勤無電腦的組別請改用
        <Link href="/volunteer/clock" className="mx-1 underline">
          手機掃 QR
        </Link>
        。月結匯出在
        <Link href="/manager/attendance" className="ml-1 underline">
          志工出勤
        </Link>
        。
      </p>
    </div>
  );
}
