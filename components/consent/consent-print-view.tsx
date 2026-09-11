"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { PrintButton } from "@/components/badges/print-button";
import {
  getElectronicConsentTemplate,
  type ElectronicConsentRecord,
} from "@/lib/domain/consent";

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

  const template = getElectronicConsentTemplate(record.templateId);
  const fieldEntries = template.sections
    .flatMap((section) => section.fields)
    .filter((field) => field.type !== "signature" && field.key !== "signed_date")
    .map((field) => [field.label, record.fieldValues[field.key]] as const)
    .filter(([, value]) => value !== undefined && value !== "");

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-950 print:bg-white print:p-0">
      <style>{`
        @page { size: A4; margin: 16mm; }
        @media print {
          .print-toolbar { display: none !important; }
          .consent-sheet { box-shadow: none !important; margin: 0; padding: 0 !important; }
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
      <article className="consent-sheet mx-auto max-w-3xl rounded-xl bg-white p-10 shadow-sm">
        {record.isTest && (
          <p className="mb-4 inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900">
            TEST 測試資料
          </p>
        )}
        <h1 className="text-center text-2xl font-bold">{record.title}</h1>
        <p className="mt-2 text-center text-sm text-slate-500">版本：{record.templateVersion}</p>
        <section className="mt-8 space-y-5 text-base leading-8">
          {template.sections.map((section) => (
            <div key={section.title}>
              <h2 className="font-bold">{section.title}</h2>
              <p>{section.purpose}</p>
            </div>
          ))}
          <p>
            本人已閱讀並理解上述聲明，確認所填資料屬實，並依下列勾選結果簽署本同意書。
          </p>
        </section>
        <dl className="mt-8 grid grid-cols-[9rem_1fr] border text-sm">
          <dt className="border-b border-r bg-slate-50 p-3 font-medium">簽署人</dt>
          <dd className="border-b p-3">{record.signerName}</dd>
          <dt className="border-b border-r bg-slate-50 p-3 font-medium">簽署身分</dt>
          <dd className="border-b p-3">{record.signerRole === "elder" ? "長者／立書人" : "訪員"}</dd>
          {fieldEntries.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="border-b border-r bg-slate-50 p-3 font-medium">{label}</dt>
              <dd className="border-b p-3">{String(value)}</dd>
            </div>
          ))}
          <dt className="border-r bg-slate-50 p-3 font-medium">關聯資料</dt>
          <dd className="p-3">{record.caseId || record.scheduleId || record.externalRef || "無"}</dd>
        </dl>
        <section className="mt-10 grid grid-cols-[8rem_1fr] items-end gap-4">
          <p className="font-medium">簽名：</p>
          {record.signatureDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={record.signatureDataUrl}
              alt={`${record.signerName}簽名`}
              className="h-28 w-full max-w-md border-b object-contain object-left-bottom"
            />
          ) : (
            <p className="border-b pb-3 text-slate-500">簽名檔案無法載入</p>
          )}
          <p className="font-medium">簽署日期：</p>
          <p className="border-b pb-2">
            {new Intl.DateTimeFormat("zh-TW", {
              dateStyle: "long",
              timeZone: "Asia/Taipei",
            }).format(new Date(record.signedAt))}
          </p>
        </section>
        <footer className="mt-12 border-t pt-3 text-xs text-slate-500">
          紀錄編號：{record.consentId} · 簽名圖檔保存在受限 Drive，未公開分享。
        </footer>
      </article>
    </main>
  );
}
