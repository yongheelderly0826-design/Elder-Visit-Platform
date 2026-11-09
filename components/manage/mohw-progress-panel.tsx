"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Info } from "lucide-react";
import { PageIntro } from "@/components/ui/page-intro";
import { Button } from "@/components/ui/button";
import { deskVisitorColumnSide } from "@/lib/domain/desk-care-batch";
import type { DeskVisitorOption } from "@/lib/domain/manager-care-form-desk";
import { formatDeskCasePaperLabel } from "@/lib/domain/manager-care-form-desk";
import {
  formatYongheVillageSelectLabel,
  type DeskScope,
} from "@/lib/domain/village-admins";
import {
  MOHW_PROGRESS_AUDIT_SUPERVISORS,
  MOHW_PROGRESS_OUTCOMES,
  summarizeCaseOutcomes,
  type MohwProgressAuditSupervisor,
  type MohwProgressCaseRow,
  type MohwProgressCaseTab,
  type MohwProgressOutcome,
} from "@/lib/domain/mohw-progress";

type OptionsPayload = {
  scope?: DeskScope;
  villages: string[];
  villageCodeByName?: Record<string, string>;
  visitors?: DeskVisitorOption[];
  rosterTotal?: number | null;
  keyedCount?: number | null;
  directCount?: number | null;
  excludedWithCareform?: number | null;
  contextWarning?: string | null;
  casesKeyed?: MohwProgressCaseRow[];
  casesDirectMohw?: MohwProgressCaseRow[];
  cases?: MohwProgressCaseRow[];
  reporter?: { name: string; email: string };
};

type FilterKey = "all" | "unset" | MohwProgressOutcome;

function visitorLabel(visitor: DeskVisitorOption) {
  const title = visitor.jobTitle?.trim();
  return title ? `${visitor.name}（${title}）` : visitor.name;
}

function sortByPaperSeq(rows: MohwProgressCaseRow[]) {
  return [...rows].sort((a, b) => {
    const aSeq = a.village_seq ?? Number.POSITIVE_INFINITY;
    const bSeq = b.village_seq ?? Number.POSITIVE_INFINITY;
    if (aSeq !== bSeq) return aSeq - bSeq;
    return String(a.name || "").localeCompare(String(b.name || ""), "zh-Hant");
  });
}

function staffLine(row: MohwProgressCaseRow) {
  const civil = row.civil_worker_name?.trim() || "";
  const social = row.social_worker_name?.trim() || "";
  return [civil ? `民政 ${civil}` : "", social ? `社政 ${social}` : ""].filter(Boolean);
}

function metaLine(row: MohwProgressCaseRow) {
  const keyed = row.keyed_by_name?.trim() || "—";
  const audit =
    (row.audit_supervisors ?? []).map((item) => item.trim()).filter(Boolean).join("、") || "—";
  const status = row.careform_status?.trim();
  return `訪查 ${staffLine(row).join("／") || "—"} · 建檔 ${keyed} · 稽核 ${audit}${
    status ? ` · ${status}` : ""
  }`;
}

