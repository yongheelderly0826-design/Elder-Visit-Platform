import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { WorkerFeeStatsDashboard } from "@/components/manage/worker-fee-stats-dashboard";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";

export default async function ManagerWorkerFeeStatsPage() {
  const jar = await cookies();
  const role = jar.get("demo_role")?.value;
  if (role === "visitor") redirect("/visitor/home");
  if (role === "desk_clerk") redirect("/desk/care-forms");

  const manager = decodeManagerSession(jar.get(SESSION_COOKIE)?.value);
  if (!manager && !role) {
    redirect("/yonghe?next=/manager/worker-fee-stats");
  }

  return (
    <AppShell active="workerFeeStats">
      <WorkerFeeStatsDashboard />
    </AppShell>
  );
}
