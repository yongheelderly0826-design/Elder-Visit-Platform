import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { CareFormDeskPanel } from "@/components/manage/care-form-desk-panel";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";

export default async function DeskCareFormsPage({
  searchParams,
}: {
  searchParams: Promise<{ caseId?: string }>;
}) {
  const jar = await cookies();
  const role = jar.get("demo_role")?.value;
  if (role === "visitor") redirect("/visitor/home");

  const manager = decodeManagerSession(jar.get(SESSION_COOKIE)?.value);
  if (!manager && !role) {
    redirect("/temp-key?next=/desk/care-forms");
  }

  const params = await searchParams;
  return (
    <AppShell active="careForms">
      <CareFormDeskPanel presetCaseId={params.caseId} entry="desk" />
    </AppShell>
  );
}
