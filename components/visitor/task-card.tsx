import Link from "next/link";
import { AlertTriangle, Camera, MapPin, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ElderCase, VisitSchedule } from "@/lib/domain/types";
import { getRiskLabel, getVisitStatusLabel } from "@/lib/domain/visits";
import { maskPersonName } from "@/lib/domain/person-name";
import { cn } from "@/lib/utils";

export function TaskCard({
  elderCase,
  schedule,
}: {
  elderCase: ElderCase;
  schedule: VisitSchedule;
}) {
  return (
    <article className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{maskPersonName(elderCase.name)}</h2>
            <span
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium",
                elderCase.riskLevel === "high" && "bg-destructive text-destructive-foreground",
                elderCase.riskLevel === "medium" && "bg-accent text-accent-foreground",
                elderCase.riskLevel === "low" && "bg-secondary text-secondary-foreground",
              )}
            >
              {getRiskLabel(elderCase.riskLevel)}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{elderCase.caseCode}</p>
        </div>
        <span className="rounded-md bg-secondary px-2 py-1 text-xs">
          {getVisitStatusLabel(schedule.status)}
        </span>
      </div>

      <div className="mt-4 space-y-2 text-sm text-muted-foreground">
        <p className="flex items-start gap-2">
          <UserRound className="mt-0.5 h-4 w-4 shrink-0" />
          {elderCase.age} 歲 · 第 {schedule.visitAttempt} 次訪視
        </p>
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
          {elderCase.address}
        </p>
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {schedule.assignmentReason}
        </p>
      </div>

      {schedule.visitAttempt > 1 && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">未遇續訪任務</p>
          <p className="mt-1 flex items-start gap-2 leading-6">
            <Camera className="mt-0.5 h-4 w-4 shrink-0" />
            若本次仍未遇，送出前需補上現場照片與自動定位。
          </p>
        </div>
      )}

      <Button asChild className="mt-4 w-full">
        <Link href={`/visitor/visits/${schedule.id}`}>
          {schedule.status === "needs_follow_up" ? "接續訪視" : "開始填報"}
        </Link>
      </Button>
    </article>
  );
}
