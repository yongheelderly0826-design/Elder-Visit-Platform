"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, LogOut, QrCode, Timer } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";
import { isLikelyInAppBrowser, startQrScan, type QrScanHandle } from "@/lib/client/qr-scan";
import {
  getAttendanceSite,
  isAttendanceSiteId,
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

export function VolunteerClockPanel({
  initialSiteId = "",
  visitorWorkspace = false,
}: {
  initialSiteId?: string;
  visitorWorkspace?: boolean;
}) {
  const [siteId, setSiteId] = useState(initialSiteId.toUpperCase());
  const [idNumber, setIdNumber] = useState("");
  const [status, setStatus] = useState<VolunteerClockStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => taipeiTime(new Date()));
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanRef = useRef<QrScanHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const site = useMemo(() => getAttendanceSite(siteId), [siteId]);

  const stopScan = useCallback(() => {
    scanRef.current?.stop();
    scanRef.current = null;
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
    if (!isAttendanceSiteId(siteId)) {
      setMessage("請先掃描組別 QR，或輸入地點代碼。");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/attendance/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: siteId.toUpperCase(), channel: "qr", source: "field_qr" }),
      });
      const json = (await response.json()) as ClockResponse;
      if (!response.ok) {
        setMessage(json.error?.message ?? "簽到退失敗");
        return;
      }
      const action = json.data?.action === "checkout" ? "簽退" : "簽到";
      const placeName = site?.name ?? json.data?.record?.siteName ?? siteId;
      setMessage(`${json.data?.visitor?.name ?? ""} 已${action}（${placeName}）`);
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
    setScanning(true);
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    const video = videoRef.current;
    if (!video) {
      setScanning(false);
      setMessage("無法準備相機畫面，請重新整理後再試。");
      return;
    }
    try {
      scanRef.current?.stop();
      scanRef.current = await startQrScan({
        video,
        onCode: (raw) => {
          const parsed = parseSiteId(raw);
          if (isAttendanceSiteId(parsed)) {
            setSiteId(parsed);
            stopScan();
            setMessage(`已讀取地點：${getAttendanceSite(parsed)?.name ?? parsed}`);
          } else {
            setMessage("已掃到內容，但不是集合點 QR，請再對準海報。");
          }
        },
        onError: (msg) => {
          setMessage(
            isLikelyInAppBrowser()
              ? `${msg} 若在 LINE 內建瀏覽器，請點右上角「…」用 Safari 開啟。`
              : msg,
          );
          setScanning(false);
        },
      });
      setMessage("請將鏡頭對準集合點 QR");
    } catch {
      setScanning(false);
      setMessage(
        isLikelyInAppBrowser()
          ? "無法開啟相機。請點 LINE 右上角「…」→「在 Safari 開啟」，或改用下方「相簿／拍照掃碼」。"
          : "無法開啟相機，請允許相機權限，或改用下方「相簿／拍照掃碼」。",
      );
    }
  }

  async function onPickImage(file: File | null) {
    if (!file) return;
    setMessage("辨識中…");
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(bitmap, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const jsQR = (await import("jsqr")).default;
      const code = jsQR(image.data, image.width, image.height, {
        inversionAttempts: "attemptBoth",
      });
      if (!code?.data) {
        setMessage("相片中找不到 QR，請再拍清楚一點。");
        return;
      }
      const parsed = parseSiteId(code.data);
      if (!isAttendanceSiteId(parsed)) {
        setMessage("相片不是集合點 QR，請再試。");
        return;
      }
      setSiteId(parsed);
      setMessage(`已讀取地點：${getAttendanceSite(parsed)?.name ?? parsed}`);
    } catch {
      setMessage("讀取相片失敗，請再試一次。");
    }
  }

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
            {site?.name || (isAttendanceSiteId(siteId) ? siteId : "請掃描組別集合點 QR")}
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

          <div className="grid gap-3">
            <Button
              type="button"
              className={`min-h-20 w-full gap-3 px-6 py-4 text-xl font-bold shadow-md active:scale-[0.99] sm:min-h-24 sm:text-2xl ${
                checkedIn
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }`}
              disabled={busy || !isAttendanceSiteId(siteId)}
              aria-label={
                busy
                  ? "正在處理出勤紀錄"
                  : checkedIn
                    ? "確認簽退，目前狀態為已簽到"
                    : "確認簽到，目前狀態為尚未簽到"
              }
              onClick={() => void punch()}
            >
              <Timer className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" aria-hidden="true" />
              <span>{busy ? "處理中…" : checkedIn ? "確認簽退" : "確認簽到"}</span>
            </Button>
            <p
              className={`rounded-md px-4 py-3 text-center text-base font-semibold ${
                checkedIn
                  ? "bg-destructive/10 text-destructive"
                  : "bg-primary/10 text-primary"
              }`}
              role="status"
            >
              {checkedIn ? "目前：已簽到，按上方按鈕完成簽退" : "目前：尚未簽到"}
            </p>
            <Button type="button" variant="secondary" onClick={() => void startScan()}>
              <Camera className="h-4 w-4" />
              掃描組別 QR
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                void onPickImage(file);
              }}
            />
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
              相簿／拍照掃碼（相機打不開時用）
            </Button>
            <Link href={visitorWorkspace ? "/visitor/home" : "/volunteer/badge"}>
              <Button type="button" variant="outline" className="w-full">
                <QrCode className="h-4 w-4" />
                出示個人 QR（給櫃台掃）
              </Button>
            </Link>
          </div>

          <div className={scanning ? "grid gap-2" : "hidden"}>
            <video
              ref={videoRef}
              className="h-48 w-full rounded-md bg-black object-cover"
              muted
              playsInline
              autoPlay
            />
            <Button type="button" variant="outline" onClick={stopScan}>
              關閉鏡頭
            </Button>
          </div>

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
        海報 QR 會開啟此頁並帶入地點。公所內勤可刷身分證或掃
        <Link
          href={visitorWorkspace ? "/visitor/home" : "/volunteer/badge"}
          className="mx-1 underline"
        >
          個人 QR
        </Link>
        （櫃台
        <Link href="/office/kiosk" className="mx-1 underline">
          刷證頁
        </Link>
        ）。
      </p>
    </div>
  );
}
