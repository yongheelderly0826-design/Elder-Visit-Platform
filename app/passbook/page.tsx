import { redirect } from "next/navigation";

/** Short alias → temporary public passbook channel */
export default async function PassbookAliasPage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string; code?: string }>;
}) {
  const params = await searchParams;
  const code = String(params.k ?? params.code ?? "").trim();
  if (code) {
    redirect(`/volunteer/passbook/${encodeURIComponent(code)}`);
  }
  redirect("/volunteer/passbook");
}
