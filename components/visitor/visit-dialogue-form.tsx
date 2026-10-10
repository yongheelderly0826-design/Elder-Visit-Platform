"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Camera, CheckCircle2, FileText, Loader2, MapPin, PenLine, Save } from "lucide-react";
import { SignaturePad } from "@/components/consent/signature-pad";
import { VisitAssignmentClock } from "@/components/visitor/visit-assignment-clock";
import { Button } from "@/components/ui/button";
import type { ElderCase, VisitSchedule, VisitSubmission } from "@/lib/domain/types";
import { visitQuestions } from "@/lib/domain/mock-data";
import { createVisitDraft, getVisitDraftKey, type VisitDraft } from "@/lib/domain/offline-drafts";
import { getVisitRequiredForms } from "@/lib/domain/visit-form-flow";
import {
  calculateMohwCareFormCompletion,
  createInitialMohwAnswers,
  isMohwFieldVisible,
  mohwLifeCareSampleAnswers,
  mohwLifeCareSections,
  syncMohwConsentFromSubmission,
  syncMohwVisitMetaFromSubmission,
  type MohwFormField,
} from "@/lib/domain/mohw-life-care-ui";
import { normalizeMohwAnswersOptions } from "@/lib/domain/mohw-life-care-options";
import type { MohwLifeCareAnswers } from "@/lib/domain/mohw-life-care-form";
import { evaluateHighCare } from "@/lib/domain/high-care-rules";
import {
  careFieldDomId,
  mapMohwErrorsToFields,
  validateMohwLifeCareRow,
  visitorFacingMohwError,
  type MohwValidationError,
} from "@/lib/domain/mohw-life-care-validation";
import {
  countMissedVisitPhotoSlots,
  getMissedVisitPolicy,
  getPaymentEligibility,
  missedVisitMaxSlots,
  missedVisitMinSlots,
  missedVisitTimeSlots,
  type MissedVisitTimeSlot,
  validateVisitSubmission,
} from "@/lib/domain/visits";
import { visitGuidePrecheck, visitGuideStages } from "@/lib/domain/visit-guide";
import { maskPersonName } from "@/lib/domain/person-name";

type MissedSlotPhoto = {
  slot: MissedVisitTimeSlot;
  fileName: string;
  dataUrl: string;
};

