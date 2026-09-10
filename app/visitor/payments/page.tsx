import { AppShell } from "@/components/layout/app-shell";
import { VisitorPaymentsPanel } from "@/components/visitor/visitor-payments-panel";

export default function VisitorPaymentsPage() {
  return (
    <AppShell active="payments">
      <VisitorPaymentsPanel />
    </AppShell>
  );
}
