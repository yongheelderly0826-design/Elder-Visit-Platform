import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OfficeKioskPanel } from "@/components/attendance/office-kiosk-panel";
import { SESSION_COOKIE, decodeManagerSession } from "@/lib/auth/google-manager";

export default async function OfficeKioskPage() {
  const store = await cookies();
  const role = store.get("demo_role")?.value;
  const manager = decodeManagerSession(store.get(SESSION_COOKIE)?.value);
  if (!role && !manager) {
    redirect("/login?next=/office/kiosk");
  }
  return <OfficeKioskPanel />;
}
