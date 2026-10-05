import { requireVisitorSession } from "@/lib/auth/visitor-guard";
import { CheckCircle2, ClipboardCheck, ListTodo } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { DayCompletePanel } from "@/components/visitor/day-complete-panel";
import { TaskCard } from "@/components/visitor/task-card";
import { VisitorWorkflowBar } from "@/components/visitor/visitor-workflow-bar";
import { resolveVisitorIdentity } from "@/lib/domain/demo-visitor-link";
import { getRepository } from "@/lib/repositories";

export default async function VisitorTasksPage() {
  const session = await requireVisitorSession();
  const { visitorId, name } = resolveVisitorIdentity(session);
  const repository = getRepository();
  const [tasks, stats] = visitorId
    ? await Promise.all([
        repository.getVisitorTasks(visitorId),
        repository.getVisitorVisitStats(visitorId),
      ])
    : [[], { pending: 0, completed: 0, total: 0 }];
  const remainingTasks = tasks.filter(
    ({ schedule }) =>
      schedule.status === "pending" ||
      schedule.status === "in_progress" ||
      schedule.status === "needs_follow_up",
  ).length;

  return (
    <AppShell active="tasks">
      <section className="rounded-lg border bg-card p-4">
        <h1 className="text-2xl font-semibold">訪員任務</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {name ? `${name} 的` : "今日"}
          任務依 Workspace、訪員資格、風險等級與訪視次數排序。到宅請先拍門牌簽到。
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          流程：完成關懷表填報 → 可匯出衛福部資料 → 稽核核銷；未遇則不同時段拍照，滿三次可結案。
        </p>
      </section>
      <VisitorWorkflowBar active="tasks" />

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-lg border bg-card p-4">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ListTodo className="h-3.5 w-3.5" />
            待訪視
          </p>
          <p className="mt-1 text-2xl font-semibold">{stats.pending}</p>
        </article>
        <article className="rounded-lg border bg-card p-4">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" />
            已完成訪視
          </p>
          <p className="mt-1 text-2xl font-semibold text-primary">{stats.completed}</p>
        </article>
        <article className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">累計派案</p>
          <p className="mt-1 text-2xl font-semibold">{stats.total}</p>
          <p className="mt-1 text-xs text-muted-foreground">核銷明細請看「核銷」分頁</p>
        </article>
      </section>

      <DayCompletePanel
        totalTasks={tasks.length}
        remainingTasks={remainingTasks}
        visitorName={name}
      />

      {tasks.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="目前沒有待辦訪視"
          description="已完成的訪視請看上方統計與「核銷」分頁；承辦新派案後會出現在這裡。"
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
