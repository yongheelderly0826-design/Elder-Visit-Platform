"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, FileCheck2, Loader2, Printer, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  consentRecords,
  consentScopeLabels,
  electronicConsentTemplates,
  getConsentGovernanceSummary,
  type ElectronicConsentRecord,
} from "@/lib/domain/consent";

const sourceLabels = {
  visit_form: "訪查表",
  paper_import: "紙本匯入",
  guardian_upload: "家屬上傳",
};

export function ConsentDashboard() {
  const summary = getConsentGovernanceSummary();

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold">同意治理</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          管理同意範圍、撤回狀態與匯出用途，避免個資被用在未授權情境。
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <SummaryCard label="同意書總數" value={summary.total} />
          <SummaryCard label="有效同意" value={summary.active} />
          <SummaryCard label="已撤回" value={summary.revoked} />
          <SummaryCard label="30 日內到期" value={summary.expiringSoon} />
        </div>
      </section>

      <ElectronicConsentRecords />

      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <FileCheck2 className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">同意書清冊</h2>
        </div>
        <div className="mt-4 overflow-x-auto rounded-md border">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="bg-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">案號</th>
                <th className="px-3 py-2 font-medium">姓名</th>
                <th className="px-3 py-2 font-medium">狀態</th>
                <th className="px-3 py-2 font-medium">授權用途</th>
                <th className="px-3 py-2 font-medium">到期日</th>
                <th className="px-3 py-2 font-medium">來源</th>
              </tr>
            </thead>
            <tbody>
              {consentRecords.map((record) => (
                <tr key={record.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{record.caseCode}</td>
                  <td className="px-3 py-2">{record.elderName}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        record.signed && !record.revoked
                          ? "text-emerald-700"
                          : "text-destructive"
                      }
                    >
                      {record.revoked ? "已撤回" : record.signed ? "有效" : "缺簽"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {record.scopes.length > 0
                      ? record.scopes.map((scope) => consentScopeLabels[scope]).join("、")
                      : "未授權"}
                  </td>
                  <td className="px-3 py-2">{record.expiryDate ?? "未設定"}</td>
                  <td className="px-3 py-2">{sourceLabels[record.source]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <TriangleAlert className="h-5 w-5 text-amber-600" />
          <h2 className="text-base font-semibold">匯出規則</h2>
        </div>
        <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
          <p>政府成果回報與單位內部服務可保留必要識別欄位。</p>
          <p>匿名 KPI、研究分析、贊助揭露會自動遮罩姓名等可識別欄位。</p>
          <p>已撤回、缺簽或過期的資料不可進入可識別資料匯出。</p>
          <p>用途未涵蓋時會留下治理提醒，後續可串接主管覆核流程。</p>
        </div>
      </section>
    </div>
  );
}

function ElectronicConsentRecords() {
  const [records, setRecords] = useState<ElectronicConsentRecord[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const query = filter === "all" ? "" : `?templateId=${encodeURIComponent(filter)}`;
    setLoading(true);
    fetch(`/api/consent${query}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: { records?: ElectronicConsentRecord[] };
          error?: { message?: string };
        };
        if (!response.ok) throw new Error(payload.error?.message || "讀取失敗");
        setRecords(payload.data?.records ?? []);
        setError("");
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string }).name !== "AbortError") {
          setError(reason instanceof Error ? reason.message : "讀取電子簽署紀錄失敗");
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [filter]);

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">電子簽署紀錄</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            簽名圖由受權 API 從私人 Drive 檔案載入，可查看後套印紙本。
          </p>
        </div>
        <label className="grid gap-1 text-xs text-muted-foreground">
          表單篩選
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm text-foreground"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">全部三張同意書</option>
            {electronicConsentTemplates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
        </label>
      </div>

      {loading && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />讀取簽署紀錄中
        </p>
      )}
      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!loading && !error && records.length === 0 && (
        <p className="mt-4 rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
          尚無符合條件的電子簽署紀錄。
        </p>
      )}
      {records.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-md border">
          <table className="w-full min-w-[62rem] text-left text-sm">
            <thead className="bg-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">簽名</th>
                <th className="px-3 py-2 font-medium">表單</th>
                <th className="px-3 py-2 font-medium">簽署人</th>
                <th className="px-3 py-2 font-medium">關聯案號</th>
                <th className="px-3 py-2 font-medium">簽署時間</th>
                <th className="px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.consentId} className="border-t align-middle">
                  <td className="px-3 py-2">
                    {record.signatureDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={record.signatureDataUrl}
                        alt={`${record.signerName}的簽名`}
                        className="h-14 w-28 rounded border bg-white object-contain"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">無預覽</span>
                    )}
                  </td>
                  <td className="max-w-64 px-3 py-2">
                    <p className="font-medium">{record.title}</p>
                    {record.isTest && (
                      <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                        TEST
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <p>{record.signerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {record.signerRole === "elder" ? "長者" : "訪員"} · {record.visitorId}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    {record.caseId || record.scheduleId || record.externalRef || "未填"}
                  </td>
                  <td className="px-3 py-2">
                    {new Intl.DateTimeFormat("zh-TW", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Taipei",
                    }).format(new Date(record.signedAt))}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Link
                        href={`/manager/consent/${encodeURIComponent(record.consentId)}/print`}
                        className="inline-flex h-9 items-center gap-1 rounded-md border px-3 font-medium"
                      >
                        <Eye className="h-4 w-4" />查看
                      </Link>
                      <Link
                        href={`/manager/consent/${encodeURIComponent(record.consentId)}/print?print=1`}
                        className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 font-medium text-primary-foreground"
                      >
                        <Printer className="h-4 w-4" />列印
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
