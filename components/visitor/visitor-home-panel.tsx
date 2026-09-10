"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, ClipboardList, QrCode, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAttendanceSite, isAttendanceSiteId, OFFICE_KIOSK_SITE_ID } from "@/lib/domain/volunteer-attendance";

type BadgeData = {
  visitorId: string;
  name: string;
  groupName: string;
  badgeNo: string;
  payload: string;
  qrUrl: string;
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

export function VisitorHomePanel() {
  const [badge, setBadge] = useState<BadgeData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopScan = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const loadBadge = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/attendance/badge-qr", { cache: "no-store" });
      const json = (await response.json()) as { data?: BadgeData; error?: { message?: string } };
      if (!response.ok || !json.data) {
        setBadge(null);
        setMessage(json.error?.message ?? "無法載入訪員證 QR，請重新登入");
        return;
      }
      setBadge(json.data);
    } catch {
      setBadge(null);
      setMessage("網路異常，請稍後再試");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadBadge();
  }, [loadBadge]);

  useEffect(() => () => stopScan(), [stopScan]);

  useEffect(() => {
    if (!scanning || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play();
  }, [scanning]);

  async function punchAtSite(siteId: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/attendance/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          channel: siteId === OFFICE_KIOSK_SITE_ID ? "badge_qr" : "qr",
          source: siteId === OFFICE_KIOSK_SITE_ID ? "office_kiosk" : "field_qr",
        }),
      });
      const json = (await response.json()) as {
        data?: { action?: "checkin" | "checkout"; visitor?: { name?: string } };
        error?: { message?: string };
      };
      if (!response.ok) {
        setMessage(json.error?.message ?? "簽到退失敗");
        return;
      }
      const action = json.data?.action === "checkout" ? "簽退" : "簽到";
      const site = getAttendanceSite(siteId);
      setMessage(`${json.data?.visitor?.name ?? badge?.name ?? ""} 已於「${site?.name ?? siteId}」${action}`);
    } catch {
      setMessage("簽到退失敗，請確認網路後再試");
    } finally {
      setBusy(false);
    }
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
      setMessage("此手機瀏覽器不支援鏡頭掃碼，請改用系統相機掃描櫃檯／集合點 QR。");
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
            if (isAttendanceSiteId(parsed)) {
              stopScan();
              setMessage(`已讀取地點：${getAttendanceSite(parsed)?.name ?? parsed}`);
              await punchAtSite(parsed);
              return;
            }
          }
        } catch {
          // keep scanning
        }
        if (streamRef.current) requestAnimationFrame(loop);
      });
    } catch {
      setMessage("無法開啟鏡頭，請改用系統相機掃描櫃檯 QR。");
    }
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border bg-card p-4">
        <p className="text-sm font-medium text-primary">訪員首頁</p>
        <h1 className="mt-1 text-2xl font-semibold">我的訪員證</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          登入後預設顯示個人 QR。可出示給報到櫃檯掃描，或開啟相機掃描櫃檯／集合點 QR。
        </p>
      </section>

      {!badge ? (
        <section className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">{message ?? (busy ? "載入訪員證中…" : "尚無訪員證")}</p>
          <Button className="mt-3" type="button" onClick={() => void loadBadge()} disabled={busy}>
            重新載入
          </Button>
        </section>
      ) : (
        <section className="grid gap-4 rounded-lg border bg-card p-5 text-center">
          <div>
            <p className="text-sm text-muted-foreground">{badge.groupName || "訪員"}</p>
            <p className="mt-1 text-3xl font-semibold">{badge.name}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{badge.visitorId}</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={badge.qrUrl}
            alt={`${badge.name} 訪員證 QR`}
            className="mx-auto h-64 w-64 rounded-md border bg-white p-2"
          />
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <QrCode className="h-4 w-4" />
            請將此畫面面向櫃檯掃描槍
          </p>
          <p className="break-all font-mono text-[11px] text-muted-foreground">{badge.payload}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="secondary" onClick={() => void loadBadge()} disabled={busy}>
              重新整理 QR
            </Button>
            <Button type="button" onClick={() => void startScan()} disabled={busy || scanning}>
              <Camera className="h-4 w-4" />
              掃櫃檯／集合點 QR
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
        </section>
      )}

      {message ? <p className="text-sm leading-6 text-muted-foreground">{message}</p> : null}

      <section className="grid gap-2 sm:grid-cols-2">
        <Link href="/visitor/tasks">
          <Button type="button" variant="outline" className="h-12 w-full">
            <ClipboardList className="h-4 w-4" />
            今日訪視任務
          </Button>
        </Link>
        <Link href="/visitor/payments">
          <Button type="button" variant="outline" className="h-12 w-full">
            <Wallet className="h-4 w-4" />
            我的核銷狀態
          </Button>
        </Link>
      </section>
    </div>
  );
}
