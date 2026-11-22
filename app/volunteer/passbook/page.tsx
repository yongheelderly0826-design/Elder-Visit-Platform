import { PassbookSubmitPanel } from "@/components/volunteer/passbook-submit-panel";

export default async function VolunteerPassbookPage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string; code?: string }>;
}) {
  const params = await searchParams;
  const initialCampaignCode = String(params.k ?? params.code ?? "").trim();
  return <PassbookSubmitPanel initialCampaignCode={initialCampaignCode} />;
}
