import { AppShell } from "@/components/layout/app-shell";
import { VisitorHomePanel } from "@/components/visitor/visitor-home-panel";

export default function VisitorHomePage() {
  return (
    <AppShell active="badge">
      <VisitorHomePanel />
    </AppShell>
  );
}
