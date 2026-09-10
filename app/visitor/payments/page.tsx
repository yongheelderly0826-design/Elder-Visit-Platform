import { AppShell } from "@/components/layout/app-shell";
import { VisitorPaymentsPanel } from "@/components/visitor/visitor-payments-panel";
import { requireVisitorSession } from "@/lib/auth/visitor-guard";

export default async function VisitorPaymentsPage() {
  await requireVisitorSession();

  return (
    <AppShell active="payments">
      <VisitorPaymentsPanel />
    </AppShell>
  );
}
