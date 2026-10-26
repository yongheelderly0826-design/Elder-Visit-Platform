"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizeTaiwanMobilePhone } from "@/lib/domain/phone";
import type { UserRegistrationRequest, VisitorRegistrationWorkerGroup } from "@/lib/domain/types";
import {
  visitorRegistrationDepartments,
  type VisitorCorrectionResult,
} from "@/lib/domain/user-management";

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
  const [workerGroup, setWorkerGroup] = useState<VisitorRegistrationWorkerGroup>(
    profile?.workerGroup ?? "civil_affairs",
  );
  const [departmentName, setDepartmentName] = useState(profile?.departmentName ?? "其他");
  const [departmentOther, setDepartmentOther] = useState(profile?.departmentOther ?? "");
  const [headshotDataUrl, setHeadshotDataUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [photoNonce, setPhotoNonce] = useState(Date.now());

  useEffect(() => {
    setFullName(request.fullName);
    setPhone(profile?.phone ?? "");
    setWorkerGroup(profile?.workerGroup ?? "civil_affairs");
    setDepartmentName(profile?.departmentName ?? "其他");
    setDepartmentOther(profile?.departmentOther ?? "");
    setHeadshotDataUrl(null);
    setMessage(null);
    setPhotoNonce(Date.now());
  }, [
    profile?.departmentName,
    profile?.departmentOther,
    profile?.phone,
    profile?.workerGroup,
    request.fullName,
    request.id,
  ]);

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
    const nextDepartmentOther = departmentOther.trim();
    const nameChanged = nextName !== request.fullName.trim();
    const phoneChanged = nextPhone !== normalizeTaiwanMobilePhone(profile?.phone ?? "");
    const workerChanged = workerGroup !== (profile?.workerGroup ?? "civil_affairs");
    const departmentChanged = departmentName !== (profile?.departmentName ?? "其他");
    const departmentOtherChanged =
      departmentName === "其他" &&
      nextDepartmentOther !== String(profile?.departmentOther ?? "").trim();

    if (
      !nameChanged &&
      !phoneChanged &&
      !headshotDataUrl &&
      !workerChanged &&
      !departmentChanged &&
      !departmentOtherChanged
    ) {
      setMessage("沒有變更。請修改姓名、電話、證件照、民政/社政或單位。");
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
    if (departmentName === "其他" && !nextDepartmentOther) {
      setMessage("單位選「其他」時請填寫其他單位名稱。");
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
          ...(workerChanged ? { workerGroup } : {}),
          ...(departmentChanged || departmentOtherChanged
            ? {
                departmentName,
                departmentOther: departmentName === "其他" ? nextDepartmentOther : null,
              }
            : {}),
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4">
      <section className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-lg border bg-card shadow-lg">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
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

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid gap-4 sm:grid-cols-[7.5rem_1fr]">
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
              <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-5 text-muted-foreground">
                可改姓名、手機、證件照，以及下方<strong className="font-medium text-foreground">民政／社政</strong>與
                <strong className="font-medium text-foreground">單位</strong>（含「其他」）。暱稱會依單位自動重算。
              </p>
              <label className="grid gap-1 text-sm font-medium">
                民政 / 社政
                <select
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  value={workerGroup}
                  onChange={(event) =>
                    setWorkerGroup(event.target.value as VisitorRegistrationWorkerGroup)
                  }
                >
                  <option value="civil_affairs">民政訪查人員</option>
                  <option value="social_affairs">社政訪查人員</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                科室 / 單位別
                <select
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  value={departmentName}
                  onChange={(event) => {
                    const next = event.target.value;
                    setDepartmentName(next);
                    if (next !== "其他") setDepartmentOther("");
                  }}
                >
                  {visitorRegistrationDepartments.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>
              {departmentName === "其他" ? (
                <label className="grid gap-1 text-sm font-medium">
                  其他單位
                  <input
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={departmentOther}
                    onChange={(event) => setDepartmentOther(event.target.value)}
                    placeholder="請填寫單位"
                  />
                </label>
              ) : null}
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
                  onChange={(event) =>
                    setPhone(normalizeTaiwanMobilePhone(event.target.value) || event.target.value)
                  }
                  placeholder="09xxxxxxxx"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t p-4">
          {message ? <p className="mb-3 text-sm text-destructive">{message}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving || photoBusy}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "儲存中" : "儲存補正"}
            </Button>
          </div>
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
