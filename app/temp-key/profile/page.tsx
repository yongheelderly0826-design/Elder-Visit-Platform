import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DeskClerkProfilePanel } from "@/components/auth/desk-clerk-profile-panel";

export default async function TempKeyProfilePage() {
  const jar = await cookies();
  const role = jar.get("demo_role")?.value;
  const clerkId = String(jar.get("desk_clerk_id")?.value || "").trim().toUpperCase();
  if (role !== "desk_clerk" || !clerkId) {
    redirect("/temp-key");
  }

  const currentName = String(jar.get("demo_name")?.value || "").trim();
  const needsName = !currentName || /^TEMP-\d{2}$/i.test(currentName);

  return (
    <DeskClerkProfilePanel
      clerkId={clerkId}
      initialName={needsName ? "" : currentName}
    />
  );
}
