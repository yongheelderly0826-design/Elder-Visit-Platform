"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { SignaturePad } from "@/components/consent/signature-pad";
import { Button } from "@/components/ui/button";
import {
  electronicConsentTemplates,
  getElectronicConsentTemplate,
  type ElectronicConsentTemplateId,
} from "@/lib/domain/consent";

export function VisitorConsentForm({
  visitorName,
  visitorId,
}: {
  visitorName: string;
  visitorId: string;
}) {
  const [templateId, setTemplateId] =
    useState<ElectronicConsentTemplateId>("gov_personal_data_consent_115");
  const [signerName, setSignerName] = useState("");
  const [caseId, setCaseId] = useState("");
  const [scheduleId, setScheduleId] = useState("");
  const [identityType, setIdentityType] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [phone, setPhone] = useState("");
  const [healthLinkConsent, setHealthLinkConsent] = useState<"同意" | "不同意">("不同意");
  const [confirmed, setConfirmed] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const template = useMemo(() => getElectronicConsentTemplate(templateId), [templateId]);
  const isPersonal = templateId === "gov_personal_data_consent_115";
  const identityOptions =
    template.sections.flatMap((section) => section.fields).find((field) => field.key === "identity_type")
      ?.options ?? [];

  function changeTemplate(next: ElectronicConsentTemplateId) {
    setTemplateId(next);
    setSignerName(next === "gov_personal_data_consent_115" ? "" : visitorName);
    setConfirmed(false);
    setSignatureDataUrl("");
    setStatus("");
  }

  async function submit() {
    if (!confirmed) {
      setStatus(isPersonal ? "請先確認長者同意個資蒐集與使用。" : "請先確認遵守保密事項。");
      return;
    }
    if (!signatureDataUrl) {
      setStatus("簽名板仍為空白，請完成手寫簽名。");
      return;
    }
    setSubmitting(true);
    setStatus("");
    const fieldValues = isPersonal
      ? {
          consent_person_name: signerName,
          personal_data_use_consent: "同意",
          health_database_link_consent: healthLinkConsent,
        }
      : {
          signer_name: signerName,
          identity_type: identityType,
          national_id: nationalId,
          phone,
          confidentiality_confirmed: "同意",
        };
    try {
      const response = await fetch("/api/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          templateId,
          signerName,
          caseId,
          scheduleId,
          externalRef: [caseId, scheduleId].filter(Boolean).join(":"),
          signatureDataUrl,
          fieldValues,
          metadata: { source: "visitor_mobile", visitorIdHint: visitorId },
        }),
      });
      const payload = (await response.json()) as {
        data?: { record?: { consentId: string } };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(payload.error?.message || "送出失敗");
      setStatus(`簽署完成，紀錄編號：${payload.data?.record?.consentId ?? "已建立"}`);
      setSignatureDataUrl("");
      setConfirmed(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "同意書送出失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4 pb-24 lg:grid-cols-[20rem_1fr] lg:pb-0">
      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">電子同意書簽署</h1>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          個資同意書交由長者在訪員手機簽署；兩份保密同意書由訪員本人簽署。
        </p>
        <div className="mt-4 grid gap-2">
          {electronicConsentTemplates.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`min-h-14 rounded-lg border p-3 text-left text-sm font-medium ${
                item.id === templateId ? "border-primary bg-primary/10 text-primary" : "bg-background"
              }`}
              onClick={() => changeTemplate(item.id as ElectronicConsentTemplateId)}
            >
              {item.name}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <p className="text-sm font-medium text-primary">{template.version}</p>
        <h2 className="mt-1 text-xl font-semibold">{template.name}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{template.retentionNote}</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label={isPersonal ? "長者／立書人姓名" : "訪員姓名"}>
            <input
              className="h-12 w-full rounded-md border bg-background px-3 text-base"
              value={signerName}
              onChange={(event) => setSignerName(event.target.value)}
            />
          </Field>
          <Field label="關聯案號（個資同意書建議填寫）">
            <input
              className="h-12 w-full rounded-md border bg-background px-3 text-base"
              value={caseId}
              onChange={(event) => setCaseId(event.target.value)}
              placeholder="例如 EV-115-0001"
            />
          </Field>
          <Field label="派案／訪視編號">
            <input
              className="h-12 w-full rounded-md border bg-background px-3 text-base"
              value={scheduleId}
              onChange={(event) => setScheduleId(event.target.value)}
              placeholder="選填"
            />
          </Field>
          {!isPersonal && (
            <>
              <Field label="身分">
                <select
                  className="h-12 w-full rounded-md border bg-background px-3 text-base"
                  value={identityType}
                  onChange={(event) => setIdentityType(event.target.value)}
                >
                  <option value="">請選擇</option>
                  {identityOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </Field>
              <Field label="身分證字號">
                <input
                  className="h-12 w-full rounded-md border bg-background px-3 text-base"
                  value={nationalId}
                  onChange={(event) => setNationalId(event.target.value)}
                  autoCapitalize="characters"
                />
              </Field>
              <Field label="聯絡電話">
                <input
                  className="h-12 w-full rounded-md border bg-background px-3 text-base"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  inputMode="tel"
                />
              </Field>
            </>
          )}
        </div>

        <div className="mt-5 rounded-lg border bg-background p-4 text-sm leading-7">
          {isPersonal ? (
            <>
              <p>本人已知悉蒐集目的、資料類型、利用期間、地區、對象及方式，並同意於本聲明範圍內蒐集、處理及利用個人資料。</p>
              <label className="mt-3 flex min-h-12 items-center gap-3">
                <input
                  type="checkbox"
                  className="h-6 w-6"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                我已閱讀並同意個資蒐集與使用
              </label>
              <label className="mt-3 block">
                健康資料庫串聯分析：
                <select
                  className="ml-2 h-11 rounded-md border bg-card px-3"
                  value={healthLinkConsent}
                  onChange={(event) => setHealthLinkConsent(event.target.value as "同意" | "不同意")}
                >
                  <option>不同意</option>
                  <option>同意</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <p>本人承諾不得洩露、複製、轉讓、再使用或交付因訪查工作接觸之個人資料，離任後亦同。</p>
              <label className="mt-3 flex min-h-12 items-center gap-3">
                <input
                  type="checkbox"
                  className="h-6 w-6"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                我已閱讀並同意遵守全部保密事項
              </label>
            </>
          )}
        </div>

        <SignaturePad value={signatureDataUrl} onChange={setSignatureDataUrl} />
        {status && (
          <p className={`mt-4 rounded-md p-3 text-sm ${status.startsWith("簽署完成") ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
            {status.startsWith("簽署完成") && <CheckCircle2 className="mr-2 inline h-4 w-4" />}
            {status}
          </p>
        )}
        <Button
          className="mt-4 min-h-12 w-full text-base"
          type="button"
          disabled={submitting}
          onClick={() => void submit()}
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          確認並送出電子同意書
        </Button>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
