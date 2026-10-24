import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { CareFormDeskPanel } from "@/components/manage/care-form-desk-panel";

export default async function ManagerCareFormsPage({
  searchParams,
}: {
  searchParams: Promise<{ caseId?: string }>;
}) {
  const role = (await cookies()).get("demo_role")?.value;
  if (role === "visitor") redirect("/visitor/home");
  const params = await searchParams;
  return (
    <AppShell active="careForms">
      <CareFormDeskPanel presetCaseId={params.caseId} />
    </AppShell>
  );
}
