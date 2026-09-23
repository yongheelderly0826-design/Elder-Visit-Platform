"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, ClipboardList, QrCode, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhysicalVisitorBadge } from "@/components/visitor/physical-visitor-badge";
import { isLikelyInAppBrowser, startQrScan, type QrScanHandle } from "@/lib/client/qr-scan";
import { getAttendanceSite, isAttendanceSiteId, OFFICE_KIOSK_SITE_ID } from "@/lib/domain/volunteer-attendance";

export type BadgeData = {
  visitorId: string;
  name: string;
  groupName: string;
  badgeNo: string;
  payload: string;
  qrUrl: string;
  email?: string;
};

type CachedBadge = {
  badge: BadgeData;
  cachedAt: string;
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

export function VisitorHomePanel({
  cacheIdentity,
  initialBadge = null,
  visitorEmail = "",
}: {
  cacheIdentity: string;
  initialBadge?: BadgeData | null;
  visitorEmail?: string;
}) {
  const [badge, setBadge] = useState<BadgeData | null>(initialBadge);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanRef = useRef<QrScanHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopScan = useCallback(() => {
    scanRef.current?.stop();
    scanRef.current = null;
    setScanning(false);
  }, []);

  const badgeCacheKey = cacheIdentity
    ? `elder-visitor-badge-v1:${cacheIdentity.toLowerCase()}`
    : null;

  const loadBadge = useCallback(async (background = false) => {
    if (!background) {
      setBusy(true);
      setMessage(null);
    }
    try {
      const response = await fetch("/api/attendance/badge-qr", { cache: "no-store" });
      const json = (await response.json()) as { data?: BadgeData; error?: { message?: string } };
      if (!response.ok || !json.data) {
        setMessage(json.error?.message ?? "無法載入訪員證 QR，請重新登入");
        return;
      }
      setBadge(json.data);
      try {
        if (!badgeCacheKey) return;
        const cached: CachedBadge = {
          badge: json.data,
          cachedAt: new Date().toISOString(),
        };
        window.localStorage.setItem(badgeCacheKey, JSON.stringify(cached));
      } catch {
        // Private browsing may disable storage; the live badge still works.
      }
    } catch {
      if (!background) {
        setMessage("網路異常，已保留手機內的訪員證");
      }
    } finally {
      if (!background) {
        setBusy(false);
      }
    }
  }, [badgeCacheKey]);

  useEffect(() => {
    let hasCachedBadge = Boolean(initialBadge);
    try {
      if (initialBadge && badgeCacheKey) {
        const cached: CachedBadge = {
          badge: initialBadge,
          cachedAt: new Date().toISOString(),
        };
        window.localStorage.setItem(badgeCacheKey, JSON.stringify(cached));
      } else if (badgeCacheKey) {
        const raw = window.localStorage.getItem(badgeCacheKey);
        if (raw) {
          const cached = JSON.parse(raw) as CachedBadge;
          if (cached.badge?.visitorId && cached.badge?.qrUrl) {
            setBadge(cached.badge);
            hasCachedBadge = true;
          }
        }
      }
    } catch {
      // Ignore invalid or unavailable storage.
    }

    // Cached QR is shown immediately; server verification refreshes silently.
    void loadBadge(hasCachedBadge);
  }, [badgeCacheKey, initialBadge, loadBadge]);

  useEffect(() => () => stopScan(), [stopScan]);

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

  async function handleScannedRaw(raw: string) {
    const parsed = parseSiteId(raw);
    if (!isAttendanceSiteId(parsed)) {
      setMessage("已掃到內容，但不是集合點／櫃檯 QR，請再對準海報。");
      return;
    }
    stopScan();
    setMessage(`已讀取地點：${getAttendanceSite(parsed)?.name ?? parsed}`);
    await punchAtSite(parsed);
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
        onCode: (raw) => void handleScannedRaw(raw),
        onError: (msg) => {
          setMessage(
            isLikelyInAppBrowser()
              ? `${msg} 若在 LINE 內建瀏覽器，請點右上角「…」用 Safari 開啟。`
              : msg,
          );
          setScanning(false);
        },
      });
      setMessage("請將鏡頭對準櫃檯／集合點 QR");
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
      await handleScannedRaw(code.data);
    } catch {
      setMessage("讀取相片失敗，請再試一次。");
    }
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border bg-card p-4">
        <p className="text-sm font-medium text-primary">訪員首頁</p>
        <h1 className="mt-1 text-2xl font-semibold">我的訪員證</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          手機畫面比照實體訪員證格式顯示。下方 QR 可出示給報到櫃檯掃描，也可開啟相機掃描集合點 QR。
        </p>
      </section>

      {!badge ? (
        <section className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">{message ?? (busy ? "載入訪員證中…" : "尚無訪員證")}</p>
          <Button className="mt-3" type="button" onClick={() => void loadBadge(false)} disabled={busy}>
            重新載入
          </Button>
        </section>
      ) : (
        <>
          <PhysicalVisitorBadge
            visitorId={badge.visitorId}
            email={badge.email || visitorEmail}
            name={badge.name}
          />

          <section className="grid gap-4 rounded-lg border bg-card p-5 text-center">
            <div>
              <p className="text-sm font-medium text-slate-800">報到用 QR</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {badge.name} · {badge.visitorId}
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={badge.qrUrl}
              alt={`${badge.name} 訪員證 QR`}
              className="mx-auto h-52 w-52 rounded-md border bg-white p-2"
            />
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <QrCode className="h-4 w-4" />
              請將此畫面面向櫃檯掃描槍
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="secondary" onClick={() => void loadBadge(false)} disabled={busy}>
                重新整理 QR
              </Button>
              <Button type="button" onClick={() => void startScan()} disabled={busy || scanning}>
                <Camera className="h-4 w-4" />
                掃櫃檯／集合點 QR
              </Button>
            </div>
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
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              相簿／拍照掃碼（相機打不開時用）
            </Button>
            <div className={scanning ? "grid gap-2" : "hidden"}>
              <video
                ref={videoRef}
                className="h-56 w-full rounded-md bg-black object-cover"
                muted
                playsInline
                autoPlay
              />
              <Button type="button" variant="outline" onClick={stopScan}>
                關閉鏡頭
              </Button>
            </div>
          </section>
        </>
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
