"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckSquare, RefreshCw, Wrench } from "lucide-react";
import { PageIntro } from "@/components/ui/page-intro";
import { Button } from "@/components/ui/button";
import { SearchableStaffSelect } from "@/components/manage/searchable-staff-select";
import { isDeskOperationalStaffName } from "@/lib/domain/desk-staff-picker";
import {
  MOHW_PROGRESS_OUTCOMES,
  type MohwProgressMarkPatch,
  type MohwProgressMarkRow,
  type MohwProgressOutcome,
} from "@/lib/domain/mohw-progress";

type SourceTab = "mark" | "careform" | "index";

type StaffOption = {
  id: string;
  name: string;
  kind: "visitor" | "desk_clerk" | "mark";
  side?: "civil" | "social" | "unknown";
};

type CorrectionRow = {
  row_id: string;
  source: string;
  careform_id?: string;
  case_id?: string;
  name: string;
  encoded_id: string;
  village_name: string;
  village_seq: number | null;
  outcome: string;
  keyed_by_name: string;
  civil_worker_name: string;
  social_worker_name: string;
  reported_at: string;
  channel?: string;
  has_careform?: boolean;
  has_direct_mark?: boolean;
  bucket?: string;
};

type ApplyFields = {
  keyed: boolean;
  civil: boolean;
  social: boolean;
  outcome: boolean;
};

const CAREFORM_OUTCOMES = ["已完成", "未遇", "拒訪", "住址不詳"] as const;

function emptyApply(): ApplyFields {
  return { keyed: true, civil: false, social: false, outcome: false };
}

function staffLabel(item: StaffOption) {
  if (item.kind === "desk_clerk") return `${item.name}（${item.id}）`;
  return item.name;
}

function bySurname(a: StaffOption, b: StaffOption) {
  return a.name.localeCompare(b.name, "zh-Hant");
}

function tabLabel(tab: SourceTab) {
  if (tab === "mark") return "直 KEY 標記";
  if (tab === "careform") return "關懷表";
  return "分桶索引";
}

