"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck2,
  ChevronDown,
  FileSpreadsheet,
  FileUser,
  MapPin,
  Phone,
  Search,
  ShieldAlert,
  UserCheck2,
} from "lucide-react";
import { useCan } from "@/components/auth/permission-provider";
import { ImportPreviewTool } from "@/components/import/import-preview-tool";
import { Button } from "@/components/ui/button";
import { getCaseStatusLabel } from "@/lib/domain/cases";
import type { CaseStatusResult, ElderCase } from "@/lib/domain/types";

type CaseRegistryItem = ElderCase & {
  visitCount: number;
  latestVisitDate: string | null;
  latestAssignmentReason: string;
};

type CaseRegistryPayload = {
  summary: {
    total: number;
    highRisk: number;
    pending: number;
    assigned: number;
    closed: number;
  };
  cases: CaseRegistryItem[];
};

export function CaseRegistryDashboard() {
  const canUpdateCases = useCan("cases.update");
  const canImportCases = useCan("cases.import");
  const [payload, setPayload] = useState<CaseRegistryPayload | null>(null);
  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<ElderCase["riskLevel"] | "all">("all");
  const [result, setResult] = useState<CaseStatusResult | null>(null);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    void loadCases();
  }, []);

  const filteredCases = useMemo(() => {
    const cases = payload?.cases ?? [];
    return cases.filter((elderCase) => {
      const matchedQuery =
        elderCase.name.includes(query) ||
        elderCase.caseCode.toLowerCase().includes(query.toLowerCase()) ||
        elderCase.address.includes(query);
      const matchedRisk = riskFilter === "all" || elderCase.riskLevel === riskFilter;

      return matchedQuery && matchedRisk;
    });
  }, [payload, query, riskFilter]);

  async function loadCases() {
    const response = await fetch("/api/cases");
    const json = (await response.json()) as { data?: CaseRegistryPayload };
    setPayload(json.data ?? null);
  }

  async function updateStatus(caseId: string, status: ElderCase["status"]) {
    const response = await fetch("/api/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ caseId, status, note: "名冊頁快速更新" }),
    });
    const json = (await response.json()) as { data?: CaseStatusResult };
    setResult(json.data ?? null);
  }

  return (
    <div className="grid gap-4">
      <section className="grid gap-4 rounded-lg border bg-card p-4 xl:grid-cols-[1fr_22rem]">
        <div>
          <div className="flex items-center gap-2">
            <FileUser className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold">個案名冊</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            管理獨居長者基本資料、風險等級、派案狀態與結案標記。
          </p>

          {payload && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <SummaryCard label="總筆數" value={payload.summary.total} />
              <SummaryCard label="高風險" value={payload.summary.highRisk} tone="danger" />
              <SummaryCard label="待派案" value={payload.summary.pending} tone="warning" />
              <SummaryCard label="已派案" value={payload.summary.assigned} />
              <SummaryCard label="已結案" value={payload.summary.closed} tone="muted" />
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button disabled={!canImportCases} onClick={() => setShowImport((current) => !current)}>
              <FileSpreadsheet className="h-4 w-4" />
              名冊匯入
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showImport ? "rotate-180" : ""}`}
              />
            </Button>
            {!canImportCases && (
              <p className="self-center text-sm text-muted-foreground">
                目前角色沒有名冊匯入權限。
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-background p-3">
          <h2 className="text-sm font-semibold">快速篩選</h2>
          <div className="mt-3 grid gap-3">
            <label className="text-sm font-medium">
              搜尋
              <div className="mt-2 flex h-10 items-center gap-2 rounded-md border bg-card px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  className="w-full bg-transparent text-sm outline-none"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="姓名、案號或地址"
                />
              </div>
            </label>
            <label className="text-sm font-medium">
              風險等級
              <select
                className="mt-2 h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={riskFilter}
                onChange={(event) =>
                  setRiskFilter(event.target.value as ElderCase["riskLevel"] | "all")
                }
              >
                <option value="all">全部</option>
                <option value="high">高風險</option>
                <option value="medium">中風險</option>
                <option value="low">低風險</option>
              </select>
            </label>
            <div className="rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">
              目前顯示 <span className="font-semibold text-foreground">{filteredCases.length}</span> 筆
            </div>
          </div>
        </div>
      </section>

      {showImport && canImportCases && (
        <section className="rounded-lg border bg-card p-4">
          <div className="mb-4">
            <p className="text-sm font-medium text-primary">名冊管理內建功能</p>
            <h2 className="mt-1 text-lg font-semibold">匯入名冊</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              匯入屬於名冊維護流程；先檢查欄位對應與前幾筆資料，確認後再寫入名冊。
            </p>
          </div>
          <ImportPreviewTool compact />
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {filteredCases.map((elderCase) => (
          <article key={elderCase.id} className="rounded-lg border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold">{elderCase.name}</h2>
                <p className="mt-1 truncate text-sm text-muted-foreground">{elderCase.caseCode}</p>
              </div>
              <RiskBadge riskLevel={elderCase.riskLevel} />
            </div>

            <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
              <CaseInfo icon={UserCheck2} value={`${elderCase.age} 歲 · ${elderCase.district}`} />
              <CaseInfo icon={Phone} value={elderCase.phone} />
              <CaseInfo icon={MapPin} value={elderCase.address} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <MiniStat label="訪查" value={`${elderCase.visitCount} 次`} />
              <MiniStat label="狀態" value={getCaseStatusLabel(elderCase.status)} />
            </div>

            <div className="mt-3 rounded-md bg-secondary p-3 text-sm">
              <div className="flex gap-2">
                <CalendarCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="line-clamp-2 text-muted-foreground">
                  {elderCase.latestAssignmentReason}
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/manager/care-forms?caseId=${encodeURIComponent(elderCase.id)}`}>
                    代填關懷表
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canUpdateCases}
                  onClick={() => updateStatus(elderCase.id, "auditing")}
                >
                  送稽核
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canUpdateCases}
                  onClick={() => updateStatus(elderCase.id, "closed")}
                >
                  結案
                </Button>
              </div>
              {!canUpdateCases && (
                <p className="mt-2 text-xs text-muted-foreground">
                  目前角色沒有修改名冊狀態權限。
                </p>
              )}
            </div>
          </article>
        ))}
      </section>

      {result && (
        <section className="rounded-lg border bg-card p-4">
          <p className="font-semibold">{result.message}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            更新時間：{new Date(result.updatedAt).toLocaleString("zh-TW")}
          </p>
        </section>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "danger" | "warning" | "muted";
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        tone === "danger"
          ? "bg-destructive/10"
          : tone === "warning"
            ? "bg-accent/10"
            : tone === "muted"
              ? "bg-secondary"
              : "bg-background"
      }`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function CaseInfo({ icon: Icon, value }: { icon: typeof Phone; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <span className="truncate">{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-2 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold">{value}</p>
    </div>
  );
}

function RiskBadge({ riskLevel }: { riskLevel: ElderCase["riskLevel"] }) {
  const label = riskLevel === "high" ? "高風險" : riskLevel === "medium" ? "中風險" : "低風險";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
        riskLevel === "high"
          ? "bg-destructive text-destructive-foreground"
          : riskLevel === "medium"
            ? "bg-accent text-accent-foreground"
            : "bg-secondary text-secondary-foreground"
      }`}
    >
      {riskLevel === "high" && <ShieldAlert className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}
