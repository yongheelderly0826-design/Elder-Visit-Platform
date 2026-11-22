import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PassbookReviewPanel } from "@/components/manager/passbook-review-panel";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";

export default async function ManagerPassbookPage() {
  const jar = await cookies();
  const manager = decodeManagerSession(jar.get(SESSION_COOKIE)?.value);
  const role = manager?.roleKey ?? jar.get("demo_role")?.value;

  if (role !== "workspace_owner" && role !== "workspace_manager") {
    redirect("/dashboard");
  }

  return (
    <AppShell active="users">
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <PassbookReviewPanel />
      </div>
    </AppShell>
  );
}
