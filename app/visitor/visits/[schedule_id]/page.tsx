import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { VisitDialogueForm } from "@/components/visitor/visit-dialogue-form";
import { VisitorWorkflowBar } from "@/components/visitor/visitor-workflow-bar";
import { requireVisitorSession } from "@/lib/auth/visitor-guard";
import { getDemoVisitorLink } from "@/lib/domain/demo-visitor-link";
import { getRepository } from "@/lib/repositories";

export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ schedule_id: string }>;
}) {
  const session = await requireVisitorSession();
  const { schedule_id: scheduleId } = await params;
  const task = await getRepository().getVisitTask(scheduleId);

  if (!task) {
    notFound();
  }

  const link = getDemoVisitorLink(session.email);
  if (link?.visitorId && task.schedule.visitorId && task.schedule.visitorId !== link.visitorId) {
    notFound();
  }

  return (
    <AppShell active="tasks">
      <VisitorWorkflowBar active="visit" />
      <VisitDialogueForm elderCase={task.elderCase} schedule={task.schedule} />
    </AppShell>
  );
}
