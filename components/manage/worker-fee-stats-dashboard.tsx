"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FeeRateCard } from "@/lib/domain/fee-rate-card";

type PersonRow = {
  person_key: string;
  name: string;
  role: string;
  counts: {
    success: number;
    missed: number;
    refused: number;
    not_found: number;
    addr_unknown: number;
    total_cases: number;
  };
  amounts: { visit: number; builder: number; audit: number; total: number };
};

type Payload = {
  computed_at: string;
  village_filter: string | null;
  rate_card: FeeRateCard;
  notes: string[];
  totals: {
    cases_counted: number;
    dual_cases: number;
    visitor_people: number;
    builder_people: number;
    morph: Record<string, number>;
    amount_visit: number;
    amount_builder: number;
    amount_audit: number;
  };
  visitors: PersonRow[];
  builders: PersonRow[];
  auditors: PersonRow[];
  case_warnings: Array<{ message?: string; case_id?: string; name?: string }>;
  case_warnings_total: number;
};

type ParamRow = {
  key: string;
  value: string;
  unit: string;
  note: string;
  updated_at?: string;
  updated_by?: string;
};

const EDITABLE_KEYS = [
  "fee.visit.success",
  "fee.visit.missed",
  "fee.visit.refused",
  "fee.visit.not_found",
  "fee.visit.addr_unknown",
  "fee.builder.success",
  "fee.builder.missed",
  "fee.builder.refused",
  "fee.builder.not_found",
  "fee.builder.addr_unknown",
  "fee.audit.success",
  "fee.audit.missed",
  "fee.audit.refused",
  "fee.audit.not_found",
  "fee.audit.addr_unknown",
  "fee.audit.payee_name",
  "fee.audit.payee_role",
  "fee.require_audit_pass",
  "rule.cap.solo_visit_case",
  "rule.cap.joint_visit_case",
] as const;

function money(n: number) {
  return `${Number(n || 0).toLocaleString("zh-TW")} 元`;
}

function roleLabel(role: string) {
  if (role === "civil") return "民政";
  if (role === "social") return "社政";
  if (role === "builder") return "建檔";
  if (role === "audit") return "稽核";
  return role;
}

