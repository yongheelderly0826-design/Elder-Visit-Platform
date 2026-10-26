"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Camera, CheckCircle2, FileText, Loader2, MapPin, PenLine, Save } from "lucide-react";
import { SignaturePad } from "@/components/consent/signature-pad";
import { VisitAssignmentClock } from "@/components/visitor/visit-assignment-clock";
import { Button } from "@/components/ui/button";
import type { ElderCase, VisitSchedule, VisitSubmission } from "@/lib/domain/types";
import { visitQuestions } from "@/lib/domain/mock-data";
import { createVisitDraft, getVisitDraftKey, type VisitDraft } from "@/lib/domain/offline-drafts";
import { getVisitRequiredForms } from "@/lib/domain/visit-form-flow";
import type { DeskVisitorOption } from "@/lib/domain/manager-care-form-desk";
import {
  asMultiChoiceValues,
  createMohwDeskInitialAnswers,
  finalizeDeskContactPhones,
  getDeskNowVisitClock,
  MOHW_NONE_OF_ABOVE,
  multiIncludesNoneOfAbove,
  toggleExclusiveNoneMulti,
} from "@/lib/domain/mohw-desk-form-defaults";
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
import {
  CASE_PHONE_NONE,
  CASE_PHONE_REFUSED,
  digitsOnly,
  formatRocDate,
  normalizeIndoorPhone,
  normalizeVisitorCareAnswers,
  normalizeVisitorNationalId,
  normalizeVisitorNumber,
  normalizeVisitorRocDate,
  normalizeVisitorTime,
} from "@/lib/domain/mohw-life-care-export";
import { normalizeTaiwanMobilePhone } from "@/lib/domain/phone";
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
  missedVisitClosureAttempt,
  missedVisitMaxSlots,
  missedVisitMinSlots,
  missedVisitTimeSlots,
  type MissedVisitTimeSlot,
  validateVisitSubmission,
} from "@/lib/domain/visits";
import { toggleMissedVisitSlot } from "@/lib/domain/missed-visit-supplement";
import { visitGuidePrecheck, visitGuideStages } from "@/lib/domain/visit-guide";
import { MANAGER_DESK_NOTE } from "@/lib/domain/manager-care-form-desk";

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
  variant = "visitor",
  readonly = false,
  visitorName,
  visitorDirectory,
  selectedVisitor,
  initialTimes,
  initialAnswers,
  deskReturnPath,
  listReturnPath,
  formDefaults = "roster",
}: {
  elderCase: ElderCase;
  schedule: VisitSchedule;
  variant?: "visitor" | "manager_desk";
  readonly?: boolean;
  visitorName?: string;
  visitorDirectory?: DeskVisitorOption[];
  selectedVisitor?: DeskVisitorOption;
  initialTimes?: { visitDate?: string; visitStartTime?: string; visitEndTime?: string };
  initialAnswers?: MohwLifeCareAnswers;
  deskReturnPath?: string;
  /** 送出後回待訪／快速 KEY 名單（可帶 query） */
  listReturnPath?: string;
  /**
   * roster＝只帶名冊欄位；desk＝與關懷表建檔相同預設（性別推估、民國生日、電話 02/09、以上均無等）。
   * 快速 KEY（訪員／場生）應傳 desk。
   */
  formDefaults?: "roster" | "desk";
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
  const isDeskEntry = variant === "manager_desk";
  const useDeskFormDefaults = isDeskEntry || formDefaults === "desk";
  /** 紙本未遇：本張紙＝本次第 N 次訪視，只勾本趟時段佐證 */
  const [deskPaperSlots, setDeskPaperSlots] = useState<MissedVisitTimeSlot[]>([]);
  const [careFormAnswers, setCareFormAnswers] = useState<MohwLifeCareAnswers>(() => {
    const initial = useDeskFormDefaults
      ? createMohwDeskInitialAnswers(elderCase, schedule)
      : createInitialMohwAnswers(elderCase, schedule);
    const clock = getDeskNowVisitClock();
    const timedVisitDate = initialTimes?.visitDate
      ? (() => {
          const formatted = formatRocDate(initialTimes.visitDate);
          return formatted &&
            formatted !== "INVALID_DATE" &&
            /^\d{3}\/\d{2}\/\d{2}$/.test(formatted)
            ? formatted
            : initialTimes.visitDate;
        })()
      : useDeskFormDefaults
        ? clock.visitDate
        : undefined;
    const withTimes: MohwLifeCareAnswers = {
      ...initial,
      ...initialAnswers,
      ...(timedVisitDate ? { visit_date: timedVisitDate } : {}),
      ...(initialTimes?.visitStartTime
        ? { visit_start_time: initialTimes.visitStartTime }
        : useDeskFormDefaults
          ? { visit_start_time: clock.visitStartTime }
          : {}),
      ...(initialTimes?.visitEndTime
        ? { visit_end_time: initialTimes.visitEndTime }
        : useDeskFormDefaults
          ? { visit_end_time: clock.visitEndTime }
          : {}),
    };
    const workerKind: "social" | "civil" =
      selectedVisitor?.workerGroup === "civil_affairs" ? "civil" : "social";
    const visitorForSeed =
      selectedVisitor ||
      (visitorName
        ? {
            id: "",
            name: visitorName,
            badgeNo: "",
            status: "",
            nationalId: "",
            phone: CASE_PHONE_NONE,
            workerGroup: workerKind === "civil" ? "civil_affairs" : "social_affairs",
          }
        : null);
    // 訪員自填（含 roster）與 desk：有登入訪查員就帶入社政／民政電話（含前導 0）
    const seeded =
      visitorForSeed &&
      !withTimes.social_worker_name &&
      !withTimes.civil_worker_name &&
      (useDeskFormDefaults || Boolean(selectedVisitor))
        ? applyVisitorToWorkerAnswers(withTimes, visitorForSeed, workerKind)
        : {};
    // 草稿／主檔數字化可能丟前導 0；進畫面前記得補回
    return normalizeVisitorCareAnswers({ ...withTimes, ...seeded });
  });
  const [openSectionTitles, setOpenSectionTitles] = useState<string[]>(() =>
    mohwLifeCareSections
      .filter((section) => section.title.startsWith("一、"))
      .map((section) => section.title),
  );
  const draftKey = getVisitDraftKey(schedule.id);
  // 換 key：避開舊草稿把缺前導 0 的電話蓋回畫面（desk_defaults_v3／無後綴）
  const careFormDraftKey = `${draftKey}:mohw_life_care_form${
    useDeskFormDefaults ? ":desk_defaults_v4" : ":phone_lead0_v1"
  }`;
  const deskPaperMissed = isDeskEntry && submission.visitResult === "未遇";
  const deskPaperSlotsOk =
    !deskPaperMissed || new Set(deskPaperSlots).size >= missedVisitMinSlots;
  const effectivePhotoNames = useMemo(
    () =>
      deskPaperMissed
        ? deskPaperSlots.map(
            (slot) => `${slot}：紙本·第${schedule.visitAttempt}次`,
          )
        : submission.photoNames,
    [deskPaperMissed, deskPaperSlots, schedule.visitAttempt, submission.photoNames],
  );
  const validation = useMemo(
    () =>
      validateVisitSubmission(
        { scheduleId: schedule.id, ...submission, photoNames: effectivePhotoNames },
        { requireMissedGps: !isDeskEntry },
      ),
    [effectivePhotoNames, isDeskEntry, schedule.id, submission],
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
        {
          row: 2,
          registryNationalId: elderCase.nationalId ?? "",
          allowMissingWorkerNationalId: useDeskFormDefaults,
        },
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
  const missedSlotCount = countMissedVisitPhotoSlots(effectivePhotoNames);
  const needsMissedVisitEvidence =
    isMissedVisit &&
    !deskPaperMissed &&
    (missedSlotCount < missedVisitMinSlots || (!isDeskEntry && !hasVisitGps));
  const canSubmitVisit =
    !readonly &&
    validation.ok &&
    !isSubmitting &&
    deskPaperSlotsOk &&
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
    if (readonly) return;
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
      try {
        const parsed = JSON.parse(storedCareForm) as MohwLifeCareAnswers;
        setCareFormAnswers(normalizeVisitorCareAnswers(parsed));
      } catch {
        // 損壞草稿略過，保留 useState 初始值
      }
    } else if (schedule.id === "schedule_ntpc_demo") {
      setCareFormAnswers(normalizeVisitorCareAnswers(mohwLifeCareSampleAnswers));
    }
  }, [careFormDraftKey, draftKey, readonly, schedule.id]);

  useEffect(() => {
    if (readonly) return;
    const draft = createVisitDraft(submission);
    window.localStorage.setItem(draftKey, JSON.stringify(draft));
    window.localStorage.setItem(careFormDraftKey, JSON.stringify(careFormAnswers));
    setDraftState("saved");
  }, [careFormAnswers, careFormDraftKey, draftKey, readonly, submission]);

  async function submitVisit() {
    if (readonly) return;
    setIsSubmitting(true);
    setResult(null);
    setMohwErrors([]);

    const synced = normalizeVisitorCareAnswers(
      normalizeMohwAnswersOptions(
        syncMohwConsentFromSubmission(
          syncMohwVisitMetaFromSubmission(careFormAnswers, submission),
          submission,
        ),
      ),
    );
    const mohwAnswers = useDeskFormDefaults ? finalizeDeskContactPhones(synced) : synced;
    setCareFormAnswers(mohwAnswers);

    if (submission.visitResult !== "未遇") {
      const localCheck = validateMohwLifeCareRow(mohwAnswers, {
        row: 2,
        registryNationalId: elderCase.nationalId ?? "",
        allowMissingWorkerNationalId: useDeskFormDefaults,
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

    const missedPhotos = deskPaperMissed
      ? []
      : missedVisitTimeSlots
          .map((slot) => missedSlotPhotos[slot])
          .filter((item): item is MissedSlotPhoto => Boolean(item));

    const deskAttemptNote = deskPaperMissed
      ? `第${schedule.visitAttempt}次未遇紙本 時段(${deskPaperSlots.join("、") || "—"})`
      : "";

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
        deskEntry: isDeskEntry,
        closeAsMissedTriple:
          deskPaperMissed && schedule.visitAttempt >= missedVisitClosureAttempt,
        missedVisitPhotos: missedPhotos.map((item) => ({
          slot: item.slot,
          fileName: item.fileName,
          dataUrl: item.dataUrl,
        })),
        ...submission,
        photoNames: effectivePhotoNames,
        notes: isDeskEntry
          ? [MANAGER_DESK_NOTE, deskAttemptNote, submission.notes].filter(Boolean).join("；")
          : submission.notes,
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
        <p className="text-sm font-medium text-primary">
          {isDeskEntry ? "公所代填・紙本（一張＝一次訪視）" : "對話式填報流程"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{elderCase.name || "未填姓名"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {elderCase.caseCode} · {elderCase.district} · {elderCase.village} · 第{" "}
          {schedule.visitAttempt} 次訪視
          {isDeskEntry && visitorName ? ` · 指定訪員 ${visitorName}` : ""}
        </p>
        {isDeskEntry ? (
          <p className="mt-2 text-sm text-muted-foreground">
            一般完成／拒訪不需三次；僅「未遇」才需陸續 KEY 滿 {missedVisitClosureAttempt}{" "}
            張紙本（每次各自確認訪視時間）。本次只填這一張。
          </p>
        ) : null}
        {readonly ? (
          <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">
            此筆已送出，訪員只能查看。如需修改請由承辦在「關懷表建檔」處理。
          </p>
        ) : null}
        {draftState !== "idle" && !readonly && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-secondary px-2 py-1 text-xs font-medium">
            <Save className="h-3.5 w-3.5" />
            {draftState === "restored" ? "已恢復離線草稿" : "草稿已自動保存"}
          </p>
        )}
      </div>

      <fieldset disabled={readonly} className="mt-5 min-w-0 space-y-4 border-0 p-0">
        {isDeskEntry ? null : <VisitGuidePanel elderCase={elderCase} />}

        {isDeskEntry ? null : (
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
        )}

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
                        visitorDirectory={visitorDirectory}
                        deskEntry={useDeskFormDefaults}
                        onChange={(value) =>
                          setCareFormAnswers((current) => {
                            const next = { ...current, [field.key]: value };
                            // 電話欄一律走補前導 0，避免只改畫面、answers 仍缺 0
                            if (
                              field.key === "phone" ||
                              field.key === "mobile" ||
                              field.key === "emergency_contact_phone" ||
                              field.key === "social_worker_phone" ||
                              field.key === "civil_worker_phone"
                            ) {
                              return normalizeVisitorCareAnswers(next);
                            }
                            return next;
                          })
                        }
                        onPatchAnswers={(patchOrFn) =>
                          setCareFormAnswers((current) => {
                            const patch =
                              typeof patchOrFn === "function" ? patchOrFn(current) : patchOrFn;
                            return normalizeVisitorCareAnswers({ ...current, ...patch });
                          })
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

        {deskPaperMissed ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
            <h2 className="text-sm font-semibold text-amber-950">
              本張紙本・第 {schedule.visitAttempt} 次未遇時段
            </h2>
            <p className="mt-1 text-sm leading-6 text-amber-900/90">
              依紙本勾選本次訪視已備之不同時段（至少 {missedVisitMinSlots} 個）。
              {schedule.visitAttempt < missedVisitClosureAttempt
                ? ` 送出後再 KEY 下一張，直到滿 ${missedVisitClosureAttempt} 次。`
                : ` 已達第 ${missedVisitClosureAttempt} 次，可送出後由督導結案。`}
            </p>
            <p
              className={`mt-3 rounded-md border px-3 py-2 text-sm ${
                deskPaperSlotsOk
                  ? "border-primary/30 bg-card text-primary"
                  : "border-amber-300 bg-card text-amber-950"
              }`}
            >
              已勾 {new Set(deskPaperSlots).size}／至少 {missedVisitMinSlots}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {missedVisitTimeSlots.map((slot) => {
                const selected = deskPaperSlots.includes(slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    className={`rounded-md border px-3 py-2 text-sm font-medium ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-amber-300 bg-card text-amber-950"
                    }`}
                    onClick={() =>
                      setDeskPaperSlots((current) => toggleMissedVisitSlot(current, slot))
                    }
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">
              {deskPaperMissed
                ? "現場照片（紙本建檔可略過）"
                : isMissedVisit
                  ? "未遇時段佐證（3–5 時段拍照）"
                  : "拍照上傳（選填）"}
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {deskPaperMissed
              ? "紙本已有時段勾選即可；若有電子檔可選填上傳。"
              : isMissedVisit
              ? `訪視未遇時，請在不同時段各拍一張門口／現場照片作為空訪紀錄（至少 ${missedVisitMinSlots} 個時段，最多 ${missedVisitMaxSlots} 個）。選照片時會自動取得定位並上傳存檔。`
              : "一般訪視照片為選填；若結果改為「未遇」，需改填下方 3–5 個時段佐證。"}
          </p>
          {isMissedVisit && !deskPaperMissed && (
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

      {readonly ? null : (
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
      )}

      {result && (
        <section className="mt-5 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium text-primary">本次訪查已完成</p>
          <h2 className="mt-1 text-base font-semibold">
            {listReturnPath || isDeskEntry
              ? "已 KEY 送出，可回名單繼續下一案"
              : "紀錄已送出，下一步可返回任務清單"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {listReturnPath || isDeskEntry
              ? "系統已清除本機草稿。請回待訪名單，再點下一案「確認」繼續 KEY。"
              : "系統已清除本機草稿；若有督導補件或未遇續訪，會再出現在任務清單中。"}
          </p>
          <div className="mt-3 grid gap-2 sm:flex">
            {listReturnPath || isDeskEntry ? (
              <Button asChild className="w-full sm:w-auto">
                <a
                  href={
                    listReturnPath ||
                    `${deskReturnPath || "/desk/care-forms"}?done=${encodeURIComponent(schedule.id)}`
                  }
                >
                  回待訪名單
                </a>
              </Button>
            ) : (
              <>
                <Button asChild className="w-full sm:w-auto">
                  <a href="/visitor/tasks">回到任務清單</a>
                </Button>
                <Button asChild className="w-full sm:w-auto" variant="outline">
                  <a href="/visitor/drafts">查看草稿</a>
                </Button>
              </>
            )}
          </div>
        </section>
      )}

      {readonly ? null : (
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
      )}
      </fieldset>
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
            <GuideFact label="個案" value={elderCase.name} />
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

function WorkerNamePicker({
  field,
  value,
  error,
  errorText,
  directory,
  kind,
  onChange,
  onPick,
}: {
  field: MohwFormField;
  value: string;
  error?: MohwValidationError;
  errorText: ReactNode;
  directory: DeskVisitorOption[];
  kind: "social" | "civil";
  onChange: (value: MohwLifeCareAnswers[string]) => void;
  onPick: (visitor: DeskVisitorOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const fieldId = careFieldDomId(field.key);
  const errorId = `${fieldId}-error`;
  const controlClass = `h-10 w-full rounded-md bg-card px-3 text-sm ${
    error
      ? "border border-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
      : "border"
  }`;

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const matches = useMemo(() => {
    const needle = query.trim();
    const rows = directory.filter((item) => item.name);
    if (!needle) return rows.slice(0, 12);
    return rows
      .filter((item) =>
        [item.name, item.badgeNo, item.phone, item.nationalId].some((part) =>
          part.toLowerCase().includes(needle.toLowerCase()),
        ),
      )
      .slice(0, 12);
  }, [directory, query]);

  return (
    <div id={fieldId} className="relative grid scroll-mt-28 gap-1 text-sm font-medium">
      <span>
        {field.label}
        {field.required ? <span className="text-destructive"> *</span> : null}
      </span>
      <input
        className={controlClass}
        type="text"
        placeholder="輸入姓名搜尋訪查員，點選後帶入身分證／電話"
        value={query}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          onChange(next);
          setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
      />
      <p className="text-xs font-normal leading-5 text-muted-foreground">
        可搜尋已建檔訪查員；點選後自動帶入
        {kind === "social" ? "社政" : "民政"}
        身分證與電話（並清空另一邊訪查人欄位）。
      </p>
      {open ? (
        <div className="absolute left-0 right-0 top-[4.75rem] z-20 max-h-56 overflow-auto rounded-md border bg-card shadow-md">
          {matches.map((visitor) => (
            <button
              key={visitor.id}
              type="button"
              className="grid w-full gap-0.5 border-b px-3 py-2 text-left last:border-0 hover:bg-secondary"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuery(visitor.name);
                onPick(visitor);
                setOpen(false);
              }}
            >
              <span className="font-medium">{visitor.name}</span>
              <span className="text-xs text-muted-foreground">
                {[visitor.badgeNo, visitor.phone, visitor.nationalId ? `證${visitor.nationalId.slice(-4)}` : ""]
                  .filter(Boolean)
                  .join(" · ") || visitor.id}
              </span>
            </button>
          ))}
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">找不到訪查員，可直接手打姓名。</p>
          ) : null}
        </div>
      ) : null}
      {errorText}
    </div>
  );
}

function defaultWorkerRole(kind: "social" | "civil", currentRole: unknown): string {
  const existing = String(currentRole ?? "").trim();
  if (existing) return existing;
  // 社政選項含「志工」但產品用語優先「社會局/處」；民政預設公所人員
  return kind === "civil" ? "公所人員" : "社會局/處";
}

function applyVisitorToWorkerAnswers(
  current: MohwLifeCareAnswers,
  visitor: DeskVisitorOption,
  kind: "social" | "civil",
): MohwLifeCareAnswers {
  const visitDate = String(current.visit_date ?? "").trim();
  const phone =
    normalizeTaiwanMobilePhone(visitor.phone) ||
    normalizeIndoorPhone(String(visitor.phone || "").trim()) ||
    CASE_PHONE_NONE;
  const nationalId = normalizeVisitorNationalId(visitor.nationalId || "");
  if (kind === "civil") {
    return {
      social_worker_role: "",
      social_worker_role_other: "",
      social_worker_name: "",
      social_worker_national_id: "",
      social_worker_phone: "",
      social_worker_date: "",
      civil_worker_role: defaultWorkerRole("civil", current.civil_worker_role),
      civil_worker_name: visitor.name,
      civil_worker_national_id: nationalId,
      civil_worker_phone: phone,
      civil_worker_date: String(current.civil_worker_date || visitDate),
    };
  }
  return {
    civil_worker_role: "",
    civil_worker_name: "",
    civil_worker_national_id: "",
    civil_worker_phone: "",
    civil_worker_date: "",
    social_worker_role: defaultWorkerRole("social", current.social_worker_role),
    social_worker_name: visitor.name,
    social_worker_national_id: nationalId,
    social_worker_phone: phone,
    social_worker_date: String(current.social_worker_date || visitDate),
  };
}

function CareFormInput({
  field,
  value,
  error,
  visitorDirectory,
  deskEntry = false,
  onChange,
  onPatchAnswers,
}: {
  field: MohwFormField;
  value: MohwLifeCareAnswers[string];
  error?: MohwValidationError;
  visitorDirectory?: DeskVisitorOption[];
  deskEntry?: boolean;
  onChange: (value: MohwLifeCareAnswers[string]) => void;
  onPatchAnswers?: (
    patch: MohwLifeCareAnswers | ((current: MohwLifeCareAnswers) => MohwLifeCareAnswers),
  ) => void;
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
  const isNameField =
    field.key === "name" ||
    field.mohwKey === "name" ||
    field.key === "emergency_contact_name" ||
    field.mohwKey === "emergency_contact_name";
  const isPhoneField = [
    "phone",
    "mobile",
    "emergency_contact_phone",
    "social_worker_phone",
    "civil_worker_phone",
  ].includes(field.mohwKey);
  const rawText = (() => {
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (Array.isArray(value)) return value.join(";");
    return "";
  })();
  // 畫面顯示前補前導 0（草稿／number 化後常見 9123456789）
  const phoneText = isPhoneField && rawText.trim() ? normalizeIndoorPhone(rawText) || rawText : rawText;
  const isIdField = field.mohwKey.endsWith("national_id");
  const isDecimalNumber = field.mohwKey === "height_cm" || field.mohwKey === "weight_kg";
  const workerKind =
    field.mohwKey === "social_worker_name"
      ? "social"
      : field.mohwKey === "civil_worker_name"
        ? "civil"
        : null;

  // 把補好的前導 0 寫回 answers，避免畫面有 0、狀態仍缺 0 → 紅字
  useLayoutEffect(() => {
    if (!isPhoneField || phoneText === rawText || !phoneText) return;
    onChange(phoneText);
    // onChange 每 render 新建；只在 raw／補完值不同時修復
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [isPhoneField, phoneText, rawText]);

  const errorText = error ? (
    <p id={errorId} role="alert" className="text-sm leading-6 text-destructive">
      {visitorFacingMohwError(error)}
    </p>
  ) : null;

  if (workerKind && visitorDirectory?.length && onPatchAnswers) {
    return (
      <WorkerNamePicker
        field={field}
        value={rawText}
        error={error}
        errorText={errorText}
        directory={visitorDirectory}
        kind={workerKind}
        onChange={onChange}
        onPick={(visitor) =>
          onPatchAnswers((current) => applyVisitorToWorkerAnswers(current, visitor, workerKind))
        }
      />
    );
  }

  if (field.type === "multi_choice") {
    const selectedValues = asMultiChoiceValues(value);
    const hasNoneOption = Boolean(
      field.options?.some(
        (option) => option === MOHW_NONE_OF_ABOVE || option.includes(MOHW_NONE_OF_ABOVE),
      ),
    );
    // 凡選項含「以上均無」一律互斥，預設選中時其他項必須反灰
    const exclusiveNone = hasNoneOption;
    const noneSelected = exclusiveNone && multiIncludesNoneOfAbove(selectedValues);
    return (
      <div
        id={fieldId}
        className={`scroll-mt-28 rounded-md border p-3 ${
          error ? "border-destructive bg-destructive/5" : "bg-background"
        }`}
      >
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-medium">
          <span>
            {field.label}
            {requiredMark}
          </span>
          <span className="rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[11px] font-medium text-primary">
            可複選
          </span>
        </p>
        <p className="mt-1 text-xs font-normal leading-5 text-muted-foreground">
          可同時勾選多項；再點已選項目可取消勾選。
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {field.options?.map((option, index) => {
            const isNoneOption =
              option === MOHW_NONE_OF_ABOVE || option.includes(MOHW_NONE_OF_ABOVE);
            const selected = selectedValues.includes(option);
            const label = field.optionLabels?.[index] ?? option;
            const disabledOther = noneSelected && !isNoneOption;
            return (
              <button
                key={`${field.key}-${option}`}
                type="button"
                disabled={disabledOther}
                aria-pressed={selected}
                aria-disabled={disabledOther}
                title={
                  disabledOther
                    ? "已選「以上均無」。請先再按一次「以上均無」取消後，才能勾其他項。"
                    : undefined
                }
                className={`rounded-md border px-2 py-1 text-xs transition-opacity ${
                  selected
                    ? "bg-primary text-primary-foreground"
                    : disabledOther
                      ? "pointer-events-none cursor-not-allowed border-muted bg-muted/80 text-muted-foreground opacity-40"
                      : "bg-card"
                }`}
                onClick={() =>
                  onChange(
                    exclusiveNone
                      ? toggleExclusiveNoneMulti(selectedValues, option)
                      : selected
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
        {exclusiveNone ? (
          <p
            className={`mt-2 text-xs leading-5 ${
              noneSelected ? "font-medium text-foreground" : "font-normal text-muted-foreground"
            }`}
          >
            {noneSelected
              ? "目前為「以上均無」：其他選項已反灰（不可點）。再按一次「以上均無」即可取消，然後可勾其他項。"
              : "選「以上均無」會清掉其他項並反灰；再按一次「以上均無」即可取消。"}
          </p>
        ) : null}
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

  if (isTimeField) {
    return (
      <div id={fieldId} className="grid scroll-mt-28 gap-1 text-sm font-medium">
        <span>
          {field.label}
          {requiredMark}
        </span>
        <HalfwidthTimeInput
          value={rawText}
          invalid={Boolean(error)}
          describedBy={error ? errorId : undefined}
          onChange={onChange}
        />
        {errorText}
      </div>
    );
  }

  if (field.type === "date") {
    return (
      <div id={fieldId} className="grid scroll-mt-28 gap-1 text-sm font-medium">
        <span>
          {field.label}
          {requiredMark}
        </span>
        <RocDateInput
          value={rawText}
          invalid={Boolean(error)}
          describedBy={error ? errorId : undefined}
          onChange={onChange}
        />
        <p className="text-xs font-normal leading-5 text-muted-foreground">
          只填數字，斜線由系統帶入。三碼年不補 0，兩碼年會補成 099。
        </p>
        {errorText}
      </div>
    );
  }

  const isElderPhoneField = field.mohwKey === "phone" || field.mohwKey === "mobile";
  const isEmergencyPhoneField = field.mohwKey === "emergency_contact_phone";
  const phoneDigitsValue = phoneText.replace(/\D/g, "");
  const nonePhone =
    isElderPhoneField && phoneDigitsValue === CASE_PHONE_NONE;
  const refused =
    isElderPhoneField && phoneDigitsValue === CASE_PHONE_REFUSED;
  const phoneLocked = nonePhone || refused;
  const deskPhonePrefix = field.mohwKey === "phone" ? "02" : "09";
  const placeholder = isNameField
    ? "請填完整姓名"
    : isElderPhoneField && deskEntry
      ? field.mohwKey === "phone"
        ? "02 開頭市話，或勾下方「無電話／不願提供」"
        : "09 開頭手機，或勾下方「無電話／不願提供」"
      : isElderPhoneField
        ? "0000000000 或 9999999999 或實際電話"
        : isEmergencyPhoneField
          ? "沒有可留空"
          : isPhoneField
            ? "只填數字，O 會自動改成 0"
            : isIdField
              ? "1 碼英文 + 9 碼數字；數字裡的 O 會改成 0"
              : undefined;
  const phoneHint = isElderPhoneField
    ? deskEntry
      ? field.mohwKey === "phone"
        ? "台北市話多為 02 開頭。勾「無電話」→0000000000；勾「不願提供」→9999999999。電話、手機擇一必填。"
        : "格式 0900123456。勾「無電話」→0000000000；勾「不願提供」→9999999999。電話、手機擇一必填。"
      : "無手機及電話請勾「無電話」或填 0000000000；不願提供請勾或填 9999999999。"
    : isEmergencyPhoneField
      ? "非必填，沒有可留空。"
      : isPhoneField
        ? "只填數字，O 會自動改成 0"
        : null;

  return (
    <label id={fieldId} className="grid scroll-mt-28 gap-1 text-sm font-medium">
      {field.label}
      {requiredMark}
      <input
        className={controlClass}
        type="text"
        inputMode={isPhoneField || field.type === "number" ? "numeric" : undefined}
        placeholder={placeholder}
        value={
          refused ? CASE_PHONE_REFUSED : nonePhone ? CASE_PHONE_NONE : phoneText
        }
        disabled={phoneLocked}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          const next = event.target.value;
          if (isPhoneField) {
            const asMobile = normalizeTaiwanMobilePhone(next);
            if (asMobile && /^09\d{8}$/.test(asMobile)) {
              onChange(asMobile);
              return;
            }
            // 市話／輸入中：最多 10 碼數字，勿吃掉前導 0
            const digits = digitsOnly(next, 10);
            const repaired = normalizeIndoorPhone(digits);
            onChange(repaired && /^0\d{8,9}$/.test(repaired) ? repaired : digits);
            return;
          }
          if (isIdField) {
            onChange(normalizeVisitorNationalId(next));
            return;
          }
          if (field.type === "number") {
            onChange(normalizeVisitorNumber(next, isDecimalNumber));
            return;
          }
          onChange(next);
        }}
        onBlur={(event) => {
          if (isPhoneField) {
            const normalized = normalizeIndoorPhone(event.target.value);
            if (normalized !== phoneText) onChange(normalized);
            return;
          }
          if (isIdField) {
            const normalized = normalizeVisitorNationalId(event.target.value);
            if (normalized !== rawText) onChange(normalized);
          }
        }}
      />
      {deskEntry && isElderPhoneField ? (
        <div className="mt-1 grid gap-1.5">
          <label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={nonePhone}
              onChange={(event) => {
                if (event.target.checked) {
                  onChange(CASE_PHONE_NONE);
                  return;
                }
                onChange(deskPhonePrefix);
              }}
            />
            無電話（匯出 0000000000）
          </label>
          <label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={refused}
              onChange={(event) => {
                if (event.target.checked) {
                  onChange(CASE_PHONE_REFUSED);
                  return;
                }
                onChange(deskPhonePrefix);
              }}
            />
            不願提供（匯出 9999999999）
          </label>
        </div>
      ) : null}
      {phoneHint ? (
        <p className="text-xs font-normal leading-5 text-muted-foreground">{phoneHint}</p>
      ) : null}
      {errorText}
    </label>
  );
}

function splitRocDateParts(raw: string): [string, string, string] {
  if (!raw.trim()) return ["", "", ""];
  // 西元 ISO／四碼年必須先轉民國，不可 digitsOnly(年, 3) 否則 2026→202
  if (/^\d{4}-\d{2}-\d{2}/.test(raw) || /^\d{4}\/\d{1,2}\/\d{1,2}/.test(raw)) {
    const official = normalizeVisitorRocDate(raw);
    if (/^\d{3}\/\d{2}\/\d{2}$/.test(official)) {
      const [year, month, day] = official.split("/");
      return [year, month, day];
    }
    const formatted = formatRocDate(raw);
    if (/^\d{3}\/\d{2}\/\d{2}$/.test(formatted)) {
      const [year, month, day] = formatted.split("/");
      return [year, month, day];
    }
  }
  const parts = raw.replace(/[-．。]/g, "/").split("/");
  const yearPart = String(parts[0] ?? "").replace(/\D/g, "");
  if (yearPart.length === 4 && Number(yearPart) >= 1912) {
    const formatted = formatRocDate(
      `${yearPart}-${digitsOnly(parts[1] ?? "", 2) || "01"}-${digitsOnly(parts[2] ?? "", 2) || "01"}`,
    );
    if (/^\d{3}\/\d{2}\/\d{2}$/.test(formatted)) {
      const [year, month, day] = formatted.split("/");
      return [year, month, day];
    }
  }
  return [digitsOnly(parts[0] ?? "", 3), digitsOnly(parts[1] ?? "", 2), digitsOnly(parts[2] ?? "", 2)];
}

function boxedInputClass() {
  return "w-12 bg-transparent text-center text-sm tabular-nums outline-none";
}

function RocDateInput({
  value,
  invalid,
  describedBy,
  onChange,
}: {
  value: string;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
}) {
  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const [year, month, day] = splitRocDateParts(value);

  function commit(nextYear: string, nextMonth: string, nextDay: string, pad: boolean) {
    const yearText = digitsOnly(nextYear, 3);
    const monthText = digitsOnly(nextMonth, 2);
    const dayText = digitsOnly(nextDay, 2);
    if (!yearText && !monthText && !dayText) {
      onChange("");
      return;
    }
    const joined = `${yearText}/${monthText}/${dayText}`;
    onChange(pad && yearText && monthText && dayText ? normalizeVisitorRocDate(joined) : joined);
  }

  return (
    <div
      className={`flex h-10 items-center rounded-md bg-card px-2 ${
        invalid ? "border border-destructive" : "border"
      }`}
    >
      <input
        className="w-14 bg-transparent text-center text-sm tabular-nums outline-none"
        inputMode="numeric"
        maxLength={3}
        aria-label="民國年"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        value={year}
        onChange={(event) => {
          const next = digitsOnly(event.target.value, 3);
          commit(next, month, day, false);
          if (next.length === 3) monthRef.current?.focus();
        }}
        onBlur={(event) => commit(event.target.value, month, day, true)}
      />
      <span className="w-4 shrink-0 text-center text-base font-semibold leading-none" aria-hidden="true">
        /
      </span>
      <input
        ref={monthRef}
        className={boxedInputClass()}
        inputMode="numeric"
        maxLength={2}
        aria-label="月"
        aria-invalid={invalid}
        value={month}
        onChange={(event) => {
          const next = digitsOnly(event.target.value, 2);
          commit(year, next, day, false);
          if (next.length === 2) dayRef.current?.focus();
        }}
        onBlur={(event) => commit(year, event.target.value, day, true)}
      />
      <span className="w-4 shrink-0 text-center text-base font-semibold leading-none" aria-hidden="true">
        /
      </span>
      <input
        ref={dayRef}
        className={boxedInputClass()}
        inputMode="numeric"
        maxLength={2}
        aria-label="日"
        aria-invalid={invalid}
        value={day}
        onChange={(event) => {
          const next = digitsOnly(event.target.value, 2);
          commit(year, month, next, false);
        }}
        onBlur={(event) => commit(year, month, event.target.value, true)}
      />
    </div>
  );
}

function HalfwidthTimeInput({
  value,
  invalid,
  describedBy,
  onChange,
}: {
  value: string;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
}) {
  const minuteRef = useRef<HTMLInputElement>(null);
  const [hour = "", minute = ""] = value.split(":");
  const hourDigits = digitsOnly(hour, 2);
  const minuteDigits = digitsOnly(minute, 2);

  function commit(nextHour: string, nextMinute: string, pad: boolean) {
    const hourText = digitsOnly(nextHour, 2);
    const minuteText = digitsOnly(nextMinute, 2);
    if (!hourText && !minuteText) {
      onChange("");
      return;
    }
    onChange(pad ? normalizeVisitorTime(`${hourText}:${minuteText}`) : `${hourText}:${minuteText}`);
  }

  return (
    <div
      className={`flex h-10 items-center rounded-md bg-card px-2 ${
        invalid ? "border border-destructive" : "border"
      }`}
    >
      <input
        className={boxedInputClass()}
        inputMode="numeric"
        maxLength={2}
        aria-label="時"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        value={hourDigits}
        onChange={(event) => {
          const next = digitsOnly(event.target.value, 2);
          commit(next, minuteDigits, false);
          if (next.length === 2) minuteRef.current?.focus();
        }}
        onBlur={(event) => commit(event.target.value, minuteDigits, true)}
      />
      <span className="w-4 shrink-0 text-center text-base font-semibold leading-none" aria-hidden="true">
        :
      </span>
      <input
        ref={minuteRef}
        className={boxedInputClass()}
        inputMode="numeric"
        maxLength={2}
        aria-label="分"
        aria-invalid={invalid}
        value={minuteDigits}
        onChange={(event) => {
          const next = digitsOnly(event.target.value, 2);
          commit(hourDigits, next, false);
        }}
        onBlur={(event) => commit(hourDigits, event.target.value, true)}
      />
    </div>
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
