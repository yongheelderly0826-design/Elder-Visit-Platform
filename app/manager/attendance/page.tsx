import { AppShell } from "@/components/layout/app-shell";
import { AttendanceManagerPanel } from "@/components/attendance/attendance-manager-panel";

export default function ManagerAttendancePage() {
  return (
    <AppShell active="attendance">
      <AttendanceManagerPanel />
    </AppShell>
  );
}
