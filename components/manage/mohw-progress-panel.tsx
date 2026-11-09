"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Info } from "lucide-react";
import { PageIntro } from "@/components/ui/page-intro";
import { Button } from "@/components/ui/button";
import {
  formatYongheVillageSelectLabel,
  type DeskScope,
} from "@/lib/domain/village-admins";
import {
  MOHW_PROGRESS_OUTCOMES,
  summarizeCaseOutcomes,
  type MohwProgressCaseRow,
  type MohwProgressOutcome,
} from "@/lib/domain/mohw-progress";

type OptionsPayload = {
  scope?: DeskScope;
  villages: string[];
  villageCodeByName?: Record<string, string>;
  rosterTotal?: number | null;
  excludedWithCareform?: number | null;
  contextWarning?: string | null;
  cases?: MohwProgressCaseRow[];
  reporter?: { name: string; email: string };
};

type FilterKey = "all" | "unset" | MohwProgressOutcome;

function StaffMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-xs leading-snug">
      <span className="mt-0.5 shrink-0 rounded border border-border bg-muted/70 px-1.5 py-0.5 font-semibold text-foreground">
        {label}
      </span>
      <span className="min-w-0 break-words text-foreground/90">{value || "—"}</span>
    </div>
  );
}

export function MohwProgressPanel() {
  const [options, setOptions] = useState<OptionsPayload | null>(null);
  const [village, setVillage] = useState("");
  const [cases, setCases] = useState<MohwProgressCaseRow[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, MohwProgressOutcome | "">>({});
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingCases, setLoadingCases] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [contextWarning, setContextWarning] = useState<string | null>(null);
  const [rosterTotal, setRosterTotal] = useState<number | null>(null);
  const [excludedWithCareform, setExcludedWithCareform] = useState<number | null>(null);

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
        const nextCases = json.data?.cases ?? [];
        setCases(nextCases);
        setRosterTotal(
          typeof json.data?.rosterTotal === "number" ? json.data.rosterTotal : nextCases.length,
        );
        setExcludedWithCareform(
          typeof json.data?.excludedWithCareform === "number"
            ? json.data.excludedWithCareform
            : null,
        );
        setContextWarning(json.data?.contextWarning || null);
        const nextOutcomes: Record<string, MohwProgressOutcome | ""> = {};
        for (const row of nextCases) {
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
      setCases([]);
      setOutcomes({});
      setRosterTotal(null);
      setExcludedWithCareform(null);
      setContextWarning(null);
      return;
    }
    void loadOptions(village);
  }, [village]);

  const villages = options?.villages ?? [];
  const villageCodeByName = options?.villageCodeByName ?? {};

  const summary = useMemo(
    () => summarizeCaseOutcomes(Object.values(outcomes)),
    [outcomes],
  );

  const filteredCases = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cases.filter((row) => {
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
  }, [cases, outcomes, filter, query]);

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const row of cases) {
      const current = outcomes[row.case_id] || "";
      const original = row.outcome || "";
      if (current && current !== original) n += 1;
      else if (current && !original) n += 1;
    }
    return n;
  }, [cases, outcomes]);

  const selectedForSubmit = useMemo(() => {
    return cases
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
  }, [cases, outcomes]);

  function setOutcome(caseId: string, value: MohwProgressOutcome | "") {
    setOutcomes((prev) => ({ ...prev, [caseId]: value }));
  }

  function applyFilterBulk(outcome: MohwProgressOutcome) {
    setOutcomes((prev) => {
      const next = { ...prev };
      for (const row of filteredCases) {
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
        `已確認 ${json.data?.marks_written ?? items.length} 筆（${reportId}）。同個案以最新狀態為準。`,
      );
      setNotes("");
      await loadOptions(village);
    } catch {
      setMessage("送出失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = Boolean(village) && !busy && selectedForSubmit.length > 0;

  return (
    <div className="space-y-4">
      <PageIntro
        icon={ClipboardCheck}
        eyebrow="獨立回報"
        title="衛福部進度回報"
        description="僅列出尚未在本平台建立關懷表的個案。選里後勾選每筆狀態（已完成／未遇／查無此人）。此頁只統計進度，不會建立關懷表。"
      />

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <div className="flex gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">未建檔名單才在這裡 KEY</p>
            <p className="mt-1 text-amber-900/90">
              已有本平台關懷表（已提交／已稽核）的個案不會出現。寫入「MOHW進度回報／個案標記」，來源「MOHW直KEY」。同一個案再次勾選會以最新狀態覆寫。
            </p>
          </div>
        </div>
      </div>

      <section className="rounded-lg border bg-card p-4 space-y-4">
        <div>
          <label className="text-sm font-medium">里別</label>
          <select
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={village}
            disabled={loading}
            onChange={(event) => {
              setVillage(event.target.value);
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
          {options?.scope?.label && (
            <p className="mt-1 text-xs text-muted-foreground">範圍：{options.scope.label}</p>
          )}
        </div>

        {village && (
          <>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>未建檔 {cases.length}</span>
              {typeof rosterTotal === "number" && <span>名冊 {rosterTotal}</span>}
              {typeof excludedWithCareform === "number" && (
                <span>已建檔排除 {excludedWithCareform}</span>
              )}
              <span>已完成 {summary.done}</span>
              <span>未遇 {summary.missed}</span>
              <span>查無此人 {summary.notFound}</span>
              <span>尚未勾選 {summary.unset}</span>
              {dirtyCount > 0 && <span className="text-amber-800">本次變更 {dirtyCount}</span>}
            </div>

            {contextWarning && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {contextWarning}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm sm:max-w-xs"
                placeholder="搜尋序號／姓名／編碼／訪查人"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
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
                      filter === key ? "border-primary bg-primary/10 text-primary" : "bg-background"
                    }`}
                    onClick={() => setFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="self-center text-xs text-muted-foreground">將目前列表設為：</span>
              {MOHW_PROGRESS_OUTCOMES.map((outcome) => (
                <button
                  key={outcome}
                  type="button"
                  className="rounded-md border bg-background px-2 py-1 text-xs"
                  onClick={() => applyFilterBulk(outcome)}
                  disabled={!filteredCases.length || busy}
                >
                  {outcome}
                </button>
              ))}
            </div>

            <div className="overflow-hidden rounded-md border">
              <div className="grid grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(4.5rem,auto))] gap-0 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                <div>個案（訪查／建檔／稽核）</div>
                {MOHW_PROGRESS_OUTCOMES.map((outcome) => (
                  <div key={outcome} className="text-center">
                    {outcome}
                  </div>
                ))}
              </div>
              <div className="max-h-[55vh] overflow-y-auto">
                {loadingCases ? (
                  <p className="px-3 py-6 text-sm text-muted-foreground">載入個案中…</p>
                ) : filteredCases.length === 0 ? (
                  <p className="px-3 py-6 text-sm text-muted-foreground">
                    {contextWarning
                      ? "無法載入未建檔名單。"
                      : "此條件沒有未建檔個案（本平台已有關懷表者已排除）。"}
                  </p>
                ) : (
                  filteredCases.map((row) => {
                    const current = outcomes[row.case_id] || "";
                    const civil = row.civil_worker_name?.trim() || "";
                    const social = row.social_worker_name?.trim() || "";
                    const keyedBy = row.keyed_by_name?.trim() || "";
                    const auditors = (row.audit_supervisors ?? [])
                      .map((item) => item.trim())
                      .filter(Boolean);
                    const visitorLine = [
                      civil ? `民政 ${civil}` : "",
                      social ? `社政 ${social}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <div
                        key={row.case_id}
                        className="grid grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(4.5rem,auto))] items-start gap-0 border-b px-3 py-2.5 text-sm last:border-b-0"
                      >
                        <div className="min-w-0 space-y-1.5 pr-2">
                          <p className="truncate font-medium">
                            {row.village_seq != null ? `#${row.village_seq} ` : ""}
                            {row.name || "（未填姓名）"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {row.encoded_id || row.case_id}
                          </p>
                          <div className="space-y-1 rounded-md border border-dashed border-border/80 bg-muted/30 px-2 py-1.5">
                            <StaffMetaRow label="訪查" value={visitorLine} />
                            <StaffMetaRow label="建檔" value={keyedBy} />
                            <StaffMetaRow
                              label="稽核"
                              value={auditors.length ? auditors.join("、") : ""}
                            />
                          </div>
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
                : `確認送出（${selectedForSubmit.length} 筆已勾選）`}
            </Button>
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
