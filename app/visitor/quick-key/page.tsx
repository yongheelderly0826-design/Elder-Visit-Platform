import { AppShell } from "@/components/layout/app-shell";
import { QuickKeyPanel } from "@/components/manage/quick-key-panel";
import { VisitorWorkflowBar } from "@/components/visitor/visitor-workflow-bar";
import { requireVisitorSession } from "@/lib/auth/visitor-guard";
import { resolveVisitorIdentity } from "@/lib/domain/demo-visitor-link";

export default async function VisitorQuickKeyPage() {
  const session = await requireVisitorSession({ next: "/visitor/login?next=/visitor/quick-key" });
  const { visitorId, name } = resolveVisitorIdentity(session);

  return (
    <AppShell active="quickKey">
      <VisitorWorkflowBar active="tasks" />
      <QuickKeyPanel
        mode="visitor"
        lockedVisitor={visitorId ? { id: visitorId, name: name || session.name } : null}
        returnPath="/visitor/quick-key"
      />
    </AppShell>
  );
}
