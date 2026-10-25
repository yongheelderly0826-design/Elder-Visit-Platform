import { AppShell } from "@/components/layout/app-shell";
import { VillageAdminsPanel } from "@/components/manage/village-admins-panel";

export default function VillageAdminsPage() {
  return (
    <AppShell active="villageAdmins">
      <VillageAdminsPanel />
    </AppShell>
  );
}
