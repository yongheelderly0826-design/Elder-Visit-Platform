import { requireVisitorSession } from "@/lib/auth/visitor-guard";
import { ClipboardCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskCard } from "@/components/visitor/task-card";
import { VisitorWorkflowBar } from "@/components/visitor/visitor-workflow-bar";
import { getDemoVisitorLink } from "@/lib/domain/demo-visitor-link";
import { getRepository } from "@/lib/repositories";

export default async function VisitorTasksPage() {
  const session = await requireVisitorSession();
  const link = getDemoVisitorLink(session.email);
  const visitorId = link?.visitorId;
  const tasks = visitorId
    ? await getRepository().getVisitorTasks(visitorId)
    : [];

  return (
    <AppShell active="tasks">
      <section className="rounded-lg border bg-card p-4">
        <h1 className="text-2xl font-semibold">訪員任務</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {link?.name || session.name ? `${link?.name || session.name} 的` : "今日"}
          任務依 Workspace、訪員資格、風險等級與訪視次數排序。
        </p>
      </section>
      <VisitorWorkflowBar active="tasks" />

      {tasks.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="目前沒有待辦訪視"
          description="新的派案建立後，會依資格與排序規則顯示在這裡。"
        />
      ) : (
        <section className="grid gap-3 lg:grid-cols-3">
          {tasks.map(({ schedule, elderCase }) => {
            return <TaskCard key={schedule.id} elderCase={elderCase} schedule={schedule} />;
          })}
        </section>
      )}
    </AppShell>
  );
}
