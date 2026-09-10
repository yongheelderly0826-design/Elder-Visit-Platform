import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { VolunteerBadgePanel } from "@/components/attendance/volunteer-badge-panel";

export default async function VolunteerBadgePage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();

  // Authenticated visitors use the canonical workspace route so AppShell and
  // its fixed bottom work bar remain present. Keep this route for the public
  // ID-card/attendance identification flow.
  if (cookieStore.get("demo_role")?.value === "visitor") {
    redirect("/visitor/home");
  }

  return <VolunteerBadgePanel initialVisitorId={params.v ?? ""} />;
}
