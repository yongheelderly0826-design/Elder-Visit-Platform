import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { QuickKeyPanel } from "@/components/manage/quick-key-panel";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";

export default async function DeskQuickKeyPage() {
  const jar = await cookies();
  const role = jar.get("demo_role")?.value;
  if (role === "visitor") redirect("/visitor/quick-key");

  const manager = decodeManagerSession(jar.get(SESSION_COOKIE)?.value);
  if (!manager && !role) {
    redirect("/yonghe?next=/desk/quick-key");
  }

  return (
    <AppShell active="quickKey">
      <QuickKeyPanel mode="desk" returnPath="/desk/quick-key" />
    </AppShell>
  );
}
