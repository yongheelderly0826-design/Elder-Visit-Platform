import { AppShell } from "@/components/layout/app-shell";
import { DailyVisitReportPanel } from "@/components/daily-visits/daily-visit-report-panel";
import { ManagementWorkflowBar } from "@/components/manage/management-workflow-bar";

export default function ManagerDailyVisitsPage() {
  return (
    <AppShell active="dailyVisits">
      <div className="grid gap-4">
        <ManagementWorkflowBar active="in_progress" />
        <DailyVisitReportPanel />
      </div>
    </AppShell>
  );
}
