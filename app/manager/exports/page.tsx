import { AppShell } from "@/components/layout/app-shell";
import { ExportsWorkspace } from "@/components/export/exports-workspace";

export default function ExportsPage() {
  return (
    <AppShell active="exports">
      <ExportsWorkspace />
    </AppShell>
  );
}
