import QRCode from "qrcode";
import { AppShell } from "@/components/layout/app-shell";
import {
  VisitorHomePanel,
  type BadgeData,
} from "@/components/visitor/visitor-home-panel";
import { requireVisitorSession } from "@/lib/auth/visitor-guard";
import { resolvePhysicalBadgeProfile } from "@/lib/domain/physical-visitor-badge";
import { buildVolunteerBadgePayload } from "@/lib/domain/volunteer-badge-qr";

export default async function VisitorHomePage() {
  const session = await requireVisitorSession();
  let initialBadge: BadgeData | null = null;

  if (session.visitorId) {
    const physical = resolvePhysicalBadgeProfile({
      visitorId: session.visitorId,
      email: session.email,
      name: session.name,
    });
    const payload = buildVolunteerBadgePayload(session.visitorId);
    initialBadge = {
      visitorId: session.visitorId,
      name: physical.displayName || session.name || "訪員",
      groupName: "",
      badgeNo: "",
      payload,
      qrUrl: await QRCode.toDataURL(payload, { width: 480, margin: 1 }),
      email: session.email,
    };
  }

  return (
    <AppShell active="badge">
      <VisitorHomePanel
        cacheIdentity={session.visitorId}
        initialBadge={initialBadge}
        visitorEmail={session.email}
      />
    </AppShell>
  );
}
