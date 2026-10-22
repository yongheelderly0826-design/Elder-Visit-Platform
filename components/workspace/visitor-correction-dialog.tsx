"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizeTaiwanMobilePhone } from "@/lib/domain/phone";
import type { UserRegistrationRequest } from "@/lib/domain/types";
import type { VisitorCorrectionResult } from "@/lib/domain/user-management";

export function VisitorCorrectionDialog({
  request,
  onClose,
  onSaved,
}: {
  request: UserRegistrationRequest;
  onClose: () => void;
  onSaved: (result: VisitorCorrectionResult) => void;
}) {
  const profile = request.visitorRegistrationProfile;
  const visitorId = profile?.visitorCode ?? "";
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(request.fullName);
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [headshotDataUrl, setHeadshotDataUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [photoNonce, setPhotoNonce] = useState(Date.now());

  useEffect(() => {
    setFullName(request.fullName);
    setPhone(profile?.phone ?? "");
    setHeadshotDataUrl(null);
    setMessage(null);
    setPhotoNonce(Date.now());
  }, [profile?.phone, request.fullName, request.id]);

  const currentPhoto = headshotDataUrl
    ? headshotDataUrl
    : visitorId
      ? `/api/users/gas-headshot/${encodeURIComponent(visitorId)}?ts=${photoNonce}`
      : profile?.headshotProcessedUrl;

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    setMessage(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setHeadshotDataUrl(await createCompactHeadshotDataUrl(dataUrl));
    } catch {
      setMessage("照片讀取失敗，請改選較清楚的證件照。");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save() {
    const nextName = fullName.trim();
    const nextPhone = normalizeTaiwanMobilePhone(phone);
    const nameChanged = nextName !== request.fullName.trim();
    const phoneChanged = nextPhone !== normalizeTaiwanMobilePhone(profile?.phone ?? "");
    if (!nameChanged && !phoneChanged && !headshotDataUrl) {
      setMessage("沒有變更。請修改姓名、電話或補上傳證件照。");
      return;
    }
    if (nextName.length < 2) {
      setMessage("姓名至少 2 個字。");
      return;
    }
    if (phoneChanged && !/^09\d{8}$/.test(nextPhone)) {
      setMessage("手機請填 09 開頭的 10 碼數字。");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/users/visitor-correction", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: request.id,
          ...(nameChanged ? { fullName: nextName } : {}),
          ...(phoneChanged ? { phone: nextPhone } : {}),
          ...(headshotDataUrl ? { headshotDataUrl } : {}),
        }),
      });
      const json = (await response.json()) as {
        data?: VisitorCorrectionResult;
        error?: { message?: string };
      };
      if (!response.ok || !json.data) {
        setMessage(json.error?.message ?? "補正失敗，請稍後再試。");
        return;
      }
      onSaved(json.data);
    } catch {
      setMessage("網路異常，請稍後再試。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <section className="w-full max-w-lg rounded-lg border bg-card p-4 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-primary">已通過訪員補正</p>
            <h2 className="mt-1 text-lg font-semibold">{request.fullName}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {visitorId || "尚無訪員編碼"} · {profile?.officialEmail ?? request.email}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
            <X className="h-4 w-4" />
            關閉
          </Button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[7.5rem_1fr]">
          <div className="grid gap-2">
            <div className="mx-auto aspect-[3/4] w-[7.5rem] overflow-hidden rounded border bg-white">
              {currentPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentPhoto} alt={`${request.fullName} 證件照`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">缺照片</div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={photoBusy || saving}
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="h-4 w-4" />
                拍照
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={photoBusy || saving}
                onClick={() => albumInputRef.current?.click()}
              >
                {photoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                相簿
              </Button>
            </div>
            <input
              ref={cameraInputRef}
              className="hidden"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                void handlePhoto(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <input
              ref={albumInputRef}
              className="hidden"
              type="file"
              accept="image/*"
              onChange={(event) => {
                void handlePhoto(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>

          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-medium">
              姓名
              <input
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              手機
              <input
                className="h-10 rounded-md border bg-background px-3 text-sm"
                inputMode="numeric"
                value={phone}
                onChange={(event) => setPhone(normalizeTaiwanMobilePhone(event.target.value) || event.target.value)}
                placeholder="09xxxxxxxx"
              />
            </label>
            <p className="text-xs leading-5 text-muted-foreground">
              只改姓名、電話與證件照。舊照片會留在雲端目錄，不會刪除。
            </p>
          </div>
        </div>

        {message ? <p className="mt-3 text-sm text-destructive">{message}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving || photoBusy}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "儲存中" : "儲存補正"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function createCompactHeadshotDataUrl(dataUrl: string) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const maxWidth = 720;
      const maxHeight = 960;
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
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
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.62));
    };
    image.onerror = () => reject(new Error("照片無法讀取"));
    image.src = dataUrl;
  });
}
