import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { CaseProgressDashboard } from "@/components/manage/case-progress-dashboard";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";

export default async function ManagerCaseProgressPage() {
  const jar = await cookies();
  const role = jar.get("demo_role")?.value;
  if (role === "visitor") redirect("/visitor/home");
  if (role === "desk_clerk") redirect("/desk/care-forms");

  const manager = decodeManagerSession(jar.get(SESSION_COOKIE)?.value);
  if (!manager && !role) {
    redirect("/yonghe?next=/manager/case-progress");
  }

  return (
    <AppShell active="caseProgress">
      <CaseProgressDashboard />
    </AppShell>
  );
}