export function MohwProgressCorrections() {
  const [source, setSource] = useState<SourceTab>("mark");
  const [villages, setVillages] = useState<string[]>([]);
  const [village, setVillage] = useState("");
  const [rows, setRows] = useState<CorrectionRow[]>([]);
  const [keyedByNames, setKeyedByNames] = useState<string[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listNote, setListNote] = useState<string | null>(null);

  const [keyedFilter, setKeyedFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const [applyFields, setApplyFields] = useState<ApplyFields>(emptyApply);
  const [nextKeyedId, setNextKeyedId] = useState("");
  const [nextCivilId, setNextCivilId] = useState("");
  const [clearCivil, setClearCivil] = useState(false);
  const [nextSocialId, setNextSocialId] = useState("");
  const [clearSocial, setClearSocial] = useState(false);
  const [nextOutcome, setNextOutcome] = useState("");
  const [note, setNote] = useState("");

  const outcomeOptions =
    source === "mark" ? MOHW_PROGRESS_OUTCOMES : CAREFORM_OUTCOMES;

  const operationalStaff = useMemo(
    () => staffOptions.filter((item) => isDeskOperationalStaffName(item.name)),
    [staffOptions],
  );
  const keyedStaff = useMemo(
    () => [...operationalStaff].sort(bySurname),
    [operationalStaff],
  );
  const civilStaff = useMemo(
    () => operationalStaff.filter((item) => item.side === "civil").sort(bySurname),
    [operationalStaff],
  );
  const socialStaff = useMemo(
    () => operationalStaff.filter((item) => item.side === "social").sort(bySurname),
    [operationalStaff],
  );

  const loadRows = useCallback(async (tab: SourceTab, villageName: string) => {
    setLoading(true);
    setError(null);
    setListNote(null);
    try {
      if (tab === "mark") {
        const qs = villageName
          ? `?village=${encodeURIComponent(villageName)}`
          : "";
        const response = await fetch(`/api/manager/mohw-progress/marks${qs}`);
        const json = (await response.json()) as {
          data?: {
            marks?: MohwProgressMarkRow[];
            villages?: string[];
            keyed_by_names?: string[];
            staff_options?: StaffOption[];
          };
          error?: { message?: string };
        };
        if (!response.ok) {
          setError(json.error?.message ?? "無法載入已送出標記");
          setRows([]);
          return;
        }
        if (json.data?.villages?.length) setVillages(json.data.villages);
        setRows(
          (json.data?.marks ?? []).map((row) => ({
            row_id: row.mark_id,
            source: "mark",
            case_id: row.case_id,
            name: row.name,
            encoded_id: row.encoded_id,
            village_name: row.village_name,
            village_seq: row.village_seq,
            outcome: row.outcome,
            keyed_by_name: row.keyed_by_name,
            civil_worker_name: row.civil_worker_name,
            social_worker_name: row.social_worker_name,
            reported_at: row.reported_at,
          })),
        );
        setKeyedByNames(json.data?.keyed_by_names ?? []);
        setStaffOptions(json.data?.staff_options ?? []);
      } else {
        const params = new URLSearchParams({ source: tab });
        if (villageName) params.set("village", villageName);
        const response = await fetch(
          `/api/manager/progress-corrections/list?${params.toString()}`,
        );
        const json = (await response.json()) as {
          data?: {
            rows?: CorrectionRow[];
            villages?: string[];
            keyed_by_names?: string[];
            staff_options?: StaffOption[];
            note?: string | null;
            truncated?: boolean;
          };
          error?: { message?: string };
        };
        if (!response.ok) {
          setError(json.error?.message ?? "無法載入資料");
          setRows([]);
          return;
        }
        if (json.data?.villages?.length) setVillages(json.data.villages);
        setRows(json.data?.rows ?? []);
        setKeyedByNames(json.data?.keyed_by_names ?? []);
        setStaffOptions(json.data?.staff_options ?? []);
        if (json.data?.note) setListNote(json.data.note);
        else if (json.data?.truncated) {
          setListNote("結果已截斷；請先選里別以載入完整名單。");
        }
      }
      setSelected({});
      setMessage(null);
    } catch {
      setError("無法載入資料，請稍後再試。");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows(source, village);
  }, [source, village, loadRows]);

  useEffect(() => {
    setOutcomeFilter("");
    setNextOutcome("");
    setKeyedFilter("");
    setQuery("");
  }, [source]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (keyedFilter && row.keyed_by_name.trim() !== keyedFilter) return false;
      if (outcomeFilter && row.outcome !== outcomeFilter) return false;
      if (!q) return true;
      const hay = [
        row.village_name,
        row.village_seq ?? "",
        row.name,
        row.encoded_id,
        row.keyed_by_name,
        row.civil_worker_name,
        row.social_worker_name,
        row.outcome,
        row.row_id,
        row.channel ?? "",
        row.bucket ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, keyedFilter, outcomeFilter, query]);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, on]) => on).map(([id]) => id),
    [selected],
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((row) => selected[row.row_id]);

  function toggleAllFiltered(next: boolean) {
    setSelected((prev) => {
      const copy = { ...prev };
      for (const row of filtered) {
        copy[row.row_id] = next;
      }
      return copy;
    });
  }

  function findStaff(id: string) {
    return staffOptions.find((item) => item.id === id) ?? null;
  }

  function buildCommonFields() {
    if (!selectedIds.length) return { error: "請先勾選要修正的列。" };
    if (!applyFields.keyed && !applyFields.civil && !applyFields.social && !applyFields.outcome) {
      return { error: "請至少勾選一項要改正的欄位。" };
    }

    const keyed = findStaff(nextKeyedId);
    const civil = findStaff(nextCivilId);
    const social = findStaff(nextSocialId);

    if (applyFields.keyed && !keyed) {
      return { error: "已勾選改正建檔人員，請選擇正確建檔人員。" };
    }
    if (applyFields.civil && !clearCivil && !civil) {
      return { error: "已勾選改正民政，請選擇人員或勾選「清空民政」。" };
    }
    if (applyFields.social && !clearSocial && !social) {
      return { error: "已勾選改正社政，請選擇人員或勾選「清空社政」。" };
    }
    if (applyFields.outcome && !nextOutcome) {
      return { error: "已勾選改正狀態，請選擇新狀態。" };
    }

    return { keyed, civil, social };
  }

  async function previewAndApply() {
    const common = buildCommonFields();
    if ("error" in common) {
      setError(common.error || "無法套用改正");
      return;
    }

    const parts: string[] = [];
    if (applyFields.keyed) {
      parts.push(`建檔→${common.keyed?.name || "—"}`);
    }
    if (applyFields.civil) {
      parts.push(clearCivil ? "民政→清空" : `民政→${common.civil?.name || "—"}`);
    }
    if (applyFields.social) {
      parts.push(clearSocial ? "社政→清空" : `社政→${common.social?.name || "—"}`);
    }
    if (applyFields.outcome) parts.push(`狀態→${nextOutcome}`);

    const sourceHint =
      source === "mark"
        ? "直 KEY 標記"
        : source === "careform"
          ? "關懷表（並同步分桶索引）"
          : "分桶索引（有關懷表／直 KEY 會回寫來源）";

    const ok = window.confirm(
      `即將修正 ${selectedIds.length} 筆「${sourceHint}」：\n${parts.join("、")}\n\n確定寫入？`,
    );
    if (!ok) return;

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (source === "mark") {
        const patches: MohwProgressMarkPatch[] = selectedIds.map((markId) => {
          const patch: MohwProgressMarkPatch = { mark_id: markId };
          if (applyFields.keyed && common.keyed) {
            patch.keyed_by_id = common.keyed.id.startsWith("name:")
              ? ""
              : common.keyed.id;
            patch.keyed_by_name = common.keyed.name;
          }
                if (applyFields.civil) {
            if (clearCivil) {
              patch.civil_worker_id = "";
              patch.civil_worker_name = "";
            } else if (common.civil) {
              patch.civil_worker_id = common.civil.id.startsWith("name:")
                ? ""
                : common.civil.id;
              patch.civil_worker_name = common.civil.name;
            }
          }
          if (applyFields.social) {
            if (clearSocial) {
              patch.social_worker_id = "";
              patch.social_worker_name = "";
            } else if (common.social) {
              patch.social_worker_id = common.social.id.startsWith("name:")
                ? ""
                : common.social.id;
              patch.social_worker_name = common.social.name;
            }
          }
          if (applyFields.outcome && nextOutcome) {
            patch.outcome = nextOutcome as MohwProgressOutcome;
          }
          return patch;
        });

        const dry = await fetch("/api/manager/mohw-progress/marks/patch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patches, note, dry_run: true }),
        });
        if (!dry.ok) {
          const dryJson = (await dry.json()) as { error?: { message?: string } };
          setError(dryJson.error?.message ?? "預覽失敗");
          return;
        }
        const response = await fetch("/api/manager/mohw-progress/marks/patch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patches, note }),
        });
        const json = (await response.json()) as {
          data?: {
            updated_count?: number;
            missing?: Array<{ mark_id?: string; reason?: string }>;
          };
          error?: { message?: string };
        };
        if (!response.ok) {
          setError(json.error?.message ?? "寫入失敗");
          return;
        }
        const missing = json.data?.missing ?? [];
        const updatedCount = json.data?.updated_count ?? 0;
        setMessage(
          `已修正 ${updatedCount} 筆直 KEY${
            missing.length
              ? `；失敗 ${missing.length}：${missing
                  .map((item) => `${item.mark_id || "?"}（${item.reason || ""}）`)
                  .join("、")}`
              : ""
          }`,
        );
      } else {
        const patches = selectedIds.map((rowId) => {
          const row = rows.find((item) => item.row_id === rowId);
          const patch: Record<string, unknown> = {
            row_id: rowId,
            careform_id: row?.careform_id || rowId,
          };
          if (applyFields.keyed && common.keyed) {
            patch.keyed_by_name = common.keyed.name;
          }
          if (applyFields.civil) {
            patch.civil_worker_name = clearCivil ? "" : common.civil?.name || "";
          }
          if (applyFields.social) {
            patch.social_worker_name = clearSocial
              ? ""
              : common.social?.name || "";
          }
          if (applyFields.outcome && nextOutcome) {
            patch.outcome = nextOutcome;
          }
          return patch;
        });

        const dry = await fetch("/api/manager/progress-corrections/patch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source, patches, note, dry_run: true }),
        });
        if (!dry.ok) {
          const dryJson = (await dry.json()) as { error?: { message?: string } };
          setError(dryJson.error?.message ?? "預覽失敗");
          return;
        }
        const response = await fetch("/api/manager/progress-corrections/patch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source, patches, note }),
        });
        const json = (await response.json()) as {
          data?: {
            updated_count?: number;
            missing?: Array<{ row_id?: string; reason?: string }>;
          };
          error?: { message?: string };
        };
        if (!response.ok) {
          setError(json.error?.message ?? "寫入失敗");
          return;
        }
        const missing = json.data?.missing ?? [];
        setMessage(
          `已修正 ${json.data?.updated_count ?? 0} 筆${tabLabel(source)}${
            missing.length
              ? `；失敗 ${missing.length}：${missing
                  .map((item) => `${item.row_id || "?"}（${item.reason || ""}）`)
                  .join("、")}`
              : ""
          }`,
        );
      }
      await loadRows(source, village);
    } catch {
      setError("寫入失敗，請稍後再試。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageIntro
        icon={Wrench}
        eyebrow="管理者"
        title="進度修正"
        description="可改正直 KEY 標記、關懷表與分桶索引上的建檔／民政／社政／狀態。關懷表與索引改正會回寫來源資料；直 KEY 不改登入送出帳號與原始回報時間。"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/manager/mohw-progress"
          className="inline-flex items-center rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted/40"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回儀表板
        </Link>
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={() => void loadRows(source, village)}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "載入中…" : "重新整理"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["mark", "careform", "index"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`rounded-md border px-3 py-2 text-sm ${
              source === tab
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "bg-background hover:bg-muted/40"
            }`}
            onClick={() => setSource(tab)}
          >
            {tabLabel(tab)}
          </button>
        ))}
      </div>

      {(error || message || listNote) && (
        <div className="space-y-2">
          {(error || message) && (
            <p
              className={`rounded-md border px-3 py-2 text-sm ${
                error
                  ? "border-amber-300 bg-amber-50 text-amber-950"
                  : "border-emerald-300 bg-emerald-50 text-emerald-950"
              }`}
            >
              {error || message}
            </p>
          )}
          {listNote && (
            <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
              {listNote}
            </p>
          )}
        </div>
      )}

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">1. 篩選「{tabLabel(source)}」</h2>
        <p className="text-sm text-muted-foreground">
          {source === "mark" && "來源：MOHW進度個案標記（active）。"}
          {source === "careform" && "來源：關懷表登打（已提交／已稽核）。改正會寫入答案並同步索引。"}
          {source === "index" &&
            "來源：個案進度分桶索引。建議先選里；改正會回寫關懷表與／或直 KEY。"}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">里別</span>
            <select
              className="w-full rounded-md border bg-background px-3 py-2"
              value={village}
              onChange={(event) => setVillage(event.target.value)}
            >
              <option value="">全部里</option>
              {villages.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">建檔人員</span>
            <select
              className="w-full rounded-md border bg-background px-3 py-2"
              value={keyedFilter}
              onChange={(event) => setKeyedFilter(event.target.value)}
            >
              <option value="">全部建檔人員（{keyedByNames.length} 人）</option>
              {keyedByNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">狀態</span>
            <select
              className="w-full rounded-md border bg-background px-3 py-2"
              value={outcomeFilter}
              onChange={(event) => setOutcomeFilter(event.target.value)}
            >
              <option value="">全部</option>
              {outcomeOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">搜尋</span>
            <input
              className="w-full rounded-md border bg-background px-3 py-2"
              placeholder="里／序號／姓名／編碼／人名"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        <p className="text-sm text-muted-foreground">
          {loading
            ? "載入中…"
            : `目前列出 ${filtered.length}／${rows.length} 筆；已勾選 ${selectedIds.length} 筆。`}
        </p>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">2. 改正後的值（套用到已勾選）</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2 rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={applyFields.keyed}
                onChange={(event) =>
                  setApplyFields((prev) => ({ ...prev, keyed: event.target.checked }))
                }
              />
              改正建檔人員
            </label>
            <SearchableStaffSelect
              value={nextKeyedId}
              disabled={!applyFields.keyed}
              onChange={setNextKeyedId}
              placeholder={`— 選擇正確建檔人員（可搜尋・${keyedStaff.length}）—`}
              options={keyedStaff.map((item) => ({
                id: item.id,
                label: staffLabel(item),
              }))}
            />
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={applyFields.civil}
                onChange={(event) =>
                  setApplyFields((prev) => ({ ...prev, civil: event.target.checked }))
                }
              />
              改正民政
            </label>
            <SearchableStaffSelect
              value={nextCivilId}
              disabled={!applyFields.civil || clearCivil}
              onChange={(id) => {
                setNextCivilId(id);
                setClearCivil(false);
              }}
              placeholder="— 選擇民政（可搜尋・依姓氏）—"
              options={civilStaff.map((item) => ({
                id: item.id,
                label: staffLabel(item),
              }))}
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={clearCivil}
                disabled={!applyFields.civil}
                onChange={(event) => {
                  setClearCivil(event.target.checked);
                  if (event.target.checked) setNextCivilId("");
                }}
              />
              清空民政
            </label>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={applyFields.social}
                onChange={(event) =>
                  setApplyFields((prev) => ({ ...prev, social: event.target.checked }))
                }
              />
              改正社政
            </label>
            <SearchableStaffSelect
              value={nextSocialId}
              disabled={!applyFields.social || clearSocial}
              onChange={(id) => {
                setNextSocialId(id);
                setClearSocial(false);
              }}
              placeholder="— 選擇社政（可搜尋・依姓氏）—"
              options={socialStaff.map((item) => ({
                id: item.id,
                label: staffLabel(item),
              }))}
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={clearSocial}
                disabled={!applyFields.social}
                onChange={(event) => {
                  setClearSocial(event.target.checked);
                  if (event.target.checked) setNextSocialId("");
                }}
              />
              清空社政
            </label>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={applyFields.outcome}
                onChange={(event) =>
                  setApplyFields((prev) => ({ ...prev, outcome: event.target.checked }))
                }
              />
              改正狀態
            </label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={nextOutcome}
              disabled={!applyFields.outcome}
              onChange={(event) => setNextOutcome(event.target.value)}
            >
              <option value="">— 選擇狀態 —</option>
              {outcomeOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="block space-y-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">修正備註（選填）</span>
          <input
            className="w-full rounded-md border bg-background px-3 py-2"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="例：誤填建檔人員改正"
          />
        </label>

        <Button
          type="button"
          disabled={saving || !selectedIds.length}
          onClick={() => void previewAndApply()}
        >
          <CheckSquare className="mr-2 h-4 w-4" />
          {saving ? "寫入中…" : `套用到已勾選（${selectedIds.length}）`}
        </Button>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">3. {tabLabel(source)}列表</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              disabled={!filtered.length}
              onChange={(event) => toggleAllFiltered(event.target.checked)}
            />
            全選目前篩選結果
          </label>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">載入中…</p>
        ) : !filtered.length ? (
          <p className="text-sm text-muted-foreground">沒有符合條件的資料。</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-[68rem] w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">勾選</th>
                  <th className="px-3 py-2 font-medium">里別</th>
                  <th className="px-3 py-2 font-medium">里編號</th>
                  <th className="px-3 py-2 font-medium">姓名</th>
                  <th className="px-3 py-2 font-medium">編碼</th>
                  <th className="px-3 py-2 font-medium">狀態</th>
                  <th className="px-3 py-2 font-medium">建檔</th>
                  <th className="px-3 py-2 font-medium">民政</th>
                  <th className="px-3 py-2 font-medium">社政</th>
                  {source === "index" ? (
                    <th className="px-3 py-2 font-medium">通道</th>
                  ) : (
                    <th className="px-3 py-2 font-medium">時間</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.row_id} className="border-t">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={Boolean(selected[row.row_id])}
                        onChange={(event) =>
                          setSelected((prev) => ({
                            ...prev,
                            [row.row_id]: event.target.checked,
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">{row.village_name || "—"}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.village_seq ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-medium">{row.name || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.encoded_id || "—"}
                    </td>
                    <td className="px-3 py-2">{row.outcome || "—"}</td>
                    <td className="px-3 py-2">{row.keyed_by_name || "—"}</td>
                    <td className="px-3 py-2">{row.civil_worker_name || "—"}</td>
                    <td className="px-3 py-2">{row.social_worker_name || "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {source === "index"
                        ? row.channel ||
                          [
                            row.has_careform ? "關懷表" : null,
                            row.has_direct_mark ? "直KEY" : null,
                          ]
                            .filter(Boolean)
                            .join("+") ||
                          "—"
                        : row.reported_at || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
