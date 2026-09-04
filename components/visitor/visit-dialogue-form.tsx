"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, FileText, Loader2, MapPin, PenLine, Save } from "lucide-react";
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
import {
  validateMohwLifeCareRow,
  type MohwValidationError,
} from "@/lib/domain/mohw-life-care-validation";
import {
  getMissedVisitPolicy,
  getPaymentEligibility,
  validateVisitSubmission,
} from "@/lib/domain/visits";
import { visitGuidePrecheck, visitGuideStages } from "@/lib/domain/visit-guide";

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
  const [careFormAnswers, setCareFormAnswers] = useState<MohwLifeCareAnswers>(() =>
    createInitialMohwAnswers(elderCase, schedule),
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
  const mohwValidation = useMemo(
    () =>
      validateMohwLifeCareRow(
        syncMohwConsentFromSubmission(
          syncMohwVisitMetaFromSubmission(careFormAnswers, submission),
          submission,
        ),
        { row: 2 },
      ),
    [careFormAnswers, submission],
  );
  const isMissedVisit = submission.visitResult === "未遇";
  const activePhotoCategories = isMissedVisit ? missedVisitPhotoCategories : optionalPhotoCategories;
  const hasVisitGps = typeof submission.gpsLat === "number" && typeof submission.gpsLng === "number";
  const needsMissedVisitEvidence =
    isMissedVisit && (submission.photoNames.length === 0 || !hasVisitGps);
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

    const localCheck = validateMohwLifeCareRow(mohwAnswers, { row: 2 });
    if (!localCheck.ok) {
      setMohwErrors(localCheck.errors);
      setResult(
        `驗證失敗：${localCheck.errorLines.slice(0, 3).join("；")}${
          localCheck.errorLines.length > 3 ? "…" : ""
        }`,
      );
      setIsSubmitting(false);
      return;
    }

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
        ...submission,
      }),
    });
    const data = (await response.json()) as {
      data?: { nextStep?: string };
      error?: {
        code?: string;
        message?: string;
        errorLines?: string[];
        errors?: MohwValidationError[];
      };
    };

    if (!response.ok) {
      if (data.error?.errors?.length) {
        setMohwErrors(data.error.errors);
      }
      setResult(data.error?.message ?? "送出失敗");
      setIsSubmitting(false);
      return;
    }

    setResult(data.data?.nextStep ?? "已送出");
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

  async function exportCareForm(format: "word" | "pdf") {
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
    const data = (await response.json()) as {
      data?: { filename: string; content: string; note: string };
    };
    setExportResult(
      data.data
        ? `${data.data.filename}\n${data.data.note}\n\n${data.data.content}`
        : "匯出失敗，請稍後再試。",
    );
  }

  return (
    <section className="rounded-lg border bg-card p-4 pb-28 sm:pb-4">
      <div>
        <p className="text-sm font-medium text-primary">對話式填報流程</p>
        <h1 className="mt-2 text-2xl font-semibold">{elderCase.name}</h1>
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
                <h2 className="text-sm font-semibold">衛福部生活關懷表（102 欄）</h2>
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                依中央系統匯入格式填寫，含條件欄位與訪視狀態分支；完成後可送稽核並匯出 xlsx。
              </p>
            </div>
            <div className="rounded-md border bg-card px-3 py-2 text-sm">
              <p className="font-semibold">完成度 {careFormCompletion.percent}%</p>
              <p className="mt-1 text-muted-foreground">
                必填 {careFormCompletion.completed}/{careFormCompletion.required}
              </p>
              <p
                className={`mt-1 text-xs ${
                  mohwValidation.ok ? "text-emerald-700" : "text-amber-800"
                }`}
              >
                MOHW 驗證 {mohwValidation.ok ? "通過" : `${mohwValidation.errors.length} 項錯誤`}
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
          {(mohwErrors.length > 0 || (!mohwValidation.ok && mohwValidation.errorLines.length > 0)) && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              <p className="font-medium">MOHW 驗證錯誤（含儲存格座標）</p>
              <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-auto pl-4 font-mono">
                {(mohwErrors.length ? mohwErrors.map((e) => e.display) : mohwValidation.errorLines)
                  .slice(0, 20)
                  .map((line) => (
                    <li key={line}>{line}</li>
                  ))}
              </ul>
            </div>
          )}

          <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
            <Button
              className="w-full sm:w-auto"
              type="button"
              variant="outline"
              disabled={careFormCompletion.percent < 100}
              onClick={() => void exportCareForm("word")}
            >
              匯出 Word 套版
            </Button>
            <Button
              className="w-full sm:w-auto"
              type="button"
              variant="outline"
              disabled={careFormCompletion.percent < 100}
              onClick={() => void exportCareForm("pdf")}
            >
              匯出 PDF 預覽
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
              {mohwLifeCareSections.map((section, index) => (
                <a
                  key={`jump-${section.title}`}
                  href={`#care-form-section-${index + 1}`}
                  className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  {section.title}
                </a>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {mohwLifeCareSections.map((section, index) => {
              const sectionCompletion = careFormCompletion.sections.find(
                (item) => item.title === section.title,
              );
              return (
                <details
                  id={`care-form-section-${index + 1}`}
                  key={section.title}
                  className="scroll-mt-24 rounded-lg border bg-card"
                  open={section.title.startsWith("一、")}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                    <span>{section.title}</span>
                    <span className="rounded-md bg-secondary px-2 py-1 text-xs text-muted-foreground">
                      {sectionCompletion?.completed ?? 0}/{sectionCompletion?.required ?? 0}
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
                        onChange={(value) =>
                          setCareFormAnswers((current) => ({ ...current, [field.key]: value }))
                        }
                      />
                    ))}
                  </div>
                </details>
              );
            })}
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
              {isMissedVisit ? "未遇佐證拍照與自動定位" : "拍照上傳（未遇案件必要）"}
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {isMissedVisit
              ? "訪視未遇時請至少留下門口、門牌、現場環境或通知留置紀錄照片；選擇照片時系統會自動取得定位。"
              : "一般訪視照片為選填，主要用於未遇、拒訪、地址疑義或主管要求補證時留下紀錄。"}
          </p>
          {needsMissedVisitEvidence && (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              未遇案件送出前需至少 1 張佐證照片，並完成自動定位。
            </p>
          )}
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
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <p>
              定位：
              {locationLabel}
            </p>
            <p>照片：{submission.photoNames.length > 0 ? submission.photoNames.join("、") : "尚未加入"}</p>
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
            生活關懷表：送出後由督導確認特殊風險題項。
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
          result={result}
        />
        <SubmitVisitButton
          disabled={!validation.ok || careFormCompletion.percent < 100 || !mohwValidation.ok || isSubmitting}
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
            result={result}
          />
          <SubmitVisitButton
            className="w-full"
            disabled={!validation.ok || careFormCompletion.percent < 100 || !mohwValidation.ok || isSubmitting}
            isSubmitting={isSubmitting}
            onClick={submitVisit}
          />
        </div>
      </div>
    </section>
  );
}

