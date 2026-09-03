"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, LogOut, QrCode, Timer } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";
import {
  getAttendanceSite,
  taipeiTime,
  type AttendanceRecord,
  type VolunteerClockStatus,
  type VolunteerWorker,
} from "@/lib/domain/volunteer-attendance";

type MeResponse = {
  data?: {
    visitor?: VolunteerWorker | null;
    today?: string;
    open?: AttendanceRecord | null;
  };
  error?: { message?: string };
};

type ClockResponse = {
  data?: {
    action?: "checkin" | "checkout";
    record?: AttendanceRecord | null;
    visitor?: VolunteerWorker;
  };
  error?: { message?: string };
};

function parseSiteId(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return url.searchParams.get("site")?.trim().toUpperCase() ?? "";
  } catch {
    const match = trimmed.toUpperCase().match(/SITE-[A-Z0-9-]+/);
    return match?.[0] ?? trimmed.toUpperCase();
  }
}

export function VolunteerClockPanel({ initialSiteId = "" }: { initialSiteId?: string }) {
  const [siteId, setSiteId] = useState(initialSiteId.toUpperCase());
  const [idNumber, setIdNumber] = useState("");
  const [status, setStatus] = useState<VolunteerClockStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => taipeiTime(new Date()));
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const site = useMemo(() => getAttendanceSite(siteId), [siteId]);

  const stopScan = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const loadMe = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/attendance/me", { cache: "no-store" });
      const json = (await response.json()) as MeResponse;
      if (json.data?.visitor) {
        setStatus({
          visitor: json.data.visitor,
          today: json.data.today ?? "",
          open: json.data.open ?? null,
        });
      } else {
        setStatus(null);
      }
    } catch {
      setMessage("目前無法讀取登入狀態。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(taipeiTime(new Date())), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => stopScan(), [stopScan]);

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
      const json = (await response.json()) as MeResponse;
      if (!response.ok || !json.data?.visitor) {
        setMessage(json.error?.message ?? "找不到志工資料");
        return;
      }
      setStatus({
        visitor: json.data.visitor,
        today: json.data.today ?? "",
        open: json.data.open ?? null,
      });
      setIdNumber("");
    } catch {
      setMessage("身分確認失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  async function punch() {
    if (!site) {
      setMessage("請先掃描組別 QR，或輸入地點代碼。");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/attendance/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: site.id, channel: "qr", source: "field_qr" }),
      });
      const json = (await response.json()) as ClockResponse;
      if (!response.ok) {
        setMessage(json.error?.message ?? "簽到退失敗");
        return;
      }
      const action = json.data?.action === "checkout" ? "簽退" : "簽到";
      setMessage(`${json.data?.visitor?.name ?? ""} 已${action}（${site.name}）`);
      await loadMe();
    } catch {
      setMessage("簽到退失敗，請確認網路後再試。");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/attendance/me", { method: "DELETE" });
    setStatus(null);
    setMessage("已登出，下一筆請重新確認身分。");
  }

  async function startScan() {
    setMessage(null);
    const Detector = (
      window as Window & {
        BarcodeDetector?: new (options: { formats: string[] }) => {
          detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
        };
      }
    ).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setMessage("此手機瀏覽器不支援鏡頭掃碼，請用相機直接掃描海報 QR。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      setScanning(true);
      const detector = new Detector({ formats: ["qr_code"] });
      requestAnimationFrame(async function loop() {
        const video = videoRef.current;
        if (!streamRef.current) return;
        if (!video || video.readyState < 2) {
          requestAnimationFrame(loop);
          return;
        }
        try {
          const codes = await detector.detect(video);
          const value = codes[0]?.rawValue;
          if (value) {
            const parsed = parseSiteId(value);
            if (getAttendanceSite(parsed)) {
              setSiteId(parsed);
              stopScan();
              setMessage(`已讀取地點：${getAttendanceSite(parsed)?.name}`);
              return;
            }
          }
        } catch {
          // keep scanning
        }
        if (streamRef.current) requestAnimationFrame(loop);
      });
    } catch {
      setMessage("無法開啟鏡頭，請改用手機相機掃描海報。");
    }
  }

  useEffect(() => {
    if (!scanning || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play();
  }, [scanning]);

  const checkedIn = Boolean(status?.open);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BrandLogo size="sm" />
          <div>
            <p className="text-sm font-medium text-primary">志工出勤</p>
            <h1 className="text-xl font-semibold">掃 QR 簽到退</h1>
          </div>
        </div>
        {status ? (
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

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="bg-[linear-gradient(180deg,hsl(148_36%_48%/0.16),transparent)] px-5 py-6">
          <p className="text-sm text-muted-foreground">現在時間</p>
          <p className="mt-1 font-mono text-4xl font-semibold tracking-tight">{now}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            {site ? site.name : "請掃描組別集合點 QR"}
          </p>
        </div>
      </section>

      {loading ? (
        <p className="text-sm text-muted-foreground">讀取中…</p>
      ) : !status ? (
        <form className="grid gap-3 rounded-lg border bg-card p-4" onSubmit={(event) => void identify(event)}>
          <div>
            <h2 className="text-base font-semibold">先確認身分與組別</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              外勤志工用手機登入一次後，再掃集合點 QR 記錄時間。
            </p>
          </div>
          <label className="grid gap-1 text-sm">
            身分證字號
            <input
              value={idNumber}
              onChange={(event) => setIdNumber(event.target.value.toUpperCase())}
              className="h-12 rounded-md border bg-background px-3 font-mono text-lg"
              autoComplete="off"
              inputMode="text"
              required
            />
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? "確認中…" : "登入出勤"}
          </Button>
        </form>
      ) : (
        <section className="grid gap-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">目前身分</p>
            <p className="mt-1 text-2xl font-semibold">{status.visitor.name}</p>
            <p className="mt-1 text-sm">{status.visitor.groupName || "尚未設定組別"}</p>
            <p className="mt-3 text-sm text-muted-foreground">
              {checkedIn
                ? `已簽到 ${taipeiTime(status.open?.checkinAt)}，再掃一次即可簽退`
                : "尚未簽到"}
            </p>
          </div>

          <div className="grid gap-2">
            <Button type="button" disabled={busy || !site} onClick={() => void punch()}>
              <Timer className="h-4 w-4" />
              {busy ? "處理中…" : checkedIn ? "確認簽退" : "確認簽到"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void startScan()}>
              <Camera className="h-4 w-4" />
              掃描組別 QR
            </Button>
          </div>

          {scanning ? (
            <div className="grid gap-2">
              <video ref={videoRef} className="h-48 w-full rounded-md bg-black object-cover" muted playsInline />
              <Button type="button" variant="outline" onClick={stopScan}>
                關閉鏡頭
              </Button>
            </div>
          ) : null}

          <label className="grid gap-1 text-sm">
            地點代碼
            <input
              value={siteId}
              onChange={(event) => setSiteId(parseSiteId(event.target.value))}
              className="h-11 rounded-md border bg-background px-3 font-mono"
              placeholder="SITE-MEAL"
            />
          </label>
        </section>
      )}

      {message ? <p className="text-sm leading-6 text-muted-foreground">{message}</p> : null}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <QrCode className="h-4 w-4" />
        海報 QR 會開啟此頁並帶入地點。公所內勤請用
        <Link href="/office/kiosk" className="underline">
          刷證櫃台
        </Link>
        。
      </p>
    </div>
  );
}
