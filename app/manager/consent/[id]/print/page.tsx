import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ConsentPrintView } from "@/components/consent/consent-print-view";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";
import { getRoleByKey } from "@/lib/domain/permissions";
import type { WorkspaceRoleKey } from "@/lib/domain/types";

export default async function ConsentPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const cookieStore = await cookies();
  const manager = decodeManagerSession(cookieStore.get(SESSION_COOKIE)?.value);
  const roleKey = (manager?.roleKey ?? cookieStore.get("demo_role")?.value) as
    | WorkspaceRoleKey
    | undefined;
  if (!roleKey) redirect("/login");
  if (roleKey === "visitor" || !getRoleByKey(roleKey).capabilities.includes("consent.manage")) {
    redirect("/dashboard");
  }
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <ConsentPrintView consentId={id} autoPrint={query.print === "1"} />;
}