export function MohwProgressPanel() {
  const [options, setOptions] = useState<OptionsPayload | null>(null);
  const [village, setVillage] = useState("");
  const [casesKeyed, setCasesKeyed] = useState<MohwProgressCaseRow[]>([]);
  const [casesDirect, setCasesDirect] = useState<MohwProgressCaseRow[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, MohwProgressOutcome | "">>({});
  const [caseTab, setCaseTab] = useState<MohwProgressCaseTab>("direct");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState("");
  const [civilVisitorId, setCivilVisitorId] = useState("");
  const [socialVisitorId, setSocialVisitorId] = useState("");
  const [keyedById, setKeyedById] = useState("");
  const [auditSupervisors, setAuditSupervisors] = useState<MohwProgressAuditSupervisor[]>([
    ...MOHW_PROGRESS_AUDIT_SUPERVISORS,
  ]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingCases, setLoadingCases] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [contextWarning, setContextWarning] = useState<string | null>(null);
  const [rosterTotal, setRosterTotal] = useState<number | null>(null);
  const [keyedCount, setKeyedCount] = useState<number | null>(null);
  const [directCount, setDirectCount] = useState<number | null>(null);

  async function loadOptions(selectedVillage?: string) {
    if (selectedVillage) setLoadingCases(true);
    else setLoading(true);
    setMessage(null);
    try {
      const q = selectedVillage ? `?village=${encodeURIComponent(selectedVillage)}` : "";
      const response = await fetch(`/api/desk/mohw-progress/options${q}`);
      const json = (await response.json()) as {
        data?: OptionsPayload;
        error?: { message?: string };
      };
      if (!response.ok) {
        setMessage(json.error?.message ?? "無法載入里別");
        return;
      }
      setOptions(json.data ?? null);
      if (selectedVillage) {
        const nextKeyed = json.data?.casesKeyed ?? [];
        const nextDirect = json.data?.casesDirectMohw ?? json.data?.cases ?? [];
        setCasesKeyed(nextKeyed);
        setCasesDirect(nextDirect);
        setRosterTotal(
          typeof json.data?.rosterTotal === "number"
            ? json.data.rosterTotal
            : nextKeyed.length + nextDirect.length,
        );
        setKeyedCount(
          typeof json.data?.keyedCount === "number"
            ? json.data.keyedCount
            : typeof json.data?.excludedWithCareform === "number"
              ? json.data.excludedWithCareform
              : nextKeyed.length,
        );
        setDirectCount(
          typeof json.data?.directCount === "number" ? json.data.directCount : nextDirect.length,
        );
        setContextWarning(json.data?.contextWarning || null);
        const nextOutcomes: Record<string, MohwProgressOutcome | ""> = {};
        for (const row of nextDirect) {
          nextOutcomes[row.case_id] = row.outcome || "";
        }
        setOutcomes(nextOutcomes);
      }
    } catch {
      setMessage("無法載入資料，請稍後再試。");
    } finally {
      setLoading(false);
      setLoadingCases(false);
    }
  }

  useEffect(() => {
    void loadOptions();
  }, []);

  useEffect(() => {
    if (!village) {
      setCasesKeyed([]);
      setCasesDirect([]);
      setOutcomes({});
      setRosterTotal(null);
      setKeyedCount(null);
      setDirectCount(null);
      setContextWarning(null);
      return;
    }
    void loadOptions(village);
  }, [village]);

  const villages = options?.villages ?? [];
  const villageCodeByName = options?.villageCodeByName ?? {};
  const allVisitors = useMemo(() => options?.visitors ?? [], [options?.visitors]);

  const civilVisitors = useMemo(
    () => allVisitors.filter((item) => deskVisitorColumnSide(item) === "civil"),
    [allVisitors],
  );
  const socialVisitors = useMemo(
    () => allVisitors.filter((item) => deskVisitorColumnSide(item) === "social"),
    [allVisitors],
  );

  const selectedCivil = civilVisitors.find((item) => item.id === civilVisitorId) ?? null;
  const selectedSocial = socialVisitors.find((item) => item.id === socialVisitorId) ?? null;
  const selectedKeyedBy = allVisitors.find((item) => item.id === keyedById) ?? null;
  /** 與 KEY 單相同：先里別、再訪員，才能看／勾個案 */
  const canBrowseCases = Boolean(village && (selectedCivil || selectedSocial));

  function toggleAuditSupervisor(name: MohwProgressAuditSupervisor) {
    setAuditSupervisors((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );
  }

  useEffect(() => {
    const reporterName = options?.reporter?.name?.trim();
    if (!reporterName || !allVisitors.length) return;
    if (civilVisitorId || socialVisitorId) return;
    const match = allVisitors.find((item) => item.name.trim() === reporterName);
    if (!match) return;
    if (deskVisitorColumnSide(match) === "social") setSocialVisitorId(match.id);
    else setCivilVisitorId(match.id);
  }, [options?.reporter?.name, allVisitors, civilVisitorId, socialVisitorId]);

  const summary = useMemo(
    () => summarizeCaseOutcomes(Object.values(outcomes)),
    [outcomes],
  );

  const sortedKeyed = useMemo(() => sortByPaperSeq(casesKeyed), [casesKeyed]);
  const sortedDirect = useMemo(() => sortByPaperSeq(casesDirect), [casesDirect]);

  const filteredKeyed = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedKeyed;
    return sortedKeyed.filter((row) => {
      const hay = [
        row.village_seq ?? "",
        row.name,
        row.encoded_id,
        row.civil_worker_name,
        row.social_worker_name,
        row.keyed_by_name,
        row.careform_status,
        ...(row.audit_supervisors ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sortedKeyed, query]);

  const filteredDirect = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortedDirect.filter((row) => {
      const current = outcomes[row.case_id] || "";
      if (filter === "unset" && current) return false;
      if (filter !== "all" && filter !== "unset" && current !== filter) return false;
      if (!q) return true;
      const hay = [
        row.village_seq ?? "",
        row.name,
        row.encoded_id,
        row.civil_worker_name,
        row.social_worker_name,
        row.keyed_by_name,
        ...(row.audit_supervisors ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sortedDirect, outcomes, filter, query]);

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const row of casesDirect) {
      const current = outcomes[row.case_id] || "";
      const original = row.outcome || "";
      if (current && current !== original) n += 1;
      else if (current && !original) n += 1;
    }
    return n;
  }, [casesDirect, outcomes]);

  const selectedForSubmit = useMemo(() => {
    return casesDirect
      .map((row) => {
        const outcome = outcomes[row.case_id] || "";
        if (!outcome) return null;
        const original = row.outcome || "";
        return {
          case_id: row.case_id,
          encoded_id: row.encoded_id,
          outcome,
          changed: outcome !== original,
        };
      })
      .filter(Boolean) as Array<{
      case_id: string;
      encoded_id: string;
      outcome: MohwProgressOutcome;
      changed: boolean;
    }>;
  }, [casesDirect, outcomes]);

  function setOutcome(caseId: string, value: MohwProgressOutcome | "") {
    setOutcomes((prev) => ({ ...prev, [caseId]: value }));
  }

  function applyFilterBulk(outcome: MohwProgressOutcome) {
    setOutcomes((prev) => {
      const next = { ...prev };
      for (const row of filteredDirect) {
        next[row.case_id] = outcome;
      }
      return next;
    });
  }

  async function submit() {
    const items = selectedForSubmit.map(({ case_id, encoded_id, outcome }) => ({
      case_id,
      encoded_id,
      outcome,
    }));
    if (!items.length) {
      setMessage("請先勾選至少一筆個案狀態。");
      return;
    }
    if (!selectedCivil && !selectedSocial) {
      setMessage("請先從上方下拉選擇民政或社政訪查員。");
      return;
    }
    if (!selectedKeyedBy) {
      setMessage("請選擇建檔人員。");
      return;
    }
    if (!auditSupervisors.length) {
      setMessage("請至少勾選一位稽核督導（沈煒庭／課長）。");
      return;
    }
    setBusy(true);
    setMessage(null);
    setWarnings([]);
    try {
      const response = await fetch("/api/desk/mohw-progress/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          villageName: village,
          villageCode: villageCodeByName[village] || "",
          items,
          notes,
          civilWorkerId: selectedCivil?.id || "",
          civilWorkerName: selectedCivil?.name || "",
          socialWorkerId: selectedSocial?.id || "",
          socialWorkerName: selectedSocial?.name || "",
          keyedById: selectedKeyedBy.id,
          keyedByName: selectedKeyedBy.name,
          auditSupervisors,
        }),
      });
      const json = (await response.json()) as {
        data?: { warnings?: string[]; report?: { report_id?: string }; marks_written?: number };
        error?: { message?: string };
      };
      if (!response.ok) {
        setMessage(json.error?.message ?? "送出失敗");
        return;
      }
      setWarnings(json.data?.warnings ?? []);
      const reportId = json.data?.report?.report_id || "";
      setMessage(
        `已確認 ${json.data?.marks_written ?? items.length} 筆（${reportId}），將匯入里別進度儀表板。同個案以最新狀態為準。`,
      );
      setNotes("");
      await loadOptions(village);
    } catch {
      setMessage("送出失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    Boolean(village) &&
    !busy &&
    selectedForSubmit.length > 0 &&
    Boolean(selectedCivil || selectedSocial) &&
    Boolean(selectedKeyedBy) &&
    auditSupervisors.length > 0;

  const displayKeyedCount = keyedCount ?? casesKeyed.length;
  const displayDirectCount = directCount ?? casesDirect.length;
  const displayRoster =
    typeof rosterTotal === "number" ? rosterTotal : displayKeyedCount + displayDirectCount;

  return (
    <div className="space-y-4">
      <PageIntro
        icon={ClipboardCheck}
        eyebrow="獨立回報"
        title="衛福部進度回報"
        description="里別與民政／社政訪查員選好後，分「已KEY關懷表／已直KEY衛福部」兩頁籤確認；勾選狀態會匯總到各里進度儀表板。"
      />

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <div className="flex gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">勾選是為了里別進度儀表板匯總</p>
            <p className="mt-1 text-amber-900/90">
              「已KEY關懷表」已算本系統完成進度（唯讀）。「已直KEY衛福部」請勾已完成／未遇／查無此人並送出，與前者合計＝該里名冊，供
              `/manager/mohw-progress` 儀表板使用。
            </p>
          </div>
        </div>
      </div>

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <div>
          <h2 className="font-semibold">1. 里別、訪查員、建檔與稽核</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            同一橫列：里別／民政／社政／建檔人員／稽核督導。選好後展開個案。
          </p>
        </div>
        <div className="overflow-x-auto rounded-md border bg-muted/20 px-3 py-3">
          <div className="flex min-w-[52rem] flex-nowrap items-end gap-3">
            <div className="min-w-[8.5rem] flex-1">
              <label className="text-xs font-medium text-muted-foreground">里別</label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={village}
                disabled={loading}
                onChange={(event) => {
                  setVillage(event.target.value);
                  setCivilVisitorId("");
                  setSocialVisitorId("");
                  setKeyedById("");
                  setCaseTab("direct");
                  setFilter("all");
                  setQuery("");
                  setMessage(null);
                }}
              >
                <option value="">{loading ? "載入中…" : "請選擇里別"}</option>
                {villages.map((name) => (
                  <option key={name} value={name}>
                    {formatYongheVillageSelectLabel(name, villageCodeByName[name])}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[8.5rem] flex-1">
              <label className="text-xs font-medium text-muted-foreground">民政訪查員</label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={civilVisitorId}
                onChange={(event) => setCivilVisitorId(event.target.value)}
                disabled={busy || loading || !village}
              >
                <option value="">{village ? "請選擇民政訪查員" : "請先選里別"}</option>
                {civilVisitors.map((visitor) => (
                  <option key={visitor.id} value={visitor.id}>
                    {visitorLabel(visitor)}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[8.5rem] flex-1">
              <label className="text-xs font-medium text-muted-foreground">社政訪查員</label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={socialVisitorId}
                onChange={(event) => setSocialVisitorId(event.target.value)}
                disabled={busy || loading || !village}
              >
                <option value="">{village ? "請選擇社政訪查員" : "請先選里別"}</option>
                {socialVisitors.map((visitor) => (
                  <option key={visitor.id} value={visitor.id}>
                    {visitorLabel(visitor)}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[8.5rem] flex-1">
              <label className="text-xs font-medium text-muted-foreground">建檔人員</label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={keyedById}
                onChange={(event) => setKeyedById(event.target.value)}
                disabled={busy || loading || !village}
              >
                <option value="">{village ? "請選擇建檔人員" : "請先選里別"}</option>
                {allVisitors.map((visitor) => (
                  <option key={visitor.id} value={visitor.id}>
                    {visitorLabel(visitor)}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[11rem] shrink-0">
              <label className="text-xs font-medium text-muted-foreground">稽核督導</label>
              <div className="mt-1 flex flex-nowrap gap-2">
                {MOHW_PROGRESS_AUDIT_SUPERVISORS.map((name) => {
                  const checked = auditSupervisors.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      className={`whitespace-nowrap rounded-md border px-3 py-2 text-sm ${
                        checked
                          ? "border-primary bg-primary/10 text-primary"
                          : "bg-background text-foreground"
                      }`}
                      onClick={() => toggleAuditSupervisor(name)}
                      disabled={busy}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {options?.scope?.label && (
            <p className="mt-2 text-xs text-muted-foreground">範圍：{options.scope.label}</p>
          )}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-4">
        <div>
          <h2 className="font-semibold">2. 個案狀態</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            依紙本「里編號」排序；兩頁籤合計＝該里名冊。勾選結果供儀表板匯總。
          </p>
        </div>

        {!canBrowseCases ? (
          <p className="rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">
            請先選「里別」與民政／社政訪查員；建檔人員與稽核督導請一併勾選後再送出。
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>本系統已KEY {displayKeyedCount}</span>
              <span>直KEY待回報 {displayDirectCount}</span>
              <span>名冊 {displayRoster}</span>
              {caseTab === "direct" && (
                <>
                  <span>已完成 {summary.done}</span>
                  <span>未遇 {summary.missed}</span>
                  <span>查無此人 {summary.notFound}</span>
                  <span>尚未勾選 {summary.unset}</span>
                  {dirtyCount > 0 && (
                    <span className="text-amber-800">本次變更 {dirtyCount}</span>
                  )}
                </>
              )}
            </div>

            {contextWarning && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {contextWarning}
              </p>
            )}

            <div className="flex flex-wrap gap-1 border-b pb-2">
              {(
                [
                  ["direct", `已直KEY衛福部（${displayDirectCount}）`],
                  ["keyed", `已KEY關懷表（${displayKeyedCount}）`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    caseTab === key
                      ? "border-primary bg-primary/10 text-primary"
                      : "bg-background text-foreground"
                  }`}
                  onClick={() => {
                    setCaseTab(key);
                    setFilter("all");
                    setQuery("");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm sm:max-w-xs"
                placeholder="搜尋序號／姓名／編碼"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {caseTab === "direct" && (
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ["all", "全部"],
                      ["unset", "尚未勾選"],
                      ["已完成", "已完成"],
                      ["未遇", "未遇"],
                      ["查無此人", "查無此人"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`rounded-md border px-2 py-1 text-xs ${
                        filter === key
                          ? "border-primary bg-primary/10 text-primary"
                          : "bg-background"
                      }`}
                      onClick={() => setFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {caseTab === "direct" && (
              <div className="flex flex-wrap gap-2">
                <span className="self-center text-xs text-muted-foreground">將目前列表設為：</span>
                {MOHW_PROGRESS_OUTCOMES.map((outcome) => (
                  <button
                    key={outcome}
                    type="button"
                    className="rounded-md border bg-background px-2 py-1 text-xs"
                    onClick={() => applyFilterBulk(outcome)}
                    disabled={!filteredDirect.length || busy}
                  >
                    {outcome}
                  </button>
                ))}
              </div>
            )}

            {caseTab === "keyed" ? (
              <div className="overflow-x-auto rounded-md border">
                <div className="min-w-[28rem]">
                  <div className="border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                    本平台已有關懷表（已提交／已稽核）— 唯讀，儀表板計入已完成進度
                  </div>
                  <div className="max-h-[55vh] overflow-y-auto">
                    {loadingCases ? (
                      <p className="px-3 py-6 text-sm text-muted-foreground">載入個案中…</p>
                    ) : filteredKeyed.length === 0 ? (
                      <p className="px-3 py-6 text-sm text-muted-foreground">
                        {contextWarning ? "無法載入已KEY名單。" : "此里尚無本平台已KEY關懷表。"}
                      </p>
                    ) : (
                      filteredKeyed.map((row) => {
                        const paper = formatDeskCasePaperLabel({
                          villageCode: villageCodeByName[village],
                          village,
                          villageSeq: row.village_seq,
                          name: row.name,
                          caseCode: row.encoded_id,
                        });
                        return (
                          <div
                            key={row.case_id}
                            className="border-b px-3 py-2.5 text-sm last:border-b-0"
                          >
                            <p className="truncate font-medium">{paper.primary}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {paper.secondary || row.encoded_id || row.case_id}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {metaLine(row)}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <div className="min-w-[36rem]">
                    <div className="grid grid-cols-[minmax(11rem,1.4fr)_repeat(3,minmax(4.75rem,auto))] gap-0 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                      <div>個案（直KEY衛福部）</div>
                      {MOHW_PROGRESS_OUTCOMES.map((outcome) => (
                        <div key={outcome} className="text-center">
                          {outcome}
                        </div>
                      ))}
                    </div>
                    <div className="max-h-[55vh] overflow-y-auto">
                      {loadingCases ? (
                        <p className="px-3 py-6 text-sm text-muted-foreground">載入個案中…</p>
                      ) : filteredDirect.length === 0 ? (
                        <p className="px-3 py-6 text-sm text-muted-foreground">
                          {contextWarning
                            ? "無法載入直KEY名單。"
                            : "此條件沒有需直KEY的個案（本平台已KEY者見另一頁籤）。"}
                        </p>
                      ) : (
                        filteredDirect.map((row) => {
                          const current = outcomes[row.case_id] || "";
                          const paper = formatDeskCasePaperLabel({
                            villageCode: villageCodeByName[village],
                            village,
                            villageSeq: row.village_seq,
                            name: row.name,
                            caseCode: row.encoded_id,
                          });
                          const bits = staffLine(row);
                          return (
                            <div
                              key={row.case_id}
                              className="grid grid-cols-[minmax(11rem,1.4fr)_repeat(3,minmax(4.75rem,auto))] items-center gap-0 border-b px-3 py-2.5 text-sm last:border-b-0"
                            >
                              <div className="min-w-0 pr-2">
                                <p className="truncate font-medium">{paper.primary}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {paper.secondary || row.encoded_id || row.case_id}
                                </p>
                                {bits.length > 0 && (
                                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                    {bits.join(" · ")}
                                  </p>
                                )}
                              </div>
                              {MOHW_PROGRESS_OUTCOMES.map((outcome) => {
                                const checked = current === outcome;
                                return (
                                  <label
                                    key={outcome}
                                    className="flex cursor-pointer items-center justify-center py-1"
                                  >
                                    <input
                                      type="radio"
                                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                                      name={`outcome-${row.case_id}`}
                                      checked={checked}
                                      onChange={() => setOutcome(row.case_id, outcome)}
                                      onClick={() => {
                                        if (checked) setOutcome(row.case_id, "");
                                      }}
                                    />
                                    <span className="sr-only">{outcome}</span>
                                  </label>
                                );
                              })}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">備註（選填）</label>
                  <input
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="例如：已於衛福部平台完成 KEY"
                  />
                </div>

                <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
                  {busy
                    ? "送出中…"
                    : `確認送出至儀表板（${selectedForSubmit.length} 筆已勾選）`}
                </Button>
              </>
            )}
          </>
        )}

        {message && <p className="text-sm text-foreground">{message}</p>}
        {warnings.length > 0 && (
          <ul className="space-y-1 text-sm text-amber-900">
            {warnings.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
