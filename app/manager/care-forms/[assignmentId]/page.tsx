import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { VisitDialogueForm } from "@/components/visitor/visit-dialogue-form";
import {
  mapDeskVisitor,
  parseCareformAnswers,
  parseCareformSubmissionSeed,
} from "@/lib/domain/manager-care-form-desk";
import { gasClient } from "@/lib/gas-client";
import { getRepository } from "@/lib/repositories";

export default async function ManagerCareFormFillPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{
    date?: string;
    start?: string;
    end?: string;
    return?: string;
    villageCode?: string;
    missedSlot?: string;
    paperKey?: string;
  }>;
}) {
  const role = (await cookies()).get("demo_role")?.value;
  if (role === "visitor") redirect("/visitor/home");

  const { assignmentId } = await params;
  const query = await searchParams;
  const task = await getRepository().getVisitTask(assignmentId);
  if (!task) notFound();

  const visitors = ((await gasClient.visitors.list().catch(() => [])) as Record<string, unknown>[])
    .map(mapDeskVisitor)
    .filter((item) => item.id && item.name)
    .sort((a, b) => Number(b.status === "已核准") - Number(a.status === "已核准"));
  const visitor = visitors.find((item) => item.id === task.schedule.visitorId);
  const existingCareform = await gasClient.careform.get(assignmentId).catch(() => null);
  const existingAnswers = parseCareformAnswers(existingCareform);
  const submissionSeed = parseCareformSubmissionSeed(existingCareform);
  const allowedReturns = new Set([
    "/manager/care-forms",
    "/desk/care-forms",
    "/desk/quick-key",
    "/manager/audit",
  ]);
  const deskReturnPath = allowedReturns.has(String(query.return ?? ""))
    ? String(query.return)
    : "/desk/care-forms";
  const fromAudit = deskReturnPath === "/manager/audit";
  const villageCode = String(query.villageCode ?? "").trim();
  const listReturnPath =
    deskReturnPath === "/desk/quick-key"
      ? villageCode
        ? `/desk/quick-key?villageCode=${encodeURIComponent(villageCode)}`
        : "/desk/quick-key"
      : fromAudit
        ? "/manager/audit"
        : undefined;

  return (
    <AppShell
      active={fromAudit ? "audit" : deskReturnPath === "/desk/quick-key" ? "quickKey" : "careForms"}
    >
      <VisitDialogueForm
        elderCase={task.elderCase}
        schedule={{
          ...task.schedule,
          visitDate: query.date || task.schedule.visitDate,
        }}
        variant="manager_desk"
        // 稽核／建檔路徑：已送出仍可改正（CW2 等）並覆寫 Sheets；訪員端仍為 readonly。
        readonly={false}
        visitorName={visitor?.name}
        visitorDirectory={visitors}
        selectedVisitor={visitor}
        deskReturnPath={deskReturnPath}
        listReturnPath={listReturnPath}
        initialAnswers={existingAnswers}
        initialSubmissionSeed={
          submissionSeed.visitResult || submissionSeed.consentSigned != null
            ? {
                ...(submissionSeed.visitResult
                  ? { visitResult: submissionSeed.visitResult }
                  : {}),
                ...(submissionSeed.consentSigned != null
                  ? { consentSigned: submissionSeed.consentSigned }
                  : {}),
              }
            : undefined
        }
        initialTimes={{
          visitDate: query.date || task.schedule.visitDate,
          visitStartTime: query.start,
          visitEndTime: query.end,
        }}
        initialDeskMissedSlot={query.missedSlot}
        initialDeskPaperKey={query.paperKey}
      />
    </AppShell>
  );
}
