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
  searchParams: Promise<{
    date?: string;
    start?: string;
    end?: string;
    return?: string;
    villageCode?: string;
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
    .filter((item) => item.id && item.name);
  const visitor = visitors.find((item) => item.id === task.schedule.visitorId);
  const allowedReturns = new Set([
    "/manager/care-forms",
    "/desk/care-forms",
    "/desk/quick-key",
  ]);
  const deskReturnPath = allowedReturns.has(String(query.return ?? ""))
    ? String(query.return)
    : "/desk/care-forms";
  const villageCode = String(query.villageCode ?? "").trim();
  const listReturnPath =
    deskReturnPath === "/desk/quick-key"
      ? villageCode
        ? `/desk/quick-key?villageCode=${encodeURIComponent(villageCode)}`
        : "/desk/quick-key"
      : undefined;

  return (
    <AppShell active={deskReturnPath === "/desk/quick-key" ? "quickKey" : "careForms"}>
      <VisitDialogueForm
        elderCase={task.elderCase}
        schedule={{
          ...task.schedule,
          visitDate: query.date || task.schedule.visitDate,
        }}
        variant="manager_desk"
        visitorName={visitor?.name}
        visitorDirectory={visitors}
        selectedVisitor={visitor}
        deskReturnPath={deskReturnPath}
        listReturnPath={listReturnPath}
        initialTimes={{
          visitDate: query.date || task.schedule.visitDate,
          visitStartTime: query.start,
          visitEndTime: query.end,
        }}
      />
    </AppShell>
  );
}
