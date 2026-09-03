import { AppShell } from "@/components/layout/app-shell";
import { ExportTool } from "@/components/export/export-tool";
import { MohwExportPanel } from "@/components/export/mohw-export-panel";
import { PaymentBatchPanel } from "@/components/export/payment-batch-panel";
import { ManagementWorkflowBar } from "@/components/manage/management-workflow-bar";

export default function ExportsPage() {
  return (
    <AppShell active="exports">
      <ManagementWorkflowBar active="exports" />
      <div className="space-y-4">
        <MohwExportPanel />
        <PaymentBatchPanel />
        <ExportTool />
      </div>
    </AppShell>
  );
}
