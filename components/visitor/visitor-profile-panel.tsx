"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { BadgeCheck, IdCard, Save, Upload, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createCompactPassbookDataUrl,
  readFileAsDataUrl,
} from "@/lib/client/passbook-image";

type VisitorSelfProfile = {
  id: string;
  fullName: string;
  displayName: string | null;
  visitorCode: string | null;
  officialEmail: string | null;
  phone: string | null;
  rootUnitName: string | null;
  departmentName: string | null;
  jobTitle: string | null;
  workerType: string | null;
  headshotProcessedUrl: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  bankAccountLast5: string | null;
  bankName: string | null;
  bankCode: string | null;
  bankBranchName: string | null;
  bankAccountName: string | null;
  passbookCoverUrl: string | null;
  passbookUploadedAt: string | null;
  remittanceReviewStatus: string;
  serviceAvailability: Record<string, unknown>;
  profileCompletionStatus: string;
  qrCodePayload: string | null;
};

type VisitorProfileForm = {
  officialEmail: string;
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  bankAccountLast5: string;
  bankName: string;
  bankCode: string;
  bankBranchName: string;
  bankAccountName: string;
  passbookCoverUrl: string;
  availableTime: string;
  availableVillages: string;
};

export function VisitorProfilePanel() {
  const [profile, setProfile] = useState<VisitorSelfProfile | null>(null);
  const [form, setForm] = useState<VisitorProfileForm>({
    officialEmail: "",
    phone: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    bankAccountLast5: "",
    bankName: "",
    bankCode: "",
    bankBranchName: "",
    bankAccountName: "",
    passbookCoverUrl: "",
    availableTime: "",
    availableVillages: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passbookProcessing, setPassbookProcessing] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const response = await fetch("/api/visitor/profile", { cache: "no-store" });
      const json = (await response.json()) as {
        data?: VisitorSelfProfile;
        error?: { message?: string };
      };

      if (!response.ok || !json.data) {
        setMessage(json.error?.message ?? "目前無法讀取訪員資料。");
        setLoading(false);
        return;
      }

      const availability = json.data.serviceAvailability ?? {};
      setProfile(json.data);
      setForm({
        officialEmail: json.data.officialEmail ?? "",
        phone: json.data.phone ?? "",
        emergencyContactName: json.data.emergencyContactName ?? "",
        emergencyContactPhone: json.data.emergencyContactPhone ?? "",
        bankAccountLast5: json.data.bankAccountLast5 ?? "",
        bankName: json.data.bankName ?? "",
        bankCode: json.data.bankCode ?? "",
        bankBranchName: json.data.bankBranchName ?? "",
        bankAccountName: json.data.bankAccountName ?? json.data.fullName,
        passbookCoverUrl: json.data.passbookCoverUrl ?? "",
        availableTime: String(availability.availableTime ?? availability.weekday ?? ""),
        availableVillages: String(availability.availableVillages ?? availability.villages ?? ""),
      });
      setLoading(false);
    }

    void loadProfile();
  }, []);

  function updateForm(patch: Partial<VisitorProfileForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function handlePassbookFile(file: File | undefined) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage("存摺資料目前請上傳照片或手機截圖；PDF 之後再納入附件管理。");
      return;
    }

    setPassbookProcessing(true);
    setMessage("正在壓縮存摺照片，會轉成小尺寸黑白圖以節省空間...");

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const compactDataUrl = await createCompactPassbookDataUrl(dataUrl);
      updateForm({ passbookCoverUrl: compactDataUrl });
      setMessage("已壓縮存摺照片，請按「送出補充資料」保存。");
    } catch {
      setMessage("存摺照片處理失敗，請重新拍攝或選擇較清楚的圖片。");
    } finally {
      setPassbookProcessing(false);
    }
  }

  async function saveProfile() {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/visitor/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          officialEmail: form.officialEmail,
          phone: form.phone,
          emergencyContactName: form.emergencyContactName,
          emergencyContactPhone: form.emergencyContactPhone,
          bankAccountLast5: form.bankAccountLast5,
          bankName: form.bankName,
          bankCode: form.bankCode,
          bankBranchName: form.bankBranchName,
          bankAccountName: form.bankAccountName,
          passbookCoverUrl: form.passbookCoverUrl,
          serviceAvailability: {
            availableTime: form.availableTime,
            availableVillages: form.availableVillages,
          },
        }),
      });
      const json = (await response.json()) as {
        data?: VisitorSelfProfile;
        message?: string;
        error?: { message?: string };
      };

      if (!response.ok || !json.data) {
        setMessage(json.error?.message ?? "資料更新失敗，請稍後再試。");
        return;
      }

      setProfile(json.data);
      setMessage(json.message ?? "資料已送出，等待承辦管理者確認。");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        正在讀取我的訪員資料...
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="rounded-lg border bg-card p-4">
        <h1 className="text-xl font-semibold">我的資料</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message ?? "找不到訪員資料。"}</p>
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <UserRound className="h-5 w-5" />
              <p className="text-sm font-semibold">訪員個人資料</p>
            </div>
            <h1 className="mt-2 text-2xl font-semibold">{profile.displayName ?? profile.fullName}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              請補齊聯絡、緊急聯絡、匯款銀行、存摺資料與可服務資訊。送出後由承辦管理者確認，確認後才會進入可派案名單。
            </p>
          </div>
          <div className="grid gap-2 rounded-lg border bg-background p-3 text-sm md:min-w-[18rem]">
            <StatusRow label="訪員編碼" value={profile.visitorCode ?? "待產生"} />
            <StatusRow label="資料狀態" value={profileStatusLabels[profile.profileCompletionStatus] ?? profile.profileCompletionStatus} />
            <StatusRow label="匯款審核" value={remittanceStatusLabels[profile.remittanceReviewStatus] ?? profile.remittanceReviewStatus} />
            <StatusRow label="QR Code" value={profile.qrCodePayload ? "已建立" : "待建立"} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <IdCard className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">系統識別資料</h2>
          </div>
          <div className="mt-4 grid gap-3 text-sm">
            <StatusRow label="姓名" value={profile.fullName} />
            <StatusRow label="單位" value={profile.rootUnitName ?? "未填"} />
            <StatusRow label="科室" value={profile.departmentName ?? "未填"} />
            <StatusRow label="職稱" value={profile.jobTitle ?? "未填"} />
            <StatusRow label="身分" value={profile.workerType === "social_affairs" ? "社政訪查人員" : "民政訪查人員"} />
          </div>
          {profile.headshotProcessedUrl ? (
            <div className="mt-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={profile.headshotProcessedUrl}
                alt={`${profile.fullName} 證件照`}
                className="h-40 w-[7.5rem] rounded border object-cover"
              />
            </div>
          ) : (
            <p className="mt-4 rounded-md border border-dashed bg-background p-3 text-sm text-muted-foreground">
              尚未有正式證件照，請由後台註冊資料或補件流程補上。
            </p>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <BadgeCheck className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">可自行補充資料</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="聯絡 Email">
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.officialEmail}
                onChange={(event) => updateForm({ officialEmail: event.target.value })}
              />
            </Field>
            <Field label="手機">
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.phone}
                onChange={(event) => updateForm({ phone: event.target.value })}
              />
            </Field>
            <Field label="緊急聯絡人">
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.emergencyContactName}
                onChange={(event) => updateForm({ emergencyContactName: event.target.value })}
              />
            </Field>
            <Field label="緊急聯絡電話">
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.emergencyContactPhone}
                onChange={(event) => updateForm({ emergencyContactPhone: event.target.value })}
              />
            </Field>
            <Field label="匯款帳號末五碼">
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                inputMode="numeric"
                maxLength={5}
                value={form.bankAccountLast5}
                onChange={(event) => updateForm({ bankAccountLast5: event.target.value.replace(/\D/g, "").slice(0, 5) })}
                placeholder="只保存末五碼"
              />
            </Field>
            <Field label="銀行名稱">
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.bankName}
                onChange={(event) => updateForm({ bankName: event.target.value })}
                placeholder="例：臺灣銀行"
              />
            </Field>
            <Field label="銀行代碼">
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                inputMode="numeric"
                value={form.bankCode}
                onChange={(event) => updateForm({ bankCode: event.target.value.replace(/\D/g, "").slice(0, 7) })}
                placeholder="例：004"
              />
            </Field>
            <Field label="分行名稱">
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.bankBranchName}
                onChange={(event) => updateForm({ bankBranchName: event.target.value })}
                placeholder="例：永和分行"
              />
            </Field>
            <Field label="戶名">
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.bankAccountName}
                onChange={(event) => updateForm({ bankAccountName: event.target.value })}
                placeholder="請與存摺戶名一致"
              />
            </Field>
            <Field label="可服務時段">
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.availableTime}
                onChange={(event) => updateForm({ availableTime: event.target.value })}
                placeholder="例：平日上午、週末下午"
              />
            </Field>
            <Field label="可服務里別">
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.availableVillages}
                onChange={(event) => updateForm({ availableVillages: event.target.value })}
                placeholder="例：可支援全區、指定里別"
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="存摺封面 / 匯款資料">
                <div className="rounded-lg border bg-background p-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        可拍攝或選擇存摺封面照片。系統會自動縮小、轉黑白並壓縮保存，後續由承辦管理者確認匯款資料。
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        建議只提供匯款必要資訊，避免上傳不必要的個資頁面。
                      </p>
                    </div>
                    <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border bg-card px-3 text-sm font-medium">
                      <Upload className="h-4 w-4" />
                      選擇檔案
                      <input
                        className="sr-only"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        disabled={passbookProcessing}
                        onChange={(event) => void handlePassbookFile(event.target.files?.[0])}
                      />
                    </label>
                  </div>
                  {form.passbookCoverUrl && (
                    <div className="mt-3 rounded-md bg-secondary p-3 text-sm text-muted-foreground">
                      已選擇並壓縮存摺照片，送出後會交由承辦管理者確認。
                    </div>
                  )}
                </div>
              </Field>
            </div>
          </div>
          <Button className="mt-4 h-11 w-full sm:w-auto" onClick={saveProfile} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "儲存中" : "送出補充資料"}
          </Button>
          {message && (
            <p className="mt-3 rounded-md bg-secondary p-3 text-sm text-muted-foreground">
              {message}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

const profileStatusLabels: Record<string, string> = {
  incomplete: "待補資料",
  submitted: "已送出待確認",
  verified: "已確認",
  returned: "退回補件",
};

const remittanceStatusLabels: Record<string, string> = {
  pending: "待確認",
  approved: "已確認",
  rejected: "退回補件",
};

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}
