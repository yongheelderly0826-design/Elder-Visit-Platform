import { AppShell } from "@/components/layout/app-shell";
import { VisitorHoursPanel } from "@/components/visitor/visitor-hours-panel";
import { VisitorWorkflowBar } from "@/components/visitor/visitor-workflow-bar";
import { requireVisitorSession } from "@/lib/auth/visitor-guard";

export default async function VisitorHoursPage() {
  await requireVisitorSession();

  return (
    <AppShell active="tasks">
      <VisitorWorkflowBar active="hours" />
      <VisitorHoursPanel />
    </AppShell>
  );
}
