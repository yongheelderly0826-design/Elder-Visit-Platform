import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { VisitDialogueForm } from "@/components/visitor/visit-dialogue-form";
import { VisitorWorkflowBar } from "@/components/visitor/visitor-workflow-bar";
import { requireVisitorSession } from "@/lib/auth/visitor-guard";
import { FIELD_SELF_SOURCE_NOTE } from "@/lib/domain/desk-care-batch";
import { mapDeskVisitor, parseCareformAnswers } from "@/lib/domain/manager-care-form-desk";
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

  const { visitorId, name: visitorName } = resolveVisitorIdentity(session);
  if (visitorId && task.schedule.visitorId && task.schedule.visitorId !== visitorId) {
    notFound();
  }

  const readonly = task.schedule.status === "submitted";
  const submittedAnswers = readonly
    ? parseCareformAnswers(await gasClient.careform.get(scheduleId).catch(() => null))
    : undefined;

  const villageCode = String(query.villageCode ?? "").trim();
  const fromQuickKey = query.return === "/visitor/quick-key";
  const fieldSelfKey = String(task.schedule.assignmentReason ?? "").includes(
    FIELD_SELF_SOURCE_NOTE,
  );
  const useDeskDefaults = fromQuickKey || fieldSelfKey;
  const listReturnPath = fromQuickKey
    ? villageCode
      ? `/visitor/quick-key?villageCode=${encodeURIComponent(villageCode)}`
      : "/visitor/quick-key"
    : undefined;

  // 完整清單（含身分證）：社政／民政姓名欄搜尋帶入。slim 需 GAS slim2 才有 id_number。
  const visitorDirectory = (
    (await gasClient.visitors.list().catch(() => [])) as Record<string, unknown>[]
  )
    .map(mapDeskVisitor)
    .filter((item) => item.id && item.name)
    .sort((a, b) => Number(b.status === "已核准") - Number(a.status === "已核准"));

  let selectedVisitor = null as ReturnType<typeof mapDeskVisitor> | null;
  if (visitorId) {
    selectedVisitor = visitorDirectory.find((item) => item.id === visitorId) ?? null;
    if (!selectedVisitor) {
      try {
        const row = (await gasClient.visitors.get(visitorId)) as Record<string, unknown> | null;
        if (row) selectedVisitor = mapDeskVisitor(row);
      } catch {
        selectedVisitor = null;
      }
    }
  }
  if (!selectedVisitor && (visitorId || visitorName)) {
    selectedVisitor = {
      id: visitorId || "",
      name: visitorName || session.name || "",
      badgeNo: "",
      status: "",
      nationalId: "",
      phone: "",
      workerGroup: "unknown",
    };
  }

  return (
    <AppShell active={listReturnPath ? "quickKey" : "tasks"}>
      <VisitorWorkflowBar active="visit" />
      <VisitDialogueForm
        elderCase={task.elderCase}
        schedule={task.schedule}
        readonly={readonly}
        initialAnswers={submittedAnswers}
        listReturnPath={listReturnPath}
        visitorName={selectedVisitor?.name || visitorName || session.name}
        visitorDirectory={visitorDirectory}
        selectedVisitor={selectedVisitor ?? undefined}
        formDefaults={useDeskDefaults ? "desk" : "roster"}
      />
    </AppShell>
  );
}
