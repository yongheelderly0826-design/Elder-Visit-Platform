"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckSquare, RefreshCw, Wrench } from "lucide-react";
import { PageIntro } from "@/components/ui/page-intro";
import { Button } from "@/components/ui/button";
import { deskVisitorColumnSide } from "@/lib/domain/desk-care-batch";
import type { DeskVisitorOption } from "@/lib/domain/manager-care-form-desk";
import {
  MOHW_PROGRESS_OUTCOMES,
  type MohwProgressMarkPatch,
  type MohwProgressMarkRow,
  type MohwProgressOutcome,
} from "@/lib/domain/mohw-progress";

const ZHANG_XINYUN_QUICK = "張馨云";

type ApplyFields = {
  keyed: boolean;
  civil: boolean;
  social: boolean;
  outcome: boolean;
};

function emptyApply(): ApplyFields {
  return { keyed: true, civil: false, social: false, outcome: false };
}

export function MohwProgressCorrections() {
  const [villages, setVillages] = useState<string[]>([]);
  const [village, setVillage] = useState("");
  const [marks, setMarks] = useState<MohwProgressMarkRow[]>([]);
  const [visitors, setVisitors] = useState<DeskVisitorOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [keyedFilter, setKeyedFilter] = useState("");
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

  const civilVisitors = useMemo(
    () => visitors.filter((item) => deskVisitorColumnSide(item) === "civil"),
    [visitors],
  );
  const socialVisitors = useMemo(
    () => visitors.filter((item) => deskVisitorColumnSide(item) === "social"),
    [visitors],
  );

  const loadVisitors = useCallback(async () => {
    try {
      const response = await fetch("/api/desk/mohw-progress/options");
      const json = (await response.json()) as {
        data?: { visitors?: DeskVisitorOption[]; villages?: string[] };
      };
      if (response.ok) {
        setVisitors(json.data?.visitors ?? []);
        if (!villages.length && json.data?.villages?.length) {
          setVillages(json.data.villages);
        }
      }
    } catch {
      // visitors optional for display; corrections can still list marks
    }
  }, [villages.length]);

  const loadMarks = useCallback(async (villageName: string) => {
    if (!villageName) {
      setMarks([]);
      setSelected({});
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/manager/mohw-progress/marks?village=${encodeURIComponent(villageName)}`,
      );
      const json = (await response.json()) as {
        data?: { marks?: MohwProgressMarkRow[]; villages?: string[] };
        error?: { message?: string };
      };
      if (!response.ok) {
        setError(json.error?.message ?? "無法載入已送出標記");
        setMarks([]);
        return;
      }
      if (json.data?.villages?.length) setVillages(json.data.villages);
      setMarks(json.data?.marks ?? []);
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
    void loadVisitors();
  }, [loadVisitors]);

  useEffect(() => {
    void loadMarks(village);
  }, [village, loadMarks]);

  const keyedNameOptions = useMemo(() => {
    const fromMarks = new Set<string>();
    for (const row of marks) {
      const name = row.keyed_by_name.trim();
      if (name) fromMarks.add(name);
    }
    return [...fromMarks].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [marks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return marks.filter((row) => {
      if (keyedFilter === "__ZHANG__") {
        if (!row.keyed_by_name.includes(ZHANG_XINYUN_QUICK) && !row.keyed_by_id.includes("TEMP-02")) {
          return false;
        }
      } else if (keyedFilter && row.keyed_by_name !== keyedFilter) {
        return false;
      }
      if (outcomeFilter && row.outcome !== outcomeFilter) return false;
      if (!q) return true;
      const hay = [
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

  function buildPatches(): MohwProgressMarkPatch[] | { error: string } {
    if (!selectedIds.length) return { error: "請先勾選要修正的標記。" };
    if (!applyFields.keyed && !applyFields.civil && !applyFields.social && !applyFields.outcome) {
      return { error: "請至少勾選一項要改正的欄位。" };
    }

    const keyed = visitors.find((item) => item.id === nextKeyedId) ?? null;
    const civil = civilVisitors.find((item) => item.id === nextCivilId) ?? null;
    const social = socialVisitors.find((item) => item.id === nextSocialId) ?? null;

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
        patch.keyed_by_id = keyed.id;
        patch.keyed_by_name = keyed.name;
      }
      if (applyFields.civil) {
        if (clearCivil) {
          patch.civil_worker_id = "";
          patch.civil_worker_name = "";
        } else if (civil) {
          patch.civil_worker_id = civil.id;
          patch.civil_worker_name = civil.name;
        }
      }
      if (applyFields.social) {
        if (clearSocial) {
          patch.social_worker_id = "";
          patch.social_worker_name = "";
        } else if (social) {
          patch.social_worker_id = social.id;
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
      const keyed = visitors.find((item) => item.id === nextKeyedId);
      parts.push(`建檔→${keyed?.name || "—"}`);
    }
    if (applyFields.civil) {
      parts.push(
        clearCivil
          ? "民政→清空"
          : `民政→${civilVisitors.find((item) => item.id === nextCivilId)?.name || "—"}`,
      );
    }
    if (applyFields.social) {
      parts.push(
        clearSocial
          ? "社政→清空"
          : `社政→${socialVisitors.find((item) => item.id === nextSocialId)?.name || "—"}`,
      );
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
          missing_count?: number;
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
        description="此頁只改正已送出的直 KEY 標記（建檔／民政／社政／狀態）。未送出請用「衛福部進度回報」。登入送出帳號與原始回報時間不會改動。"
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
          disabled={loading || !village}
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">里別</span>
            <select
              className="w-full rounded-md border bg-background px-3 py-2"
              value={village}
              onChange={(event) => setVillage(event.target.value)}
            >
              <option value="">— 請選里別 —</option>
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
              disabled={!village}
            >
              <option value="">全部</option>
              <option value="__ZHANG__">快捷：張馨云／TEMP-02</option>
              {keyedNameOptions.map((name) => (
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
              disabled={!village}
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
              placeholder="序號／姓名／編碼"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={!village}
            />
          </label>
        </div>
        <p className="text-sm text-muted-foreground">
          {village
            ? `目前列出 ${filtered.length}／${marks.length} 筆；已勾選 ${selectedIds.length} 筆。`
            : "請先選里別。"}
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
              <option value="">— 選擇正確建檔人員 —</option>
              {visitors.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.badgeNo ? `（${item.badgeNo}）` : ""}
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
              <option value="">— 選擇民政 —</option>
              {civilVisitors.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
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
              <option value="">— 選擇社政 —</option>
              {socialVisitors.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
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
            placeholder="例：得和里誤填建檔人員改正"
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

        {!village ? (
          <p className="text-sm text-muted-foreground">請先選里別。</p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">載入中…</p>
        ) : !filtered.length ? (
          <p className="text-sm text-muted-foreground">沒有符合條件的已送出標記。</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-[64rem] w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">勾選</th>
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
