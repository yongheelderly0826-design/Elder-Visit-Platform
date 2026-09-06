import { VolunteerBadgePanel } from "@/components/attendance/volunteer-badge-panel";

export default async function VolunteerBadgePage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const params = await searchParams;
  return <VolunteerBadgePanel initialVisitorId={params.v ?? ""} />;
}
