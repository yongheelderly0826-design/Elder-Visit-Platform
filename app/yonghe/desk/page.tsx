import { redirect } from "next/navigation";

/** 舊網址保留導向，避免書籤失效。正式入口改為 /temp-key。 */
export default async function LegacyYongheDeskLoginRedirect({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = String(params.next ?? "").trim();
  if (next.startsWith("/") && !next.startsWith("//")) {
    redirect(`/temp-key?next=${encodeURIComponent(next)}`);
  }
  redirect("/temp-key");
}
