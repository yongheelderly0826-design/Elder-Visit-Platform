"use client";

import { useRef, useState, type ReactNode } from "react";
import { Camera, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createCompactHeadshotDataUrl,
  createLocalHeadshotPreview,
  readFileAsDataUrl,
} from "@/lib/client/visitor-headshot";
import type { VisitorRegistrationWorkerGroup } from "@/lib/domain/types";
import {
  DESK_VISITOR_EDIT_REQUIRED_HINT,
  DESK_VISITOR_REQUIRED_HINT,
  type DeskVisitorFormValues,
  type DeskVisitorGender,
} from "@/lib/domain/desk-visitor-create";
import {
  deskJobTitlesForWorkerGroup,
  visitorRegistrationDepartments,
} from "@/lib/domain/visitor-registration-options";

type Props = {
  values: DeskVisitorFormValues;
  onChange: (patch: Partial<DeskVisitorFormValues>) => void;
  onWorkerGroupChange: (workerGroup: VisitorRegistrationWorkerGroup) => void;
  mode: "create" | "edit";
  /** Compact layout for quick-key inline strip. */
  compact?: boolean;
  children?: ReactNode;
};

export function DeskVisitorFormFields({
  values,
  onChange,
  onWorkerGroupChange,
  mode,
  compact = false,
  children,
}: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);
  const [headshotProcessing, setHeadshotProcessing] = useState(false);
  const [headshotMessage, setHeadshotMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const requirePhoto = mode === "create";

  async function handlePhoto(file: File | undefined, source: "拍攝" | "相簿") {
    if (!file) return;
    setHeadshotProcessing(true);
    setHeadshotMessage("正在壓縮證件照…");
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const compactDataUrl = await createCompactHeadshotDataUrl(dataUrl);
      const preview = await createLocalHeadshotPreview(compactDataUrl);
      onChange({ photoUrl: compactDataUrl });
      setPreviewUrl(preview);
      setHeadshotMessage(`已從${source}取得證件照。`);
    } catch {
      setHeadshotMessage("照片讀取失敗，請重新拍攝或選擇較清楚的自拍照。");
    } finally {
      setHeadshotProcessing(false);
    }
  }

  const gridClass = compact
    ? "grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
    : "grid gap-3 sm:grid-cols-2";

  return (
    <div className="grid gap-3">
      <p className="text-xs leading-5 text-muted-foreground">
        {mode === "create" ? DESK_VISITOR_REQUIRED_HINT : DESK_VISITOR_EDIT_REQUIRED_HINT}
      </p>
      <div className={gridClass}>
        <Field label="姓名 *">
          <input
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={values.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="例：王小明"
          />
        </Field>
        <Field label="手機 *">
          <input
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={values.phone}
            onChange={(event) => onChange({ phone: event.target.value })}
            placeholder="例：0912345678"
          />
        </Field>
        <Field label="信箱 *">
          <input
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            type="email"
            value={values.email}
            onChange={(event) => onChange({ email: event.target.value })}
            placeholder="name@example.com"
          />
        </Field>
        <Field label="身分證字號 *">
          <input
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={values.idNumber}
            onChange={(event) => onChange({ idNumber: event.target.value.toUpperCase() })}
            placeholder="例：A123456789"
          />
        </Field>
        <Field label="性別">
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={values.gender}
            onChange={(event) =>
              onChange({ gender: event.target.value as DeskVisitorGender })
            }
          >
            <option value="女">女</option>
            <option value="男">男</option>
            <option value="其他">其他</option>
          </select>
        </Field>
        <Field label="民政／社政 *">
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={values.workerGroup}
            onChange={(event) =>
              onWorkerGroupChange(event.target.value as VisitorRegistrationWorkerGroup)
            }
          >
            <option value="civil_affairs">民政</option>
            <option value="social_affairs">社政</option>
          </select>
        </Field>
        <Field label="科室／單位別">
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={values.departmentName}
            onChange={(event) =>
              onChange({
                departmentName: event.target.value,
                departmentOther:
                  event.target.value === "其他" ? values.departmentOther : "",
              })
            }
          >
            {visitorRegistrationDepartments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
        </Field>
        {values.departmentName === "其他" ? (
          <Field label="其他單位">
            <input
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={values.departmentOther}
              onChange={(event) => onChange({ departmentOther: event.target.value })}
              placeholder="請填寫單位"
            />
          </Field>
        ) : null}
        <Field label="職稱／身分別 *">
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={values.jobTitle}
            onChange={(event) => onChange({ jobTitle: event.target.value })}
          >
            {deskJobTitlesForWorkerGroup(values.workerGroup).map((title) => (
              <option key={title} value={title}>
                {title}
              </option>
            ))}
            {values.jobTitle &&
            !deskJobTitlesForWorkerGroup(values.workerGroup).some(
              (title) => title === values.jobTitle,
            ) ? (
              <option value={values.jobTitle}>{values.jobTitle}</option>
            ) : null}
          </select>
        </Field>
      </div>

      {requirePhoto ? (
        <div className="rounded-md border bg-background p-3">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">自拍證件照 *</p>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            請在明亮處拍攝臉部正面；送出後會寫入訪查員主檔（Drive 網址或壓縮圖）。
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="aspect-[3/4] w-20 overflow-hidden rounded border bg-white">
              {previewUrl || values.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl || values.photoUrl || ""}
                  alt="證件照預覽"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                  尚未上傳
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={headshotProcessing}
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="h-4 w-4" />
                相機
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={headshotProcessing}
                onClick={() => albumInputRef.current?.click()}
              >
                <Plus className="h-4 w-4" />
                相簿
              </Button>
            </div>
          </div>
          <input
            ref={cameraInputRef}
            className="hidden"
            type="file"
            accept="image/*"
            capture="user"
            disabled={headshotProcessing}
            onChange={(event) => {
              void handlePhoto(event.target.files?.[0], "拍攝");
              event.target.value = "";
            }}
          />
          <input
            ref={albumInputRef}
            className="hidden"
            type="file"
            accept="image/*"
            disabled={headshotProcessing}
            onChange={(event) => {
              void handlePhoto(event.target.files?.[0], "相簿");
              event.target.value = "";
            }}
          />
          {headshotMessage ? (
            <p className="mt-2 text-xs text-muted-foreground">{headshotMessage}</p>
          ) : null}
        </div>
      ) : null}

      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
