import { AppShell } from "@/components/layout/app-shell";
import { AuditQueuePanel } from "@/components/audit/audit-queue-panel";
import { ManagementWorkflowBar } from "@/components/manage/management-workflow-bar";

export default function AuditPage() {
  return (
    <AppShell active="audit">
      <section className="rounded-lg border bg-card p-4">
        <h1 className="text-2xl font-semibold">稽核佇列</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          讀取已送出的關懷表；阻擋項目未通過不得核准。核准後進入可匯出批次。
        </p>
      </section>
      <ManagementWorkflowBar active="audit" />
      <AuditQueuePanel />
    </AppShell>
  );
}
