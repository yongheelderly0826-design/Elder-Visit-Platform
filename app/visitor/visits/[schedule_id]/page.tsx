import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { VisitDialogueForm } from "@/components/visitor/visit-dialogue-form";
import { VisitorWorkflowBar } from "@/components/visitor/visitor-workflow-bar";
import { requireVisitorSession } from "@/lib/auth/visitor-guard";
import { parseCareformAnswers } from "@/lib/domain/manager-care-form-desk";
import { resolveVisitorIdentity } from "@/lib/domain/demo-visitor-link";
import { gasClient } from "@/lib/gas-client";
import { getRepository } from "@/lib/repositories";

export default async function VisitDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ schedule_id: string }>;
  searchParams: Promise<{ return?: string; villageCode?: string }>;
}) {
  const session = await requireVisitorSession();
  const { schedule_id: scheduleId } = await params;
  const query = await searchParams;
  const task = await getRepository().getVisitTask(scheduleId);

  if (!task) {
    notFound();
  }

  const { visitorId } = resolveVisitorIdentity(session);
  if (visitorId && task.schedule.visitorId && task.schedule.visitorId !== visitorId) {
    notFound();
  }

  const readonly = task.schedule.status === "submitted";
  const submittedAnswers = readonly
    ? parseCareformAnswers(await gasClient.careform.get(scheduleId).catch(() => null))
    : undefined;

  const villageCode = String(query.villageCode ?? "").trim();
  const listReturnPath =
    query.return === "/visitor/quick-key"
      ? villageCode
        ? `/visitor/quick-key?villageCode=${encodeURIComponent(villageCode)}`
        : "/visitor/quick-key"
      : undefined;

  return (
    <AppShell active={listReturnPath ? "quickKey" : "tasks"}>
      <VisitorWorkflowBar active="visit" />
      <VisitDialogueForm
        elderCase={task.elderCase}
        schedule={task.schedule}
        readonly={readonly}
        initialAnswers={submittedAnswers}
        listReturnPath={listReturnPath}
      />
    </AppShell>
  );
}
