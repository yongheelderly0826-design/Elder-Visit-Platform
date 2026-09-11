"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { PrintButton } from "@/components/badges/print-button";
import {
  type ElectronicConsentRecord,
} from "@/lib/domain/consent";
import {
  formatRocDate,
  getConsentDocument,
} from "@/lib/domain/consent-documents";

export function ConsentPrintView({ consentId, autoPrint }: { consentId: string; autoPrint: boolean }) {
  const [record, setRecord] = useState<ElectronicConsentRecord | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/consent?id=${encodeURIComponent(consentId)}`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: { records?: ElectronicConsentRecord[] };
          error?: { message?: string };
        };
        if (!response.ok) throw new Error(payload.error?.message || "讀取失敗");
        const next = payload.data?.records?.[0];
        if (!next) throw new Error("找不到電子同意書");
        setRecord(next);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "讀取失敗"));
  }, [consentId]);

  useEffect(() => {
    if (!record || !autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, [autoPrint, record]);

  if (error) {
    return <main className="p-8 text-center text-red-700">{error}</main>;
  }
  if (!record) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-2 text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" />載入同意書
      </main>
    );
  }

  const document = getConsentDocument(record.templateId);
  const rocDate = formatRocDate(record.signedAt);

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 print:bg-white print:p-0">
      <style>{`
        @page { size: A4; margin: 13mm 15mm; }
        @media print {
          .print-toolbar { display: none !important; }
          .consent-sheet { box-shadow: none !important; border: 0 !important; margin: 0; padding: 0 !important; }
          body { background: white !important; }
        }
      `}</style>
      <div className="print-toolbar mx-auto mb-4 flex max-w-3xl items-center justify-between rounded-lg border bg-white p-3">
        <div>
          <p className="font-semibold">電子同意書查看／列印</p>
          <Link href="/manager/consent" className="text-sm text-emerald-700">返回同意治理</Link>
        </div>
        <PrintButton />
      </div>
      <article className="consent-sheet mx-auto max-w-[210mm] border-2 border-slate-900 bg-white px-10 py-8 font-serif shadow-sm">
        {record.isTest && (
          <p className="mb-3 inline-flex rounded-full bg-amber-100 px-3 py-1 font-sans text-sm font-bold text-amber-900 print:border print:border-slate-900 print:bg-white">
            TEST 測試資料
          </p>
        )}
        <p className="text-right text-lg font-bold">新北市政府</p>
        <h1 className="mt-1 text-center text-2xl font-bold">{document.title}</h1>
        {document.kind === "personal_data" ? (
          <PersonalDataDocument record={record} rocDate={rocDate} />
        ) : (
          <ConfidentialityDocument record={record} rocDate={rocDate} />
        )}
        <footer className="mt-5 border-t pt-2 font-sans text-[10px] text-slate-500 print:text-slate-900">
          紀錄編號：{record.consentId}　版本：{record.templateVersion}
          {record.isTest ? "　TEST（不進正式匯出／核銷）" : ""}
        </footer>
      </article>
    </main>
  );
}

function Clauses({ clauses }: { clauses: string[] }) {
  const numbers = ["一", "二", "三", "四", "五", "六"];
  return (
    <ol className="mt-3 space-y-2 text-[15px] leading-7">
      {clauses.map((clause, index) => (
        <li key={clause} className="flex gap-2">
          <span className="shrink-0">{numbers[index]}、</span>
          <span>{clause}</span>
        </li>
      ))}
    </ol>
  );
}

function Choice({ checked, label }: { checked: boolean; label: string }) {
  return <span className="whitespace-nowrap">{checked ? "☑" : "☐"}{label}</span>;
}

function SignatureImage({ record }: { record: ElectronicConsentRecord }) {
  return record.signatureDataUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={record.signatureDataUrl}
      alt={`${record.signerName}簽名`}
      className="inline-block h-20 w-64 border-b border-slate-900 object-contain object-left-bottom align-bottom"
    />
  ) : (
    <span className="inline-block h-16 w-64 border-b border-slate-900 align-bottom text-sm text-slate-500">
      簽名檔案無法載入
    </span>
  );
}

function RocDateLine({ rocDate }: { rocDate: ReturnType<typeof formatRocDate> }) {
  return (
    <p className="mt-3 text-center text-lg">
      中華民國　{rocDate.year}　年　{rocDate.month}　月　{rocDate.day}　日
    </p>
  );
}

function PersonalDataDocument({
  record,
  rocDate,
}: {
  record: ElectronicConsentRecord;
  rocDate: ReturnType<typeof formatRocDate>;
}) {
  const document = getConsentDocument("gov_personal_data_consent_115");
  if (document.kind !== "personal_data") return null;
  const personalChoice = String(record.fieldValues.personal_data_use_consent ?? "");
  const healthChoice = String(record.fieldValues.health_database_link_consent ?? "");
  return (
    <>
      <Clauses clauses={document.clauses} />
      <p className="mt-3 text-[15px] leading-7">
        我已詳閱本同意書，{" "}
        <Choice checked={personalChoice === "同意"} label="同意" />{" "}
        <Choice checked={personalChoice === "不同意"} label="不同意" />
        個人資料於上開範圍內使用。
      </p>
      <h2 className="mt-4 text-lg font-bold">{document.healthSectionTitle}</h2>
      <p className="mt-2 text-[15px] leading-7">
        我 <Choice checked={healthChoice === "同意"} label="同意" />{" "}
        <Choice checked={healthChoice === "不同意"} label="不同意" />
        {document.healthStatement}
      </p>
      <p className="mt-4 text-lg">
        立書人：<SignatureImage record={record} />
        <span className="ml-2 text-sm">（須本人簽名、蓋章或手印）</span>
      </p>
      <RocDateLine rocDate={rocDate} />
    </>
  );
}

function ConfidentialityDocument({
  record,
  rocDate,
}: {
  record: ElectronicConsentRecord;
  rocDate: ReturnType<typeof formatRocDate>;
}) {
  const document = getConsentDocument(record.templateId);
  if (document.kind !== "confidentiality") return null;
  const identity = String(record.fieldValues.identity_type ?? "");
  return (
    <>
      <p className="mt-4 text-[16px] leading-8">
        立同意書人 <span className="inline-block min-w-40 border-b text-center">{record.signerName}</span>
        同意於參與○○縣／市辦理「擴大獨居老人服務計畫」期間，遵守以下事項：
      </p>
      <Clauses clauses={document.clauses} />
      <div className="mt-6 space-y-3 text-lg leading-8">
        <p>立同意書人：<SignatureImage record={record} /></p>
        <p>
          身分：
          {document.identityOptions.map((option) => (
            <span key={option} className="mr-3"><Choice checked={identity === option} label={option} /></span>
          ))}
        </p>
        <p>身分證字號：<span className="inline-block min-w-64 border-b px-2">{String(record.fieldValues.national_id ?? "")}</span></p>
        <p>聯絡電話：<span className="inline-block min-w-64 border-b px-2">{String(record.fieldValues.phone ?? "")}</span></p>
      </div>
      <RocDateLine rocDate={rocDate} />
    </>
  );
}