async function compressEvidencePhoto(file: File) {
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

const initialSubmission: Omit<VisitSubmission, "scheduleId"> = {
  visitResult: "訪視成功",
  healthStatus: "穩定",
  livingStatus: "可自理",
  consentSigned: true,
  consentScope: ["internal_use", "government_report", "anonymous_kpi"],
  signatureDataUrl: "",
  gpsLat: null,
  gpsLng: null,
  photoNames: [],
  notes: "",
};

const consentScopeOptions = [
  { key: "internal_use", label: "內部服務紀錄" },
  { key: "government_report", label: "政府成果回報" },
  { key: "anonymous_kpi", label: "匿名統計分析" },
  { key: "research_use", label: "健康資料串聯" },
];

const optionalPhotoCategories = ["補充照片", "本人同意照片", "環境補充", "其他"];

export function VisitDialogueForm({
  elderCase,
  schedule,
}: {
  elderCase: ElderCase;
  schedule: VisitSchedule;
}) {
  const [submission, setSubmission] = useState(initialSubmission);
  const [draftState, setDraftState] = useState<"idle" | "restored" | "saved">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [mohwErrors, setMohwErrors] = useState<MohwValidationError[]>([]);
  const [exportResult, setExportResult] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "locating" | "captured" | "unavailable">("idle");
  const [missedSlotPhotos, setMissedSlotPhotos] = useState<Partial<Record<MissedVisitTimeSlot, MissedSlotPhoto>>>(
    {},
  );
  const [slotPhotoBusy, setSlotPhotoBusy] = useState<MissedVisitTimeSlot | null>(null);
  const [careFormAnswers, setCareFormAnswers] = useState<MohwLifeCareAnswers>(() =>
    createInitialMohwAnswers(elderCase, schedule),
  );
  const [openSectionTitles, setOpenSectionTitles] = useState<string[]>(() =>
    mohwLifeCareSections
      .filter((section) => section.title.startsWith("一、"))
      .map((section) => section.title),
  );
  const draftKey = getVisitDraftKey(schedule.id);
  const careFormDraftKey = `${draftKey}:mohw_life_care_form`;
  const validation = useMemo(
    () => validateVisitSubmission({ scheduleId: schedule.id, ...submission }),
    [schedule.id, submission],
  );
  const paymentEligibility = useMemo(
    () => getPaymentEligibility({ scheduleId: schedule.id, ...submission }),
    [schedule.id, submission],
  );
  const missedVisitPolicy = useMemo(
    () => getMissedVisitPolicy(schedule, { scheduleId: schedule.id, ...submission }),
    [schedule, submission],
  );
  const requiredForms = useMemo(() => getVisitRequiredForms(schedule), [schedule]);
  const careFormCompletion = useMemo(
    () =>
      calculateMohwCareFormCompletion(
        syncMohwConsentFromSubmission(
          syncMohwVisitMetaFromSubmission(careFormAnswers, submission),
          submission,
        ),
      ),
    [careFormAnswers, submission],
  );
  const highCare = useMemo(() => evaluateHighCare(careFormAnswers), [careFormAnswers]);
  const mohwValidation = useMemo(
    () =>
      validateMohwLifeCareRow(
        syncMohwConsentFromSubmission(
          syncMohwVisitMetaFromSubmission(careFormAnswers, submission),
          submission,
        ),
        { row: 2, registryNationalId: elderCase.nationalId ?? "" },
      ),
    [careFormAnswers, elderCase.nationalId, submission],
  );
  const displayedMohwErrors = useMemo(() => {
    const byId = new Map<string, MohwValidationError>();
    for (const error of [...mohwValidation.errors, ...mohwErrors]) {
      byId.set(`${error.key}:${error.code}`, error);
    }
    return [...byId.values()];
  }, [mohwErrors, mohwValidation.errors]);
  const mohwErrorByField = useMemo(
    () => mapMohwErrorsToFields(displayedMohwErrors),
    [displayedMohwErrors],
  );
  const isMissedVisit = submission.visitResult === "未遇";
  const activePhotoCategories = optionalPhotoCategories;
  const hasVisitGps = typeof submission.gpsLat === "number" && typeof submission.gpsLng === "number";
  const missedSlotCount = countMissedVisitPhotoSlots(submission.photoNames);
  const needsMissedVisitEvidence =
    isMissedVisit && (missedSlotCount < missedVisitMinSlots || !hasVisitGps);
  const canSubmitVisit =
    validation.ok &&
    !isSubmitting &&
    (isMissedVisit || (careFormCompletion.percent >= 100 && mohwValidation.ok));
  const locationLabel =
    typeof submission.gpsLat === "number" && typeof submission.gpsLng === "number"
      ? `${submission.gpsLat.toFixed(5)}, ${submission.gpsLng.toFixed(5)}`
      : geoStatus === "locating"
        ? "取得中..."
        : geoStatus === "unavailable"
          ? "尚未取得，請確認瀏覽器定位權限"
          : "拍照或上傳後自動取得";

  useEffect(() => {
    const stored = window.localStorage.getItem(draftKey);

    if (stored) {
      const draft = JSON.parse(stored) as VisitDraft;
      setSubmission({
        visitResult: draft.visitResult,
        healthStatus: draft.healthStatus,
        livingStatus: draft.livingStatus,
        consentSigned: draft.consentSigned,
        consentScope: draft.consentScope,
        signatureDataUrl: draft.signatureDataUrl,
        gpsLat: draft.gpsLat,
        gpsLng: draft.gpsLng,
        photoNames: draft.photoNames,
        notes: draft.notes,
      });
      setDraftState("restored");
    }

    const storedCareForm = window.localStorage.getItem(careFormDraftKey);
    if (storedCareForm) {
      setCareFormAnswers(JSON.parse(storedCareForm) as MohwLifeCareAnswers);
    } else if (schedule.id === "schedule_ntpc_demo") {
      setCareFormAnswers(mohwLifeCareSampleAnswers);
    }
  }, [careFormDraftKey, draftKey, schedule.id]);

  useEffect(() => {
    const draft = createVisitDraft(submission);
    window.localStorage.setItem(draftKey, JSON.stringify(draft));
    window.localStorage.setItem(careFormDraftKey, JSON.stringify(careFormAnswers));
    setDraftState("saved");
  }, [careFormAnswers, careFormDraftKey, draftKey, submission]);

  async function submitVisit() {
    setIsSubmitting(true);
    setResult(null);
    setMohwErrors([]);

    const mohwAnswers = normalizeMohwAnswersOptions(
      syncMohwConsentFromSubmission(
        syncMohwVisitMetaFromSubmission(careFormAnswers, submission),
        submission,
      ),
    );

    if (submission.visitResult !== "未遇") {
      const localCheck = validateMohwLifeCareRow(mohwAnswers, {
        row: 2,
        registryNationalId: elderCase.nationalId ?? "",
      });
      if (!localCheck.ok) {
        setMohwErrors(localCheck.errors);
        setResult(`關懷表還有 ${localCheck.errors.length} 項需要修改，請看紅字說明`);
        setIsSubmitting(false);
        const firstError = localCheck.errors[0];
        if (firstError) {
          openAndJumpToCareField(firstError.key, setOpenSectionTitles);
        }
        return;
      }
    }

    const missedPhotos = missedVisitTimeSlots
      .map((slot) => missedSlotPhotos[slot])
      .filter((item): item is MissedSlotPhoto => Boolean(item));

    const response = await fetch("/api/visits/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scheduleId: schedule.id,
        assignmentId: schedule.id,
        visitorId: schedule.visitorId,
        encodedId: elderCase.caseCode,
        caseCode: elderCase.caseCode,
        careFormAnswers: mohwAnswers,
        registryNationalId: elderCase.nationalId ?? "",
        missedVisitPhotos: missedPhotos.map((item) => ({
          slot: item.slot,
          fileName: item.fileName,
          dataUrl: item.dataUrl,
        })),
        ...submission,
      }),
    });
    const data = (await response.json()) as {
      data?: {
        nextStep?: string;
        highCare?: { triggered?: boolean; primaryColor?: string | null; colors?: string[] };
      };
      error?: {
        code?: string;
        message?: string;
        errorLines?: string[];
        errors?: MohwValidationError[];
      };
    };

    if (!response.ok) {
      const serverErrors = data.error?.errors ?? [];
      if (serverErrors.length) {
        setMohwErrors(serverErrors);
        openAndJumpToCareField(serverErrors[0].key, setOpenSectionTitles);
      }
      setResult(
        serverErrors.length
          ? `關懷表還有 ${serverErrors.length} 項需要修改，請看紅字說明`
          : (data.error?.message ?? "送出失敗"),
      );
      setIsSubmitting(false);
      return;
    }

    const listed = data.data?.highCare?.triggered
      ? `；已列入高關懷（${(data.data.highCare.colors ?? []).join("、") || data.data.highCare.primaryColor}）`
      : "";
    setResult(`${data.data?.nextStep ?? "已送出"}${listed}`);
    window.localStorage.removeItem(draftKey);
    window.localStorage.removeItem(careFormDraftKey);
    setIsSubmitting(false);
  }

  function captureLocation() {
    if (!navigator.geolocation) {
      setGeoStatus("unavailable");
      return;
    }

    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSubmission((current) => ({
          ...current,
          gpsLat: position.coords.latitude,
          gpsLng: position.coords.longitude,
        }));
        setGeoStatus("captured");
      },
      () => setGeoStatus("unavailable"),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      },
    );
  }

  function addVisitPhotos(category: string, files: FileList | null) {
    const photoFiles = Array.from(files ?? []);
    if (photoFiles.length === 0) {
      return;
    }

    captureLocation();
    const photoNames = photoFiles.map((file) => `${category}：${file.name}`);
    setSubmission((current) => ({
      ...current,
      photoNames: [...current.photoNames, ...photoNames],
    }));
  }

  async function setMissedVisitSlotPhoto(slot: MissedVisitTimeSlot, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    setSlotPhotoBusy(slot);
    try {
      const dataUrl = await compressEvidencePhoto(file);
      captureLocation();
      const nextPhoto: MissedSlotPhoto = {
        slot,
        fileName: file.name || `${slot}.jpg`,
        dataUrl,
      };
      setMissedSlotPhotos((current) => ({ ...current, [slot]: nextPhoto }));
      setSubmission((current) => {
        const others = current.photoNames.filter((name) => !name.startsWith(`${slot}：`));
        return {
          ...current,
          photoNames: [...others, `${slot}：${nextPhoto.fileName}`],
        };
      });
    } catch {
      setResult("時段照片無法讀取，請重拍或改選其他圖片");
    } finally {
      setSlotPhotoBusy(null);
    }
  }

  function clearMissedVisitSlotPhoto(slot: MissedVisitTimeSlot) {
    setMissedSlotPhotos((current) => {
      const next = { ...current };
      delete next[slot];
      return next;
    });
    setSubmission((current) => ({
      ...current,
      photoNames: current.photoNames.filter((name) => !name.startsWith(`${slot}：`)),
    }));
  }

  async function exportCareForm(format: "word" | "pdf" | "a3") {
    const response = await fetch("/api/exports/care-form", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        format,
        elderName: elderCase.name,
        caseCode: elderCase.caseCode,
        answers: careFormAnswers,
      }),
    });
    if ((format === "pdf" || format === "a3") && response.ok) {
      const driveUrl = response.headers.get("X-Care-Form-Drive-Url");
      const folderUrl = response.headers.get("X-Care-Form-Folder-Url");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const visitDate = String(careFormAnswers.visit_date ?? "").slice(0, 10);
      const safeName = elderCase.name.replace(/[\\/:*?"<>|]/g, "-");
      link.href = url;
      link.download = `${visitDate || "未填日期"}_${safeName}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setExportResult(
        `已產生單頁直式 A3 PDF：${link.download}。` +
          (driveUrl ? `已存入 Google Drive「關懷表 PDF」目錄。${folderUrl ? `\n${folderUrl}` : ""}` : "") +
          "\n列印請選 A3 直式、縮放 100%。",
      );
      return;
    }
    const data = (await response.json()) as {
      data?: { filename: string; content: string; note: string };
      error?: { message?: string };
    };
    setExportResult(
      data.data
        ? `${data.data.filename}\n${data.data.note}\n\n${data.data.content}`
        : `匯出失敗：${data.error?.message || "請稍後再試。"}`,
    );
  }

  return (
    <section className="rounded-lg border bg-card p-4 pb-28 sm:pb-4">
      <div>
        <p className="text-sm font-medium text-primary">對話式填報流程</p>
        <h1 className="mt-2 text-2xl font-semibold">{maskPersonName(elderCase.name)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {elderCase.caseCode} · {elderCase.district} · {elderCase.village} · 第{" "}
          {schedule.visitAttempt} 次訪視
        </p>
        {draftState !== "idle" && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-secondary px-2 py-1 text-xs font-medium">
            <Save className="h-3.5 w-3.5" />
            {draftState === "restored" ? "已恢復離線草稿" : "草稿已自動保存"}
          </p>
        )}
      </div>

      <div className="mt-5 space-y-4">
        <VisitGuidePanel elderCase={elderCase} />

        <VisitAssignmentClock
          assignmentId={schedule.id}
          visitorId={schedule.visitorId}
          visitAddress={elderCase.address}
          onTimesChange={({ visitDate, visitStartTime, visitEndTime }) => {
            setCareFormAnswers((current) => ({
              ...current,
              ...(visitDate ? { visit_date: visitDate } : {}),
              ...(visitStartTime ? { visit_start_time: visitStartTime } : {}),
              ...(visitEndTime ? { visit_end_time: visitEndTime } : {}),
            }));
          }}
        />

        <section className="rounded-lg border bg-background p-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">生活關懷表（紙本分段 · 102 欄主檔）</h2>
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                依新北紙本題組填寫，資料仍存衛福部 102 欄。橘／黃／綠由系統計算，訪員不必手選。
              </p>
            </div>
            <div className="rounded-md border bg-card px-3 py-2 text-sm">
              <p className="font-semibold">完成度 {careFormCompletion.percent}%</p>
              <p className="mt-1 text-muted-foreground">
                必填 {careFormCompletion.completed}/{careFormCompletion.required}
              </p>
              <p
                className={`mt-1 text-sm ${
                  displayedMohwErrors.length === 0 ? "text-emerald-700" : "text-amber-800"
                }`}
              >
                {displayedMohwErrors.length === 0
                  ? "欄位檢查通過"
                  : `${displayedMohwErrors.length} 項需修改`}
              </p>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${careFormCompletion.percent}%` }}
            />
          </div>
          {careFormCompletion.missingLabels.length > 0 && (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              尚缺必填：{careFormCompletion.missingLabels.join("、")}
            </p>
          )}
          {displayedMohwErrors.length > 0 && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-red-950">
              <p className="text-sm font-medium">
                有 {displayedMohwErrors.length} 項需要修改
              </p>
              <p className="mt-1 text-sm leading-6 text-red-900/80">
                點選項目會跳到那一欄，欄位下方也有說明。
              </p>
              <ul className="mt-2 max-h-56 space-y-1 overflow-auto">
                {displayedMohwErrors.map((error) => (
                  <li key={`${error.key}:${error.code}:${error.message}`}>
                    <button
                      type="button"
                      className="w-full rounded-md px-2 py-1.5 text-left text-sm leading-6 hover:bg-red-100"
                      onClick={() => openAndJumpToCareField(error.key, setOpenSectionTitles)}
                    >
                      {visitorFacingMohwError(error)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {highCare.triggered && (
            <div className="mt-3 rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-950">
              <p className="font-semibold">已列入高關懷（{highCare.colors.join("、")}）</p>
              <p className="mt-1 text-xs leading-6">
                {highCare.triggers.map((item) => item.label).join("、")}。送出後進入名冊統計，不必再填一張表。
              </p>
            </div>
          )}
          {!highCare.triggered && (
            <p className="mt-3 text-xs text-muted-foreground">三、特殊題項：目前未觸發橘／黃／綠。</p>
          )}

          <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
            <Button
              className="w-full sm:w-auto"
              type="button"
              variant="outline"
              disabled={careFormCompletion.percent < 100}
              onClick={() => void exportCareForm("a3")}
            >
              下載完整 A3 PDF（含題目）
            </Button>
            <Button
              className="w-full sm:w-auto"
              type="button"
              variant="outline"
              disabled={careFormCompletion.percent < 100}
              onClick={() => void exportCareForm("word")}
            >
              匯出欄位清單
            </Button>
          </div>
          {exportResult && (
            <textarea
              className="mt-3 min-h-40 w-full rounded-md border bg-card p-3 font-mono text-xs"
              readOnly
              value={exportResult}
            />
          )}

          <div className="mt-4 rounded-lg border bg-card p-3">
            <p className="text-sm font-semibold">快速查看區段</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {mohwLifeCareSections.map((section, index) => {
                const sectionErrorCount = section.fields.filter((field) =>
                  mohwErrorByField.has(field.key),
                ).length;
                return (
                  <a
                    key={`jump-${section.title}`}
                    href={`#care-form-section-${index + 1}`}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-primary hover:text-primary-foreground ${
                      sectionErrorCount > 0
                        ? "bg-red-50 text-red-900"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {section.title}
                    {sectionErrorCount > 0 ? ` · ${sectionErrorCount} 項` : ""}
                  </a>
                );
              })}
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {mohwLifeCareSections.map((section, index) => {
              const sectionCompletion = careFormCompletion.sections.find(
                (item) => item.title === section.title,
              );
              const sectionErrorCount = section.fields.filter((field) =>
                mohwErrorByField.has(field.key),
              ).length;
              return (
                <details
                  id={`care-form-section-${index + 1}`}
                  key={section.title}
                  className={`scroll-mt-24 rounded-lg border bg-card ${
                    sectionErrorCount > 0 ? "border-destructive/40" : ""
                  }`}
                  open={openSectionTitles.includes(section.title)}
                  onToggle={(event) => {
                    const nextOpen = event.currentTarget.open;
                    setOpenSectionTitles((current) => {
                      if (nextOpen) {
                        return current.includes(section.title)
                          ? current
                          : [...current, section.title];
                      }
                      return current.filter((title) => title !== section.title);
                    });
                  }}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                    <span>{section.title}</span>
                    <span className="flex items-center gap-2">
                      {sectionErrorCount > 0 && (
                        <span className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-900">
                          需修改 {sectionErrorCount}
                        </span>
                      )}
                      <span className="rounded-md bg-secondary px-2 py-1 text-xs text-muted-foreground">
                        {sectionCompletion?.completed ?? 0}/{sectionCompletion?.required ?? 0}
                      </span>
                    </span>
                  </summary>
                  <div className="grid gap-3 border-t p-3 md:grid-cols-2 xl:grid-cols-3">
                    {section.fields
                      .filter((field) => isMohwFieldVisible(field, careFormAnswers))
                      .map((field) => (
                      <CareFormInput
                        key={field.key}
                        field={field}
                        value={careFormAnswers[field.key]}
                        error={mohwErrorByField.get(field.key)}
                        onChange={(value) =>
                          setCareFormAnswers((current) => ({ ...current, [field.key]: value }))
                        }
                      />
                    ))}
                  </div>
                </details>
              );
            })}
            <section className="rounded-lg border bg-card p-3">
              <p className="text-sm font-semibold">三、特殊題項（系統計算，勿手選）</p>
              <p className="mt-1 text-xs text-muted-foreground">
                對應紙本橘／黃／綠色塊。有風險值即列入高關懷名冊。
              </p>
              <p className="mt-2 text-sm">
                {highCare.triggered ? `結果：${highCare.colors.join("、")}` : "結果：未觸發"}
              </p>
            </section>
          </div>
        </section>

        <section className="rounded-lg border bg-background p-3">
          <h2 className="text-sm font-semibold">本次訪視內建表單</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            系統會依派案帶入四份表單，訪員完成後送督導與稽核覆核。
          </p>
          <div className="mt-3 grid gap-2 lg:grid-cols-4">
            {requiredForms.map((form) => (
              <div key={form.templateId} className="rounded-md border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{form.name}</p>
                  <span className="shrink-0 rounded-md bg-secondary px-2 py-1 text-xs">
                    {form.statusLabel}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{form.usage}</p>
                <p className="mt-2 text-xs font-medium text-primary">
                  {form.stageLabel} · {form.owner}
                </p>
              </div>
            ))}
          </div>
        </section>

        {visitQuestions.map((question) => (
          <div key={question.key} className="flex scroll-mt-24 gap-3">
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-semibold">
              問
            </div>
            <div className="flex-1 rounded-lg border bg-background p-3">
              <label className="text-sm font-medium">
                {question.label}
                {question.required && <span className="text-destructive"> *</span>}
              </label>
              <QuestionInput
                questionKey={question.key}
                type={question.type}
                options={question.options}
                value={getQuestionValue(submission, question.key)}
                onChange={(value) =>
                  setSubmission((current) => ({
                    ...current,
                    [question.key]: value,
                  }))
                }
              />
            </div>
          </div>
        ))}
      </div>

      <section className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div id="visit-consent-section" className="scroll-mt-24 rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">縣市政府版本個人資料蒐集聲明暨同意書</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            訪視開始時先取得長者本人、蓋章或手印同意；此項未完成會進入督導覆核，且不可直接核銷。
          </p>
          <SignaturePad
            value={submission.signatureDataUrl}
            onChange={(signatureDataUrl) =>
              setSubmission((current) => ({ ...current, signatureDataUrl }))
            }
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {consentScopeOptions.map((scope) => {
              const selected = submission.consentScope.includes(scope.key);
              return (
                <button
                  key={scope.key}
                  type="button"
                  className={`rounded-md border px-2 py-1 text-xs ${
                    selected ? "bg-primary text-primary-foreground" : "bg-card"
                  }`}
                  onClick={() =>
                    setSubmission((current) => ({
                      ...current,
                      consentScope: selected
                        ? current.consentScope.filter((item) => item !== scope.key)
                        : [...current.consentScope, scope.key],
                    }))
                  }
                >
                  {scope.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">
              {isMissedVisit ? "未遇時段佐證（3–5 時段拍照）" : "拍照上傳（選填）"}
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {isMissedVisit
              ? `訪視未遇時，請在不同時段各拍一張門口／現場照片作為空訪紀錄（至少 ${missedVisitMinSlots} 個時段，最多 ${missedVisitMaxSlots} 個）。選照片時會自動取得定位並上傳存檔。`
              : "一般訪視照片為選填；若結果改為「未遇」，需改填下方 3–5 個時段佐證。"}
          </p>
          {isMissedVisit && (
            <>
              <p
                className={`mt-3 rounded-md border p-2 text-xs ${
                  needsMissedVisitEvidence
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-primary/20 bg-primary/5 text-primary"
                }`}
              >
                時段進度：{missedSlotCount}／{missedVisitMaxSlots}
                （至少需 {missedVisitMinSlots} 個時段）
                {hasVisitGps ? " · 定位已取得" : " · 尚缺定位"}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {missedVisitTimeSlots.map((slot) => {
                  const photo = missedSlotPhotos[slot];
                  const busy = slotPhotoBusy === slot;
                  return (
                    <div key={slot} className="rounded-md border bg-card p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{slot}</p>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] ${
                            photo
                              ? "bg-primary/10 text-primary"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {photo ? "已上傳" : "未拍"}
                        </span>
                      </div>
                      {photo?.dataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photo.dataUrl}
                          alt={`${slot}佐證`}
                          className="mt-2 h-28 w-full rounded-md object-cover"
                        />
                      ) : (
                        <div className="mt-2 flex h-28 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                          請拍門口／現場
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <label className="inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-xs font-medium hover:bg-secondary">
                          <Camera className="h-3.5 w-3.5" />
                          {busy ? "處理中…" : photo ? "重拍／更換" : "拍照／上傳"}
                          <input
                            className="hidden"
                            type="file"
                            accept="image/*"
                            capture="environment"
                            disabled={busy}
                            onChange={(event) => {
                              void setMissedVisitSlotPhoto(slot, event.target.files);
                              event.target.value = "";
                            }}
                          />
                        </label>
                        {photo ? (
                          <button
                            type="button"
                            className="rounded-md border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary"
                            onClick={() => clearMissedVisitSlotPhoto(slot)}
                          >
                            清除
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {!isMissedVisit && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {activePhotoCategories.map((category) => (
                <label
                  key={category}
                  className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
                >
                  <Camera className="h-4 w-4" />
                  拍照 / 上傳{category}
                  <input
                    className="hidden"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={(event) => addVisitPhotos(category, event.target.files)}
                  />
                </label>
              ))}
            </div>
          )}
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <p>
              定位：
              {locationLabel}
            </p>
            {!isMissedVisit && (
              <p>
                照片：
                {submission.photoNames.length > 0 ? submission.photoNames.join("、") : "尚未加入"}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="mt-5 rounded-lg border bg-background p-3 text-sm">
        <p className="font-semibold">督導與稽核前置判斷</p>
        <p className="mt-1 text-muted-foreground">{paymentEligibility.reason}</p>
        {missedVisitPolicy.applies && (
          <div
            className={`mt-3 rounded-md border p-3 ${
              missedVisitPolicy.canClose
                ? "border-primary/30 bg-primary/5 text-primary"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <p className="font-medium">未遇三次流程</p>
            <p className="mt-1">{missedVisitPolicy.message}</p>
          </div>
        )}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <p className="rounded-md bg-card p-2 text-muted-foreground">
            生活關懷表：橘／黃／綠由系統計算，送出後自動列入高關懷名冊。
          </p>
          <p className="rounded-md bg-card p-2 text-muted-foreground">
            保密同意書：由承辦或督導於派案前確認。
          </p>
        </div>
      </div>

      <div className="mt-5 hidden flex-col gap-3 sm:flex sm:flex-row sm:items-center sm:justify-end">
        <SubmissionStatus
          validationOk={validation.ok}
          validationMissing={validation.missing}
          careFormPercent={careFormCompletion.percent}
          careFormMissing={careFormCompletion.missingLabels}
          mohwErrorCount={displayedMohwErrors.length}
          result={result}
          isMissedVisit={isMissedVisit}
        />
        <SubmitVisitButton
          disabled={!canSubmitVisit}
          isSubmitting={isSubmitting}
          onClick={submitVisit}
        />
      </div>

      {result && (
        <section className="mt-5 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium text-primary">本次訪查已完成</p>
          <h2 className="mt-1 text-base font-semibold">紀錄已送出，下一步可返回任務清單</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            系統已清除本機草稿；若有督導補件或未遇續訪，會再出現在任務清單中。
          </p>
          <div className="mt-3 grid gap-2 sm:flex">
            <Button asChild className="w-full sm:w-auto">
              <a href="/visitor/tasks">回到任務清單</a>
            </Button>
            <Button asChild className="w-full sm:w-auto" variant="outline">
              <a href="/visitor/drafts">查看草稿</a>
            </Button>
          </div>
        </section>
      )}

      <div className="safe-bottom fixed inset-x-0 bottom-16 z-20 border-t bg-card/95 px-3 py-3 shadow-[0_-10px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-md gap-2">
          <SubmissionStatus
            compact
            validationOk={validation.ok}
            validationMissing={validation.missing}
            careFormPercent={careFormCompletion.percent}
            careFormMissing={careFormCompletion.missingLabels}
            mohwErrorCount={displayedMohwErrors.length}
            result={result}
            isMissedVisit={isMissedVisit}
          />
          <SubmitVisitButton
            className="w-full"
            disabled={!canSubmitVisit}
            isSubmitting={isSubmitting}
            onClick={submitVisit}
          />
        </div>
      </div>
    </section>
  );
}

function VisitGuidePanel({ elderCase }: { elderCase: ElderCase }) {
  return (
    <section className="rounded-lg border border-primary/20 bg-primary/[0.03] p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">訪視指南</p>
          <h2 className="mt-1 text-base font-semibold">依現場對話順序完成訪查</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            先核對名冊，再依居住家庭、健康飲食、社交心情、服務同意與現場觀察分段完成，
            避免訪員只看到一長串表單。
          </p>
        </div>
        <div className="rounded-md border bg-card p-3 text-sm lg:min-w-72">
          <p className="font-semibold">{visitGuidePrecheck.title}</p>
          <p className="mt-1 leading-5 text-muted-foreground">{visitGuidePrecheck.goal}</p>
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-1">
            <GuideFact label="個案" value={maskPersonName(elderCase.name)} />
            <GuideFact label="案號" value={elderCase.caseCode} />
            <GuideFact label="區里" value={`${elderCase.district} ${elderCase.village}`} />
            <GuideFact label="地址" value={elderCase.address} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {visitGuidePrecheck.checks.map((check) => (
              <span key={check} className="rounded-md bg-secondary px-2 py-1 text-xs">
                {check}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        {visitGuideStages.map((stage, index) => (
          <details
            key={stage.id}
            className="rounded-lg border bg-card"
            open={index === 0}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 [&::-webkit-details-marker]:hidden">
              <div>
                <p className="text-sm font-semibold">{stage.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{stage.goal}</p>
              </div>
              <span className="shrink-0 rounded-md bg-secondary px-2 py-1 text-xs text-muted-foreground">
                展開
              </span>
            </summary>
            <div className="grid gap-3 border-t p-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="rounded-md bg-secondary/60 p-3">
                <p className="text-xs font-semibold text-primary">建議開場</p>
                <p className="mt-2 text-sm leading-6">{stage.openingLine}</p>
              </div>
              <div className="grid gap-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">對應填表區</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {stage.formSections.map((section) => (
                      <a
                        key={`${stage.id}-${section.href}`}
                        href={section.href}
                        className="rounded-md border bg-background px-2 py-1 text-xs font-medium transition-colors hover:border-primary hover:text-primary"
                      >
                        {section.label}
                      </a>
                    ))}
                  </div>
                </div>
                <ul className="grid gap-2">
                  {stage.checks.map((check) => (
                    <li key={check} className="flex gap-2 text-sm leading-6 text-muted-foreground">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
                      <span>{check}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function GuideFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-background px-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-2 font-medium">{value}</span>
    </div>
  );
}

function sectionTitleForCareField(key: string): string | undefined {
  return mohwLifeCareSections.find((section) =>
    section.fields.some((field) => field.key === key),
  )?.title;
}

function openAndJumpToCareField(
  key: string,
  setOpenSectionTitles: Dispatch<SetStateAction<string[]>>,
) {
  const sectionTitle = sectionTitleForCareField(key);
  if (sectionTitle) {
    setOpenSectionTitles((current) =>
      current.includes(sectionTitle) ? current : [...current, sectionTitle],
    );
  }
  window.requestAnimationFrame(() => {
    const fieldEl = document.getElementById(careFieldDomId(key));
    if (!fieldEl) return;
    const details = fieldEl.closest("details");
    if (details instanceof HTMLDetailsElement) {
      details.open = true;
    }
    fieldEl.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusable = fieldEl.querySelector<HTMLElement>("input, select, textarea, button");
    focusable?.focus({ preventScroll: true });
  });
}

function CareFormInput({
  field,
  value,
  error,
  onChange,
}: {
  field: MohwFormField;
  value: MohwLifeCareAnswers[string];
  error?: MohwValidationError;
  onChange: (value: MohwLifeCareAnswers[string]) => void;
}) {
  const requiredMark = field.required ? <span className="text-destructive"> *</span> : null;
  const isTimeField = field.mohwKey === "visit_start_time" || field.mohwKey === "visit_end_time";
  const fieldId = careFieldDomId(field.key);
  const errorId = `${fieldId}-error`;
  const controlClass = `h-10 rounded-md bg-card px-3 text-sm ${
    error
      ? "border border-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
      : "border"
  }`;
  const rawText = typeof value === "string" ? value : Array.isArray(value) ? value.join(";") : "";
  const isMaskedNameField =
    field.key === "name" ||
    field.mohwKey === "name" ||
    field.key === "emergency_contact_name" ||
    field.mohwKey === "emergency_contact_name";

  const errorText = error ? (
    <p id={errorId} role="alert" className="text-sm leading-6 text-destructive">
      {visitorFacingMohwError(error)}
    </p>
  ) : null;

  // 訪員端畫面只顯示姓氏；完整姓名仍留在 answers 供送出／衛福部匯出
  if (isMaskedNameField) {
    return (
      <div
        id={fieldId}
        className={`grid scroll-mt-28 gap-1 rounded-md border p-3 text-sm ${
          error ? "border-destructive bg-destructive/5" : "bg-background"
        }`}
      >
        <p className="font-medium">
          {field.label}
          {requiredMark}
        </p>
        <p className="text-base font-semibold">{maskPersonName(rawText) || "—"}</p>
        <p className="text-xs leading-5 text-muted-foreground">
          畫面僅顯示姓氏；送出與匯出仍使用完整姓名。
        </p>
        {errorText}
      </div>
    );
  }

  if (field.type === "multi_choice") {
    const selectedValues = Array.isArray(value) ? value : [];
    return (
      <div
        id={fieldId}
        className={`scroll-mt-28 rounded-md border p-3 ${
          error ? "border-destructive bg-destructive/5" : "bg-background"
        }`}
      >
        <p className="text-sm font-medium">
          {field.label}
          {requiredMark}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {field.options?.map((option, index) => {
            const selected = selectedValues.includes(option);
            const label = field.optionLabels?.[index] ?? option;
            return (
              <button
                key={`${field.key}-${option}`}
                type="button"
                className={`rounded-md border px-2 py-1 text-xs ${
                  selected ? "bg-primary text-primary-foreground" : "bg-card"
                }`}
                onClick={() =>
                  onChange(
                    selected
                      ? selectedValues.filter((item) => item !== option)
                      : [...selectedValues, option],
                  )
                }
              >
                {label}
              </button>
            );
          })}
        </div>
        {errorText ? <div className="mt-2">{errorText}</div> : null}
      </div>
    );
  }

  if (field.type === "single_choice") {
    return (
      <label id={fieldId} className="grid scroll-mt-28 gap-1 text-sm font-medium">
        {field.label}
        {requiredMark}
        <select
          className={controlClass}
          value={typeof value === "string" ? value : ""}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">請選擇</option>
          {field.options?.map((option, index) => (
            <option key={`${field.key}-${option}`} value={option}>
              {field.optionLabels?.[index] ?? option}
            </option>
          ))}
        </select>
        {errorText}
      </label>
    );
  }

  return (
    <label id={fieldId} className="grid scroll-mt-28 gap-1 text-sm font-medium">
      {field.label}
      {requiredMark}
      <input
        className={controlClass}
        type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
        placeholder={isTimeField ? "HH:mm（24小時制）" : undefined}
        value={typeof value === "string" ? value : Array.isArray(value) ? value.join(";") : ""}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={
          field.mohwKey.endsWith("national_id")
            ? (event) => {
                const normalized = event.target.value
                  .normalize("NFKC")
                  .trim()
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "");
                if (normalized !== event.target.value) onChange(normalized);
              }
            : undefined
        }
      />
      {errorText}
    </label>
  );
}

function SubmissionStatus({
  validationOk,
  validationMissing,
  careFormPercent,
  careFormMissing,
  mohwErrorCount,
  result,
  isMissedVisit = false,
  compact = false,
}: {
  validationOk: boolean;
  validationMissing: string[];
  careFormPercent: number;
  careFormMissing: string[];
  mohwErrorCount: number;
  result: string | null;
  isMissedVisit?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`grid gap-1 ${compact ? "text-xs" : "text-sm"}`}>
      {!validationOk && (
        <p className="text-destructive">尚缺：{validationMissing.join("、")}</p>
      )}
      {!isMissedVisit && careFormPercent < 100 && (
        <p className="text-destructive">關懷表尚缺必填：{careFormMissing.join("、")}</p>
      )}
      {!isMissedVisit && mohwErrorCount > 0 && (
        <p className="text-destructive">關懷表有 {mohwErrorCount} 項需修改，請看紅字說明</p>
      )}
      {isMissedVisit && validationOk && (
        <p className="text-muted-foreground">未遇：已備齊時段佐證與定位，可送出空訪紀錄</p>
      )}
      {result && (result.includes("需") || result.includes("失敗") ? (
        <p className="font-medium text-destructive">{result}</p>
      ) : (
        <p className="flex items-center gap-2 font-medium text-primary">
          <CheckCircle2 className="h-4 w-4" />
          {result}
        </p>
      ))}
    </div>
  );
}

function SubmitVisitButton({
  className,
  disabled,
  isSubmitting,
  onClick,
}: {
  className?: string;
  disabled: boolean;
  isSubmitting: boolean;
  onClick: () => void;
}) {
  return (
    <Button className={className} onClick={onClick} disabled={disabled}>
      {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
      送出訪查紀錄
    </Button>
  );
}

function getQuestionValue(
  submission: Omit<VisitSubmission, "scheduleId">,
  questionKey: string,
): string | boolean {
  if (questionKey === "consentSigned") {
    return submission.consentSigned;
  }
  if (questionKey === "healthStatus") {
    return submission.healthStatus;
  }
  if (questionKey === "livingStatus") {
    return submission.livingStatus;
  }
  if (questionKey === "notes") {
    return submission.notes;
  }

  return submission.visitResult;
}

function QuestionInput({
  questionKey,
  type,
  options,
  value,
  onChange,
}: {
  questionKey: string;
  type: "select" | "textarea" | "boolean";
  options?: string[];
  value: string | boolean;
  onChange: (value: string | boolean) => void;
}) {
  if (type === "textarea") {
    return (
      <textarea
        className="mt-2 min-h-24 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
        placeholder="輸入補充紀錄"
      />
    );
  }

  if (type === "boolean") {
    return (
      <div className="mt-3 flex gap-2">
        {[true, false].map((option) => (
          <button
            key={`${questionKey}-${String(option)}`}
            type="button"
            className={`h-10 rounded-md border px-4 text-sm font-medium ${
              value === option ? "bg-primary text-primary-foreground" : "bg-card"
            }`}
            onClick={() => onChange(option)}
          >
            {option ? "是" : "否"}
          </button>
        ))}
      </div>
    );
  }

  return (
    <select
      className="mt-2 h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      value={String(value)}
      onChange={(event) => onChange(event.target.value)}
    >
      {options?.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
