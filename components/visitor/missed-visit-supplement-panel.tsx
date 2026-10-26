"use client";

import { missedVisitMinSlots, missedVisitTimeSlots } from "@/lib/domain/visits";
import {
  countCompleteMissedVisitAttempts,
  isMissedVisitAttemptComplete,
  toggleMissedVisitSlot,
  type MissedVisitAttemptDraft,
} from "@/lib/domain/missed-visit-supplement";

export function MissedVisitSupplementPanel({
  attempts,
  activeAttempt,
  onActiveAttemptChange,
  onChange,
}: {
  attempts: MissedVisitAttemptDraft[];
  activeAttempt: number;
  onActiveAttemptChange: (attempt: number) => void;
  onChange: (next: MissedVisitAttemptDraft[]) => void;
}) {
  const completed = countCompleteMissedVisitAttempts(attempts);
  const current =
    attempts.find((item) => item.attempt === activeAttempt) ?? attempts[0] ?? null;

  function patchCurrent(patch: Partial<MissedVisitAttemptDraft>) {
    if (!current) return;
    onChange(
      attempts.map((item) =>
        item.attempt === current.attempt ? { ...item, ...patch } : item,
      ),
    );
  }

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-amber-950">未遇三次補錄（手動補充）</h2>
          <p className="mt-1 text-sm leading-6 text-amber-900/90">
            僅「未遇」才須湊滿 3 次訪視紀錄。實際只去 1–2 次且皆未遇時，請用下方分頁補齊其餘次數；
            每一頁至少勾選 {missedVisitMinSlots} 個不同時段（紙本佐證已備即可）。
          </p>
        </div>
        <p className="rounded-md bg-card px-3 py-1.5 text-sm font-medium text-amber-950">
          已補齊 {completed}/{attempts.length}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {attempts.map((item) => {
          const done = isMissedVisitAttemptComplete(item);
          const active = item.attempt === activeAttempt;
          return (
            <button
              key={item.attempt}
              type="button"
              className={`rounded-md border px-3 py-2 text-sm font-medium ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : done
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-amber-300 bg-card text-amber-950"
              }`}
              onClick={() => onActiveAttemptChange(item.attempt)}
            >
              第 {item.attempt} 次{done ? " ✓" : ""}
            </button>
          );
        })}
      </div>

      {current ? (
        <div className="mt-4 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            訪視日期 *
            <input
              type="date"
              className="h-11 rounded-md border px-3 text-sm"
              value={current.visitDate}
              onChange={(event) => patchCurrent({ visitDate: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            備註
            <input
              className="h-11 rounded-md border px-3 text-sm"
              value={current.notes}
              placeholder="例如：門口無人、電鈴無回應"
              onChange={(event) => patchCurrent({ notes: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            開始時間
            <input
              type="time"
              className="h-11 rounded-md border px-3 text-sm"
              value={current.visitStartTime}
              onChange={(event) => patchCurrent({ visitStartTime: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            結束時間
            <input
              type="time"
              className="h-11 rounded-md border px-3 text-sm"
              value={current.visitEndTime}
              onChange={(event) => patchCurrent({ visitEndTime: event.target.value })}
            />
          </label>
          <div className="sm:col-span-2">
            <p className="text-sm font-medium">
              時段佐證 *（至少 {missedVisitMinSlots} 個）
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {missedVisitTimeSlots.map((slot) => {
                const selected = current.slots.includes(slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    className={`rounded-md border px-3 py-2 text-sm ${
                      selected ? "border-primary bg-primary/10 text-primary" : "bg-background"
                    }`}
                    onClick={() =>
                      patchCurrent({ slots: toggleMissedVisitSlot(current.slots, slot) })
                    }
                  >
                    {slot}
                    {selected ? " · 已備" : ""}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              已選 {current.slots.length} 個時段
              {isMissedVisitAttemptComplete(current) ? " · 本頁已齊" : " · 本頁尚未齊"}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
