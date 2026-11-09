import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { MohwProgressPanel } from "@/components/manage/mohw-progress-panel";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";

export default async function DeskMohwProgressPage() {
  const jar = await cookies();
  const role = jar.get("demo_role")?.value;
  if (role === "visitor") redirect("/visitor/home");
  if (role === "desk_clerk") redirect("/desk/care-forms");

  const manager = decodeManagerSession(jar.get(SESSION_COOKIE)?.value);
  if (!manager && !role) {
    redirect("/yonghe?next=/desk/mohw-progress");
  }

  return (
    <AppShell active="mohwProgress">
      <MohwProgressPanel />
    </AppShell>
  );
}
