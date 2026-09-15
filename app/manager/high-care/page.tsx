import { AppShell } from "@/components/layout/app-shell";
import { HighCareDashboard } from "@/components/manage/high-care-dashboard";

export default function HighCarePage() {
  return (
    <AppShell active="highCare">
      <HighCareDashboard />
    </AppShell>
  );
}