function toCsv(rows: PersonRow[], section: string) {
  const header = [
    "區塊",
    "姓名",
    "角色",
    "件數",
    "成功",
    "未遇",
    "拒訪",
    "查無",
    "住址不詳",
    "訪視費",
    "建檔費",
    "稽核費",
    "小計",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        section,
        r.name,
        roleLabel(r.role),
        r.counts.total_cases,
        r.counts.success,
        r.counts.missed,
        r.counts.refused,
        r.counts.not_found,
        r.counts.addr_unknown,
        r.amounts.visit,
        r.amounts.builder,
        r.amounts.audit,
        r.amounts.total,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
  }
  return lines.join("\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function PersonTable({ title, rows }: { title: string; rows: PersonRow[] }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-stone-800">{title}</h2>
        <button
          type="button"
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
          onClick={() =>
            downloadCsv(
              `${title.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`,
              toCsv(rows, title),
            )
          }
          disabled={!rows.length}
        >
          匯出 CSV
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-stone-50 text-stone-600">
            <tr>
              <th className="px-3 py-2 font-medium">姓名</th>
              <th className="px-3 py-2 font-medium">角色</th>
              <th className="px-3 py-2 font-medium">件數</th>
              <th className="px-3 py-2 font-medium">成功</th>
              <th className="px-3 py-2 font-medium">未遇</th>
              <th className="px-3 py-2 font-medium">拒訪</th>
              <th className="px-3 py-2 font-medium">查無</th>
              <th className="px-3 py-2 font-medium">住址不詳</th>
              <th className="px-3 py-2 font-medium">訪視費</th>
              <th className="px-3 py-2 font-medium">建檔費</th>
              <th className="px-3 py-2 font-medium">稽核費</th>
              <th className="px-3 py-2 font-medium">小計</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-stone-500">
                  目前無資料（請確認分桶索引已重算）
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.person_key} className="border-t border-stone-100">
                  <td className="px-3 py-2 font-medium text-stone-900">{r.name}</td>
                  <td className="px-3 py-2">{roleLabel(r.role)}</td>
                  <td className="px-3 py-2">{r.counts.total_cases}</td>
                  <td className="px-3 py-2">{r.counts.success}</td>
                  <td className="px-3 py-2">{r.counts.missed}</td>
                  <td className="px-3 py-2">{r.counts.refused}</td>
                  <td className="px-3 py-2">{r.counts.not_found}</td>
                  <td className="px-3 py-2">{r.counts.addr_unknown}</td>
                  <td className="px-3 py-2">{money(r.amounts.visit)}</td>
                  <td className="px-3 py-2">{money(r.amounts.builder)}</td>
                  <td className="px-3 py-2">{money(r.amounts.audit)}</td>
                  <td className="px-3 py-2 font-medium">{money(r.amounts.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function WorkerFeeStatsDashboard() {
  const [village, setVillage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [paramRows, setParamRows] = useState<ParamRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = village.trim() ? `?village=${encodeURIComponent(village.trim())}` : "";
      const res = await fetch(`/api/manager/worker-fee-stats${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error?.message || `HTTP ${res.status}`);
      }
      setData(json.data as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [village]);

  const loadParams = useCallback(async () => {
    setSaveMsg(null);
    try {
      const res = await fetch("/api/manager/worker-fee-stats/params", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
      const rows = (json.data?.rows || []) as ParamRow[];
      setParamRows(rows);
      const next: Record<string, string> = {};
      for (const k of EDITABLE_KEYS) {
        const found = rows.find((r) => r.key === k);
        next[k] = found?.value ?? "";
      }
      setDraft(next);
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "載入參數失敗");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const editableMeta = useMemo(() => {
    const map = new Map(paramRows.map((r) => [r.key, r]));
    return EDITABLE_KEYS.map((key) => ({
      key,
      note: map.get(key)?.note || "",
      unit: map.get(key)?.unit || "",
    }));
  }, [paramRows]);

  async function saveParams() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const patches = EDITABLE_KEYS.map((key) => ({
        key,
        value: draft[key] ?? "",
      })).filter((p) => p.value !== "");
      const res = await fetch("/api/manager/worker-fee-stats/params", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patches, updated_by: "manager-ui" }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
      const missing = json.data?.missing || [];
      setSaveMsg(
        missing.length
          ? `已寫入 ${json.data?.written ?? 0} 項；缺列未寫入：${missing.join(", ")}`
          : `已寫入 ${json.data?.written ?? patches.length} 項到「計費參數」`,
      );
      await loadParams();
      await load();
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  const card = data?.rate_card;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <p className="text-sm text-stone-500">管理者 · 核銷對帳</p>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          訪查員／建檔計費統計
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-stone-600">
          依個案進度索引試算每人件數與費用。可在本頁改「計費參數」（寫入 Google Sheet），或直接改試算表同名分頁；改完重新計算即可，不必部署程式。
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-4">
        <label className="space-y-1 text-sm">
          <span className="text-stone-600">里（可空白＝全部）</span>
          <input
            className="block w-48 rounded-lg border border-stone-300 px-3 py-2"
            value={village}
            onChange={(e) => setVillage(e.target.value)}
            placeholder="例：中溪里"
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
          disabled={loading}
        >
          {loading ? "載入中…" : "重新計算"}
        </button>
        <button
          type="button"
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
          onClick={() => {
            const next = !showSettings;
            setShowSettings(next);
            if (next) void loadParams();
          }}
        >
          {showSettings ? "收合計費參數" : "設定計費參數"}
        </button>
        {data ? (
          <button
            type="button"
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
            onClick={() => {
              const header =
                "區塊,姓名,角色,件數,成功,未遇,拒訪,查無,住址不詳,訪視費,建檔費,稽核費,小計\n";
              const body = [...data.visitors, ...data.builders, ...data.auditors]
                .map((r) => {
                  const section =
                    r.role === "builder" ? "建檔" : r.role === "audit" ? "稽核" : "訪查員";
                  return [
                    section,
                    r.name,
                    roleLabel(r.role),
                    r.counts.total_cases,
                    r.counts.success,
                    r.counts.missed,
                    r.counts.refused,
                    r.counts.not_found,
                    r.counts.addr_unknown,
                    r.amounts.visit,
                    r.amounts.builder,
                    r.amounts.audit,
                    r.amounts.total,
                  ]
                    .map((v) => `"${String(v).replace(/"/g, '""')}"`)
                    .join(",");
                })
                .join("\n");
              downloadCsv(
                `計費統計_全部_${new Date().toISOString().slice(0, 10)}.csv`,
                header + body,
              );
            }}
          >
            匯出全部 CSV
          </button>
        ) : null}
      </div>

      {showSettings ? (
        <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-stone-800">計費參數設定</h2>
          <p className="text-sm text-stone-600">
            寫入主工作簿分頁「計費參數」。也可直接在 Google 試算表改同名分頁的 value 欄。
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {editableMeta.map((m) => (
              <label key={m.key} className="space-y-1 text-sm">
                <span className="font-medium text-stone-700">{m.key}</span>
                {m.note ? <span className="block text-xs text-stone-500">{m.note}</span> : null}
                <input
                  className="block w-full rounded-lg border border-stone-300 px-3 py-2"
                  value={draft[m.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [m.key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveParams()}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {saving ? "儲存中…" : "儲存到試算表"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm"
              onClick={() => void loadParams()}
            >
              重新載入參數
            </button>
            {saveMsg ? <span className="text-sm text-stone-600">{saveMsg}</span> : null}
          </div>
        </section>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="text-xs text-stone-500">計入案件</p>
              <p className="mt-1 text-2xl font-semibold">{data.totals.cases_counted}</p>
              <p className="text-xs text-stone-500">雙側（社政＋民政）{data.totals.dual_cases}</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="text-xs text-stone-500">訪視費合計</p>
              <p className="mt-1 text-2xl font-semibold">{money(data.totals.amount_visit)}</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="text-xs text-stone-500">建檔費合計</p>
              <p className="mt-1 text-2xl font-semibold">{money(data.totals.amount_builder)}</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="text-xs text-stone-500">稽核費合計</p>
              <p className="mt-1 text-2xl font-semibold">{money(data.totals.amount_audit)}</p>
            </div>
          </section>

          {card ? (
            <section className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
              <p>
                費率卡 <span className="font-medium">{card.version}</span>
                （{card.source === "sheet" ? "Sheet" : "程式後備"}）· 生效 {card.effectiveFrom}
                · 稽核受款 {card.auditPayeeName}（{card.auditPayeeRole}）
                · 獨訪上限警示 {card.capSolo}／共同 {card.capJoint}
              </p>
              <p className="mt-1 text-stone-500">
                成功訪視 {card.visit.success}＋建檔 {card.builder.success}＋稽核 {card.audit.success}
                ；未遇 {card.visit.missed}/{card.builder.missed}/{card.audit.missed}
                ；拒訪 {card.visit.refused}/{card.builder.refused}/{card.audit.refused}
              </p>
              {data.notes?.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-600">
                  {data.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-2 text-xs text-stone-500">計算時間 {data.computed_at || "—"}</p>
            </section>
          ) : null}

          {data.case_warnings_total > 0 ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-medium">上限警示 {data.case_warnings_total} 案（不折減）</p>
              <ul className="mt-2 space-y-1">
                {data.case_warnings.slice(0, 10).map((w, i) => (
                  <li key={`${w.case_id}-${i}`}>
                    {w.name || w.case_id}：{w.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <PersonTable title="訪查員（社政／民政）" rows={data.visitors} />
          <PersonTable title="建檔人員" rows={data.builders} />
          <PersonTable title="行政稽核費受款" rows={data.auditors} />
        </>
      ) : null}
    </div>
  );
}
