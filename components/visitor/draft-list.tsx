"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FilePenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { VisitorWorkflowBar } from "@/components/visitor/visitor-workflow-bar";
import type { VisitDraft } from "@/lib/domain/offline-drafts";
import { elderCases, visitSchedules } from "@/lib/domain/mock-data";
import { getVisitDraftKey } from "@/lib/domain/offline-drafts";
import { maskPersonName } from "@/lib/domain/person-name";

type DraftItem = {
  scheduleId: string;
  draft: VisitDraft;
};

export function DraftList() {
  const [drafts, setDrafts] = useState<DraftItem[]>([]);

  useEffect(() => {
    setDrafts(
      visitSchedules.flatMap((schedule) => {
        const stored = window.localStorage.getItem(getVisitDraftKey(schedule.id));

        if (!stored) {
          return [];
        }

        return [
          {
            scheduleId: schedule.id,
            draft: JSON.parse(stored) as VisitDraft,
          },
        ];
      }),
    );
  }, []);

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <FilePenLine className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold">離線草稿</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          訪查填報會自動保存在本機，送出成功後會清除。
        </p>
      </section>
      <VisitorWorkflowBar active="drafts" />

      {drafts.length === 0 ? (
        <EmptyState
          icon={FilePenLine}
          title="目前沒有離線草稿"
          description="訪查填寫後若尚未送出，草稿會保存在這裡，方便稍後接續處理。"
        />
      ) : (
        <section className="grid gap-3 md:grid-cols-2">
          {drafts.map((item) => (
            <article key={item.scheduleId} className="rounded-lg border bg-card p-4">
              <h2 className="font-semibold">
                {maskPersonName(getDraftCaseName(item.scheduleId)) || item.scheduleId}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {item.draft.visitResult} · {item.draft.healthStatus} ·{" "}
                {new Date(item.draft.updatedAt).toLocaleString("zh-TW")}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                草稿會自動續存，送出成功後才會從本機清除。
              </p>
              <Button asChild className="mt-4 w-full">
                <Link href={`/visitor/visits/${item.scheduleId}`}>繼續填報</Link>
              </Button>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function getDraftCaseName(scheduleId: string) {
  const schedule = visitSchedules.find((item) => item.id === scheduleId);
  return elderCases.find((elderCase) => elderCase.id === schedule?.caseId)?.name;
}
