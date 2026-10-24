import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { VisitDialogueForm } from "@/components/visitor/visit-dialogue-form";
import { mapDeskVisitor } from "@/lib/domain/manager-care-form-desk";
import { gasClient } from "@/lib/gas-client";
import { getRepository } from "@/lib/repositories";

export default async function ManagerCareFormFillPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ date?: string; start?: string; end?: string }>;
}) {
  const role = (await cookies()).get("demo_role")?.value;
  if (role === "visitor") redirect("/visitor/home");

  const { assignmentId } = await params;
  const query = await searchParams;
  const task = await getRepository().getVisitTask(assignmentId);
  if (!task) notFound();

  const visitors = (await gasClient.visitors.list().catch(() => [])) as Record<string, unknown>[];
  const visitor = visitors.map(mapDeskVisitor).find((item) => item.id === task.schedule.visitorId);

  return (
    <AppShell active="careForms">
      <VisitDialogueForm
        elderCase={task.elderCase}
        schedule={{
          ...task.schedule,
          visitDate: query.date || task.schedule.visitDate,
        }}
        variant="manager_desk"
        visitorName={visitor?.name}
        initialTimes={{
          visitDate: query.date || task.schedule.visitDate,
          visitStartTime: query.start,
          visitEndTime: query.end,
        }}
      />
    </AppShell>
  );
}
