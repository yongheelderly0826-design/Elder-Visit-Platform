"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Clock3, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

type VisitClockState = {
  checkedIn: boolean;
  completed: boolean;
  visitDate: string;
  visitStartTime: string;
  visitEndTime: string;
  checkinPhotoUrl?: string;
  open?: { attendanceId: string; checkinAt: string } | null;
  latest?: { attendanceId: string; checkinAt: string; checkoutAt: string } | null;
};

async function compressDoorplatePhoto(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const maxEdge = 1280;
      const scale = Math.min(maxEdge / image.width, maxEdge / image.height, 1);
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("無法處理照片"));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    image.onerror = () => reject(new Error("照片無法讀取"));
    image.src = dataUrl;
  });
}

export function VisitAssignmentClock({
  assignmentId,
  visitorId,
  visitAddress,
  onTimesChange,
}: {
  assignmentId: string;
  visitorId?: string;
  visitAddress?: string;
  onTimesChange?: (times: {
    visitDate: string;
    visitStartTime: string;
    visitEndTime: string;
  }) => void;
}) {
  const [state, setState] = useState<VisitClockState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [geoHint, setGeoHint] = useState<string>("");
  const [doorplatePreview, setDoorplatePreview] = useState<string>("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyTimes = useCallback(
    (payload: VisitClockState) => {
      setState(payload);
      if (payload.checkinPhotoUrl) {
        setDoorplatePreview((current) => current || payload.checkinPhotoUrl || "");
      }
      onTimesChange?.({
        visitDate: payload.visitDate,
        visitStartTime: payload.visitStartTime,
        visitEndTime: payload.visitEndTime,
      });
    },
    [onTimesChange],
  );

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/visits/clock?assignmentId=${encodeURIComponent(assignmentId)}`,
    );
    const json = (await response.json()) as {
      data?: VisitClockState;
      error?: { message?: string };
    };
    if (!response.ok || !json.data) {
      setMessage(json.error?.message ?? "無法讀取訪查簽到狀態");
      return;
    }
    applyTimes(json.data);
    setMessage(null);
  }, [assignmentId, applyTimes]);

  useEffect(() => {
    void load();
  }, [load]);

  async function readGps(): Promise<{ lat?: string; lng?: string }> {
    if (!navigator.geolocation) {
      setGeoHint("此裝置不支援定位，仍可簽到退（建議開啟定位）");
      return {};
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeoHint("已帶入目前定位");
          resolve({
            lat: String(pos.coords.latitude),
            lng: String(pos.coords.longitude),
          });
        },
        () => {
          setGeoHint("無法取得定位，仍可簽到退（建議開啟定位）");
          resolve({});
        },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  }

  async function onPickPhoto(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setPhotoBusy(true);
    setMessage(null);
    try {
      const compact = await compressDoorplatePhoto(file);
      setDoorplatePreview(compact);
      setMessage("門牌／門口照片已就緒，可進行到宅簽到");
    } catch {
      setMessage("照片處理失敗，請改用較小的圖片再試");
    } finally {
      setPhotoBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function clock() {
    const needsPhoto = !state?.checkedIn && !state?.completed;
    if (needsPhoto && !doorplatePreview) {
      setMessage("請先拍攝或選擇門牌／門口照片，再按到宅簽到");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const gps = await readGps();
      const response = await fetch("/api/visits/clock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          visitorId: visitorId || undefined,
          doorplatePhoto: needsPhoto ? doorplatePreview : undefined,
          ...gps,
        }),
      });
      const json = (await response.json()) as {
        data?: {
          action: string;
          visitDate: string;
          visitStartTime: string;
          visitEndTime: string;
          checkinPhotoUrl?: string;
          record?: { attendanceId: string; checkinAt: string; checkoutAt: string };
        };
        error?: { message?: string };
      };
      if (!response.ok || !json.data) {
        setMessage(json.error?.message ?? "簽到退失敗");
        return;
      }
      setMessage(json.data.action === "checkout" ? "到宅簽退成功" : "到宅簽到成功（已記錄門牌照片）");
      if (json.data.checkinPhotoUrl) setDoorplatePreview(json.data.checkinPhotoUrl);
      await load();
    } catch {
      setMessage("網路異常，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  const label = state?.checkedIn ? "到宅簽退" : "到宅簽到";
  const done = Boolean(state?.completed && !state?.checkedIn);
  const needsDoorplate = !state?.checkedIn && !done;

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Clock3 className="h-4 w-4" />
            訪查簽到退（綁此派案）
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            到宅簽到需拍攝門牌／門口，並記錄定位；與志工集合點出勤分開。
          </p>
        </div>
        <Button type="button" onClick={() => void clock()} disabled={busy || done || photoBusy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {done ? "本日已完成簽到退" : label}
        </Button>
      </div>

      {visitAddress ? (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-secondary/60 px-3 py-2 text-sm">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            <span className="font-medium">受訪地址：</span>
            {visitAddress}
          </span>
        </p>
      ) : null}

      {needsDoorplate ? (
        <div className="mt-3 rounded-md border border-dashed p-3">
          <p className="text-sm font-medium">門牌／門口照片（簽到必填）</p>
          <p className="mt-1 text-xs text-muted-foreground">
            請對準門牌或大門拍攝，供核對到宅位置；不需辨識文字。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={photoBusy}
              onClick={() => fileInputRef.current?.click()}
            >
              {photoBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Camera className="mr-2 h-4 w-4" />
              )}
              {doorplatePreview ? "重新拍攝／選擇" : "拍攝或選擇照片"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => void onPickPhoto(event.target.files)}
            />
          </div>
          {doorplatePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doorplatePreview}
              alt="門牌或門口簽到照片預覽"
              className="mt-3 max-h-48 w-full rounded-md border object-cover"
            />
          ) : null}
        </div>
      ) : doorplatePreview || state?.checkinPhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={doorplatePreview || state?.checkinPhotoUrl}
          alt="門牌簽到照片"
          className="mt-3 max-h-40 w-full rounded-md border object-cover"
        />
      ) : null}

      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <p>
          日期：<span className="font-medium">{state?.visitDate || "—"}</span>
        </p>
        <p>
          簽到：<span className="font-medium">{state?.visitStartTime || "—"}</span>
        </p>
        <p>
          簽退：<span className="font-medium">{state?.visitEndTime || "—"}</span>
        </p>
      </div>

      <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" />
        {geoHint || "簽到退時會嘗試記錄 GPS"}
      </p>
      {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
    </section>
  );
}
