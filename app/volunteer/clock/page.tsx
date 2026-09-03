import { VolunteerClockPanel } from "@/components/attendance/volunteer-clock-panel";

export default async function VolunteerClockPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const params = await searchParams;
  return <VolunteerClockPanel initialSiteId={params.site ?? ""} />;
}
