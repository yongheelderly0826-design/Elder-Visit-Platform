import { cookies } from "next/headers";
import { VolunteerClockPanel } from "@/components/attendance/volunteer-clock-panel";
import { AppShell } from "@/components/layout/app-shell";

export default async function VolunteerClockPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const isVisitor = cookieStore.get("demo_role")?.value === "visitor";
  const panel = (
    <VolunteerClockPanel
      initialSiteId={params.site ?? ""}
      visitorWorkspace={isVisitor}
    />
  );

  if (isVisitor) {
    return <AppShell active="clock">{panel}</AppShell>;
  }

  return panel;
}
