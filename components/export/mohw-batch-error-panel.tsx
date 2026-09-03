"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ParsedBatchError = {
  id: string;
  raw: string;
  cell: string | null;
  colLetter: string | null;
  excelRow: number | null;
  message: string;
  caseId?: string;
  caseName?: string;
};

export function parseMohwBatchErrorLine(
  line: string,
  meta?: { caseId?: string; caseName?: string },
): ParsedBatchError {
  const trimmed = line.trim();
  const match = trimmed.match(/^([A-Z]+)(\d+)\s+(.+)$/i);
  if (!match) {
    return {
      id: `${meta?.caseId ?? "x"}:${trimmed}`,
      raw: trimmed,
      cell: null,
      colLetter: null,
      excelRow: null,
      message: trimmed,
      caseId: meta?.caseId,
      caseName: meta?.caseName,
    };
  }

  return {
    id: `${meta?.caseId ?? "x"}:${match[1].toUpperCase()}${match[2]}:${match[3]}`,
    raw: trimmed,
    cell: `${match[1].toUpperCase()}${match[2]}`,
    colLetter: match[1].toUpperCase(),
    excelRow: Number(match[2]),
    message: match[3],
    caseId: meta?.caseId,
    caseName: meta?.caseName,
  };
}

export function MohwBatchErrorPanel({
  errorLines,
  skipped = [],
  caseLabels = {},
  title = "批次驗證／匯出錯誤",
}: {
  errorLines: string[];
  skipped?: Array<{ case_id: string; reason: string }>;
  caseLabels?: Record<string, string>;
  title?: string;
}) {
  const [query, setQuery] = useState("");
  const [onlyCellErrors, setOnlyCellErrors] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const parsed = useMemo(
    () =>
      errorLines.map((line) => {
        const rowMatch = line.match(/^[A-Z]+(\d+)\s+/i);
        const excelRow = rowMatch ? Number(rowMatch[1]) : null;
        // Excel data rows start at 2; map to ordinal when possible
        return parseMohwBatchErrorLine(line, {
          caseName: excelRow ? `列 ${excelRow}` : undefined,
        });
      }),
    [errorLines],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parsed.filter((item) => {
      if (onlyCellErrors && !item.cell) return false;
      if (!q) return true;
      return item.raw.toLowerCase().includes(q);
    });
  }, [parsed, query, onlyCellErrors]);

  const byExcelRow = useMemo(() => {
    const map = new Map<number | "other", ParsedBatchError[]>();
    for (const item of filtered) {
      const key = item.excelRow ?? "other";
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] === "other") return 1;
      if (b[0] === "other") return -1;
      return a[0] - b[0];
    });
  }, [filtered]);

  const cellCount = parsed.filter((item) => item.cell).length;

  async function copyAll() {
    const text = [
      ...errorLines,
      ...skipped.map((item) => `略過 ${item.case_id}：${item.reason}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (errorLines.length === 0 && skipped.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-xs text-red-800/80">
            共 {errorLines.length} 筆錯誤
            {cellCount ? `（含儲存格座標 ${cellCount}）` : ""}
            {skipped.length ? ` · 略過 ${skipped.length} 筆` : ""}
            {filtered.length !== parsed.length ? ` · 目前顯示 ${filtered.length}` : ""}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void copyAll()}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "已複製" : "複製全部"}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Filter className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-red-800/50" />
          <input
            className="h-9 w-full rounded-md border border-red-200 bg-white pl-8 pr-3 text-xs"
            placeholder="篩選錯誤文字／座標（如 I3、身分證）"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={onlyCellErrors}
            onChange={(event) => setOnlyCellErrors(event.target.checked)}
          />
          只看有儲存格座標
        </label>
      </div>

      <div className="mt-3 max-h-72 space-y-2 overflow-auto">
        {byExcelRow.map(([rowKey, items]) => {
          const rowId = rowKey === "other" ? null : rowKey;
          const open = expandedRow === rowId || (expandedRow === -1 && rowKey === "other");
          const label =
            rowKey === "other"
              ? "其他錯誤"
              : `Excel 第 ${rowKey} 列（約第 ${Math.max(rowKey - 1, 1)} 筆資料）`;

          return (
            <div key={String(rowKey)} className="rounded-md border border-red-200 bg-white">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium"
                onClick={() =>
                  setExpandedRow(open ? null : rowKey === "other" ? -1 : rowKey)
                }
              >
                <span>
                  {label}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {items.length} 錯
                  </span>
                </span>
                <span className="text-muted-foreground">{open ? "收合" : "展開"}</span>
              </button>
              {open ? (
                <ul className="space-y-1 border-t border-red-100 px-3 py-2 font-mono text-xs">
                  {items.map((item) => (
                    <li key={item.id} className="leading-5">
                      {item.cell ? (
                        <span className="mr-2 rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-900">
                          {item.cell}
                        </span>
                      ) : null}
                      {item.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>

      {skipped.length > 0 ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          <p className="font-medium">略過未匯出</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {skipped.map((item) => (
              <li key={item.case_id}>
                <span className="font-mono">{item.case_id}</span>
                {caseLabels[item.case_id] ? ` ${caseLabels[item.case_id]}` : ""}
                ：{item.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
