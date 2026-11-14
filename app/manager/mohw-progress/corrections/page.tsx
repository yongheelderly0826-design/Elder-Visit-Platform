import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { MohwProgressCorrections } from "@/components/manage/mohw-progress-corrections";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";

export default async function ManagerMohwProgressCorrectionsPage() {
  const jar = await cookies();
  const role = jar.get("demo_role")?.value;
  if (role === "visitor") redirect("/visitor/home");
  if (role === "desk_clerk") redirect("/desk/care-forms");

  const manager = decodeManagerSession(jar.get(SESSION_COOKIE)?.value);
  if (!manager && !role) {
    redirect("/yonghe?next=/manager/mohw-progress/corrections");
  }
  if (role && role !== "workspace_owner" && role !== "workspace_manager" && !manager) {
    redirect("/manager/mohw-progress");
  }

  return (
    <AppShell active="mohwProgressCorrections">
      <MohwProgressCorrections />
    </AppShell>
  );
}
