import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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
  };
}

export function isVisitorRole(roleKey: string | null | undefined) {
  return roleKey === "visitor";
}
