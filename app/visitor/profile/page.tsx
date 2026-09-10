import { AppShell } from "@/components/layout/app-shell";
import { VisitorWorkflowBar } from "@/components/visitor/visitor-workflow-bar";
import { VisitorProfilePanel } from "@/components/visitor/visitor-profile-panel";
import { requireVisitorSession } from "@/lib/auth/visitor-guard";

export default async function VisitorProfilePage() {
  await requireVisitorSession();

  return (
    <AppShell active="profile">
      <VisitorWorkflowBar active="profile" />
      <VisitorProfilePanel />
    </AppShell>
  );
}