const missedVisitPhotoCategories = ["門口/門牌", "現場環境", "通知或留置紀錄", "其他佐證"];
const optionalPhotoCategories = ["補充照片", "本人同意照片", "環境補充", "其他"];

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

function CareFormInput({
  field,
  value,
  onChange,
}: {
  field: MohwFormField;
  value: MohwLifeCareAnswers[string];
  onChange: (value: MohwLifeCareAnswers[string]) => void;
}) {
  const requiredMark = field.required ? <span className="text-destructive"> *</span> : null;
  const isTimeField = field.mohwKey === "visit_start_time" || field.mohwKey === "visit_end_time";

  if (field.type === "multi_choice") {
    const selectedValues = Array.isArray(value) ? value : [];
    return (
      <div className="rounded-md border bg-background p-3">
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
      </div>
    );
  }

  if (field.type === "single_choice") {
    return (
      <label className="grid gap-1 text-sm font-medium">
        {field.label}
        {requiredMark}
        <select
          className="h-10 rounded-md border bg-card px-3 text-sm"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">請選擇</option>
          {field.options?.map((option, index) => (
            <option key={`${field.key}-${option}`} value={option}>
              {field.optionLabels?.[index] ?? option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="grid gap-1 text-sm font-medium">
      {field.label}
      {requiredMark}
      <input
        className="h-10 rounded-md border bg-card px-3 text-sm"
        type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
        placeholder={isTimeField ? "HH:mm（24小時制）" : undefined}
        value={typeof value === "string" ? value : Array.isArray(value) ? value.join(";") : ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SubmissionStatus({
  validationOk,
  validationMissing,
  careFormPercent,
  careFormMissing,
  result,
  compact = false,
}: {
  validationOk: boolean;
  validationMissing: string[];
  careFormPercent: number;
  careFormMissing: string[];
  result: string | null;
  compact?: boolean;
}) {
  return (
    <div className={`grid gap-1 ${compact ? "text-xs" : "text-sm"}`}>
      {!validationOk && (
        <p className="text-destructive">尚缺：{validationMissing.join("、")}</p>
      )}
      {careFormPercent < 100 && (
        <p className="text-destructive">衛福部關懷表尚缺必填：{careFormMissing.join("、")}</p>
      )}
      {result && (
        <p className="flex items-center gap-2 font-medium text-primary">
          <CheckCircle2 className="h-4 w-4" />
          {result}
        </p>
      )}
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

function SignaturePad({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [signature, setSignature] = useState(value);

  useEffect(() => {
    setSignature(value);
  }, [value]);

  return (
    <div className="mt-3">
      <input
        className="h-24 w-full rounded-md border bg-card px-3 text-center text-lg outline-none focus:ring-2 focus:ring-ring"
        value={signature}
        onChange={(event) => {
          setSignature(event.target.value);
          onChange(event.target.value);
        }}
        placeholder="請輸入簽名或簽名代碼"
      />
      <p className="mt-2 text-xs text-muted-foreground">
        目前以文字簽名代替手寫 canvas；正式版可替換成簽名板。
      </p>
    </div>
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
