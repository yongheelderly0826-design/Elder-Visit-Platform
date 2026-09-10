import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { VOLUNTEER_CLOCK_COOKIE } from "@/lib/domain/volunteer-attendance";
import type { WorkspaceRoleKey } from "@/lib/domain/types";

/** Visitor-facing routes: only the visitor role may use them. */
export async function requireVisitorSession(options?: { next?: string }) {
  const cookieStore = await cookies();
  const roleKey = cookieStore.get("demo_role")?.value as WorkspaceRoleKey | undefined;

  if (roleKey !== "visitor") {
    redirect(options?.next ?? "/dashboard");
  }

  return {
    roleKey,
    email: cookieStore.get("demo_email")?.value?.toLowerCase() ?? "",
    name: cookieStore.get("demo_name")?.value ?? "",
    visitorId: cookieStore.get(VOLUNTEER_CLOCK_COOKIE)?.value ?? "",
  };
}

export function isVisitorRole(roleKey: string | null | undefined) {
  return roleKey === "visitor";
}
