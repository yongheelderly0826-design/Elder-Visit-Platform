import { PassbookSubmitPanel } from "@/components/volunteer/passbook-submit-panel";

export default async function VolunteerPassbookCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <PassbookSubmitPanel initialCampaignCode={decodeURIComponent(code).trim()} />;
}
