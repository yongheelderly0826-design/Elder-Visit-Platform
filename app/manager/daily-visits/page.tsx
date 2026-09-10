import { AppShell } from "@/components/layout/app-shell";
import { DailyVisitReportPanel } from "@/components/daily-visits/daily-visit-report-panel";

export default function ManagerDailyVisitsPage() {
  return (
    <AppShell active="dailyVisits">
      <DailyVisitReportPanel />
    </AppShell>
  );
}
