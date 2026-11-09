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
  countTotal,
  MOHW_PROGRESS_OUTCOMES,
  type MohwProgressMode,
  type MohwProgressOutcome,
  overRosterWarning,
} from "@/lib/domain/mohw-progress";

type OptionsPayload = {
  scope?: DeskScope;
  villages: string[];
  villageCodeByName?: Record<string, string>;
  rosterTotal?: number | null;
  reporter?: { name: string; email: string };
};

export function MohwProgressPanel() {
  const [options, setOptions] = useState<OptionsPayload | null>(null);
  const [village, setVillage] = useState("");
  const [rosterTotal, setRosterTotal] = useState<number | null>(null);
  const [mode, setMode] = useState<MohwProgressMode>("count");
  const [countDone, setCountDone] = useState("0");
  const [countMissed, setCountMissed] = useState("0");
  const [countNotFound, setCountNotFound] = useState("0");
  const [outcome, setOutcome] = useState<MohwProgressOutcome>("已完成");
  const [caseCodesText, setCaseCodesText] = useState("");
  const [rangeText, setRangeText] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function loadOptions(selectedVillage?: string) {
    setLoading(true);
    setMessage(null);
    try {
      const query = selectedVillage
        ? `?village=${encodeURIComponent(selectedVillage)}`
        : "";
      const response = await fetch(`/api/desk/mohw-progress/options${query}`);
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
        setRosterTotal(
          typeof json.data?.rosterTotal === "number" ? json.data.rosterTotal : null,
        );
      }
    } catch {
      setMessage("無法載入里別，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOptions();
  }, []);

  useEffect(() => {
    if (!village) {
      setRosterTotal(null);
      return;
    }
    void loadOptions(village);
  }, [village]);

  const villages = options?.villages ?? [];
  const villageCodeByName = options?.villageCodeByName ?? {};

  const parsedCounts = useMemo(
    () => ({
      countDone: Math.max(0, Math.floor(Number(countDone) || 0)),
      countMissed: Math.max(0, Math.floor(Number(countMissed) || 0)),
      countNotFound: Math.max(0, Math.floor(Number(countNotFound) || 0)),
    }),
    [countDone, countMissed, countNotFound],
  );

  const previewTotal = countTotal(parsedCounts);
  const overWarning =
    mode === "count" && rosterTotal != null
      ? overRosterWarning(previewTotal, rosterTotal)
      : null;

  async function submit() {
    setBusy(true);
    setMessage(null);
    setWarnings([]);
    try {
      const body: Record<string, unknown> = {
        villageName: village,
        villageCode: villageCodeByName[village] || "",
        mode,
        notes,
      };
      if (mode === "count") {
        body.countDone = parsedCounts.countDone;
        body.countMissed = parsedCounts.countMissed;
        body.countNotFound = parsedCounts.countNotFound;
      } else if (mode === "case_codes") {
        body.outcome = outcome;
        body.caseCodesText = caseCodesText;
      } else {
        body.outcome = outcome;
        body.rangeText = rangeText;
      }

      const response = await fetch("/api/desk/mohw-progress/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json()) as {
        data?: { warnings?: string[]; report?: { report_id?: string }; marks_written?: number };
        error?: { message?: string };
      };
      if (!response.ok) {
        setMessage(json.error?.message ?? "送出失敗");
        return;
      }
      const warn = json.data?.warnings ?? [];
      setWarnings(warn);
      const reportId = json.data?.report?.report_id || "";
      setMessage(
        mode === "count"
          ? `已送出手填人數（${reportId}）。同里最新一筆會覆蓋先前人數。`
          : `已送出（${reportId}），個案標記 ${json.data?.marks_written ?? 0} 筆。`,
      );
      if (mode === "count") {
        setCountDone("0");
        setCountMissed("0");
        setCountNotFound("0");
      }
      setCaseCodesText("");
      setRangeText("");
      setNotes("");
    } catch {
      setMessage("送出失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    Boolean(village) &&
    !busy &&
    (mode === "count"
      ? previewTotal > 0
      : mode === "case_codes"
        ? caseCodesText.trim().length > 0
        : rangeText.trim().length > 0);

  return (
    <div className="space-y-4">
      <PageIntro
        icon={ClipboardCheck}
        eyebrow="獨立回報"
        title="衛福部進度回報"
        description="給已直接 KEY 入衛福部系統的訪查員／承辦使用。此頁只統計進度，不會建立關懷表、也不寫入匯出路徑。"
      />

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <div className="flex gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">不建立關懷表</p>
            <p className="mt-1 text-amber-900/90">
              資料會寫入「MOHW進度回報」試算表分頁，來源標記為「MOHW直KEY」。同里手填人數以最新送出為準。
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
            onChange={(event) => setVillage(event.target.value)}
          >
            <option value="">{loading ? "載入中…" : "請選擇里別"}</option>
            {villages.map((name) => (
              <option key={name} value={name}>
                {formatYongheVillageSelectLabel(name, villageCodeByName[name])}
              </option>
            ))}
          </select>
          {village && rosterTotal != null && (
            <p className="mt-1 text-xs text-muted-foreground">名冊人數：{rosterTotal}</p>
          )}
          {options?.scope?.label && (
            <p className="mt-1 text-xs text-muted-foreground">範圍：{options.scope.label}</p>
          )}
        </div>

        <div>
          <p className="text-sm font-medium">輸入方式</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(
              [
                ["count", "手填人數"],
                ["case_codes", "個案編碼"],
                ["range", "整批區間"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`rounded-md border px-2 py-2 text-sm ${
                  mode === value ? "border-primary bg-primary/10 text-primary" : "bg-background"
                }`}
                onClick={() => setMode(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === "count" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField label="已完成" value={countDone} onChange={setCountDone} />
            <NumberField label="未遇" value={countMissed} onChange={setCountMissed} />
            <NumberField label="查無此人" value={countNotFound} onChange={setCountNotFound} />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">結果</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {MOHW_PROGRESS_OUTCOMES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      outcome === item
                        ? "border-primary bg-primary/10 text-primary"
                        : "bg-background"
                    }`}
                    onClick={() => setOutcome(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            {mode === "case_codes" ? (
              <div>
                <label className="text-sm font-medium">個案編碼</label>
                <textarea
                  className="mt-1 min-h-[96px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="可多筆，空白或逗號分隔，例如 YH-115-A100"
                  value={caseCodesText}
                  onChange={(event) => setCaseCodesText(event.target.value)}
                />
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium">整批區間</label>
                <input
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="例如 1-41、永成1-41、YH-115-A100-A120"
                  value={rangeText}
                  onChange={(event) => setRangeText(event.target.value)}
                />
              </div>
            )}
          </div>
        )}

        <div>
          <label className="text-sm font-medium">備註（選填）</label>
          <input
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="例如：已於衛福部平台完成 KEY"
          />
        </div>

        {overWarning && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {overWarning}
          </p>
        )}

        <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
          {busy ? "送出中…" : "送出進度"}
        </Button>

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

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
