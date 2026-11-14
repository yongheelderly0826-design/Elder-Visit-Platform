"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckSquare, RefreshCw, Wrench } from "lucide-react";
import { PageIntro } from "@/components/ui/page-intro";
import { Button } from "@/components/ui/button";
import {
  MOHW_PROGRESS_OUTCOMES,
  type MohwProgressMarkPatch,
  type MohwProgressMarkRow,
  type MohwProgressOutcome,
} from "@/lib/domain/mohw-progress";

type StaffOption = {
  id: string;
  name: string;
  kind: "visitor" | "desk_clerk" | "mark";
  side?: "civil" | "social" | "unknown";
};

type ApplyFields = {
  keyed: boolean;
  civil: boolean;
  social: boolean;
  outcome: boolean;
};

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

export function MohwProgressCorrections() {
  const [villages, setVillages] = useState<string[]>([]);
  const [village, setVillage] = useState(""); // "" = 全部里
  const [marks, setMarks] = useState<MohwProgressMarkRow[]>([]);
  const [keyedByNames, setKeyedByNames] = useState<string[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [keyedFilter, setKeyedFilter] = useState(""); // "" = 全部建檔人員
  const [outcomeFilter, setOutcomeFilter] = useState<"" | MohwProgressOutcome>("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const [applyFields, setApplyFields] = useState<ApplyFields>(emptyApply);
  const [nextKeyedId, setNextKeyedId] = useState("");
  const [nextCivilId, setNextCivilId] = useState("");
  const [clearCivil, setClearCivil] = useState(false);
  const [nextSocialId, setNextSocialId] = useState("");
  const [clearSocial, setClearSocial] = useState(false);
  const [nextOutcome, setNextOutcome] = useState<MohwProgressOutcome | "">("");
  const [note, setNote] = useState("");

  const keyedStaff = useMemo(
    () => [...staffOptions].sort(bySurname),
    [staffOptions],
  );
  const civilStaff = useMemo(
    () => staffOptions.filter((item) => item.side === "civil").sort(bySurname),
    [staffOptions],
  );
  const socialStaff = useMemo(
    () => staffOptions.filter((item) => item.side === "social").sort(bySurname),
    [staffOptions],
  );

  const loadMarks = useCallback(async (villageName: string) => {
    setLoading(true);
    setError(null);
    try {
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
        setMarks([]);
        return;
      }
      if (json.data?.villages?.length) setVillages(json.data.villages);
      setMarks(json.data?.marks ?? []);
      setKeyedByNames(json.data?.keyed_by_names ?? []);
      setStaffOptions(json.data?.staff_options ?? []);
      setSelected({});
      setMessage(null);
    } catch {
      setError("無法載入已送出標記，請稍後再試。");
      setMarks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMarks(village);
  }, [village, loadMarks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return marks.filter((row) => {
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
        row.mark_id,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [marks, keyedFilter, outcomeFilter, query]);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, on]) => on).map(([id]) => id),
    [selected],
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((row) => selected[row.mark_id]);

  function toggleAllFiltered(next: boolean) {
    setSelected((prev) => {
      const copy = { ...prev };
      for (const row of filtered) {
        copy[row.mark_id] = next;
      }
      return copy;
    });
  }

  function findStaff(id: string) {
    return staffOptions.find((item) => item.id === id) ?? null;
  }

  function buildPatches(): MohwProgressMarkPatch[] | { error: string } {
    if (!selectedIds.length) return { error: "請先勾選要修正的標記。" };
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

    return selectedIds.map((markId) => {
      const patch: MohwProgressMarkPatch = { mark_id: markId };
      if (applyFields.keyed && keyed) {
        patch.keyed_by_id = keyed.id.startsWith("name:") ? "" : keyed.id;
        patch.keyed_by_name = keyed.name;
      }
      if (applyFields.civil) {
        if (clearCivil) {
          patch.civil_worker_id = "";
          patch.civil_worker_name = "";
        } else if (civil) {
          patch.civil_worker_id = civil.id.startsWith("name:") ? "" : civil.id;
          patch.civil_worker_name = civil.name;
        }
      }
      if (applyFields.social) {
        if (clearSocial) {
          patch.social_worker_id = "";
          patch.social_worker_name = "";
        } else if (social) {
          patch.social_worker_id = social.id.startsWith("name:") ? "" : social.id;
          patch.social_worker_name = social.name;
        }
      }
      if (applyFields.outcome && nextOutcome) {
        patch.outcome = nextOutcome;
      }
      return patch;
    });
  }

  async function previewAndApply() {
    const built = buildPatches();
    if ("error" in built) {
      setError(built.error);
      return;
    }

    const parts: string[] = [];
    if (applyFields.keyed) {
      parts.push(`建檔→${findStaff(nextKeyedId)?.name || "—"}`);
    }
    if (applyFields.civil) {
      parts.push(clearCivil ? "民政→清空" : `民政→${findStaff(nextCivilId)?.name || "—"}`);
    }
    if (applyFields.social) {
      parts.push(clearSocial ? "社政→清空" : `社政→${findStaff(nextSocialId)?.name || "—"}`);
    }
    if (applyFields.outcome) parts.push(`狀態→${nextOutcome}`);

    const ok = window.confirm(
      `即將修正 ${built.length} 筆已送出標記：\n${parts.join("、")}\n\n不會改動「誰登入送出」與原始回報時間。確定寫入？`,
    );
    if (!ok) return;

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const dry = await fetch("/api/manager/mohw-progress/marks/patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patches: built, note, dry_run: true }),
      });
      const dryJson = (await dry.json()) as {
        data?: { would_update?: number };
        error?: { message?: string };
      };
      if (!dry.ok) {
        setError(dryJson.error?.message ?? "預覽失敗");
        return;
      }

      const response = await fetch("/api/manager/mohw-progress/marks/patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patches: built, note }),
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

      const updated = json.data?.updated_count ?? 0;
      const missing = json.data?.missing ?? [];
      const missingMsg = missing.length
        ? `；失敗 ${missing.length} 筆：${missing
            .map((item) => `${item.mark_id || "?"}（${item.reason || "未知"}）`)
            .join("、")}`
        : "";
      setMessage(`已修正 ${updated} 筆${missingMsg}`);
      await loadMarks(village);
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
        title="衛福部進度：修正已送出"
        description="可修正任一里、任一人的已送出直 KEY 標記（建檔／民政／社政／狀態）。未送出請用「衛福部進度回報」。登入送出帳號與原始回報時間不會改動。"
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
          onClick={() => void loadMarks(village)}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "載入中…" : "重新整理"}
        </Button>
      </div>

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

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h2 className="font-semibold">1. 篩選已送出標記</h2>
        <p className="text-sm text-muted-foreground">
          預設載入全部里、全部建檔人員；再依需要縮小範圍。
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
              onChange={(event) =>
                setOutcomeFilter(event.target.value as "" | MohwProgressOutcome)
              }
            >
              <option value="">全部</option>
              {MOHW_PROGRESS_OUTCOMES.map((item) => (
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
            : `目前列出 ${filtered.length}／${marks.length} 筆；已勾選 ${selectedIds.length} 筆。`}
        </p>
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-3">
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
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={nextKeyedId}
              disabled={!applyFields.keyed}
              onChange={(event) => setNextKeyedId(event.target.value)}
            >
              <option value="">— 選擇正確建檔人員（{keyedStaff.length}）—</option>
              {keyedStaff.map((item) => (
                <option key={`keyed-${item.id}`} value={item.id}>
                  {staffLabel(item)}
                </option>
              ))}
            </select>
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
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={nextCivilId}
              disabled={!applyFields.civil || clearCivil}
              onChange={(event) => {
                setNextCivilId(event.target.value);
                setClearCivil(false);
              }}
            >
              <option value="">— 選擇民政（依姓氏）—</option>
              {civilStaff.map((item) => (
                <option key={`civil-${item.id}`} value={item.id}>
                  {staffLabel(item)}
                </option>
              ))}
            </select>
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
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={nextSocialId}
              disabled={!applyFields.social || clearSocial}
              onChange={(event) => {
                setNextSocialId(event.target.value);
                setClearSocial(false);
              }}
            >
              <option value="">— 選擇社政（依姓氏）—</option>
              {socialStaff.map((item) => (
                <option key={`social-${item.id}`} value={item.id}>
                  {staffLabel(item)}
                </option>
              ))}
            </select>
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
              onChange={(event) =>
                setNextOutcome(event.target.value as MohwProgressOutcome | "")
              }
            >
              <option value="">— 選擇狀態 —</option>
              {MOHW_PROGRESS_OUTCOMES.map((item) => (
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

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">3. 已送出標記列表</h2>
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
          <p className="text-sm text-muted-foreground">沒有符合條件的已送出標記。</p>
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
                  <th className="px-3 py-2 font-medium">回報時間</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.mark_id} className="border-t">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={Boolean(selected[row.mark_id])}
                        onChange={(event) =>
                          setSelected((prev) => ({
                            ...prev,
                            [row.mark_id]: event.target.checked,
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">{row.village_name || "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{row.village_seq ?? "—"}</td>
                    <td className="px-3 py-2 font-medium">{row.name || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.encoded_id || "—"}</td>
                    <td className="px-3 py-2">{row.outcome || "—"}</td>
                    <td className="px-3 py-2">{row.keyed_by_name || "—"}</td>
                    <td className="px-3 py-2">{row.civil_worker_name || "—"}</td>
                    <td className="px-3 py-2">{row.social_worker_name || "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {row.reported_at || "—"}
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
