import QRCode from "qrcode";
import { AppShell } from "@/components/layout/app-shell";
import {
  VisitorHomePanel,
  type BadgeData,
} from "@/components/visitor/visitor-home-panel";
import { requireVisitorSession } from "@/lib/auth/visitor-guard";
import { buildVolunteerBadgePayload } from "@/lib/domain/volunteer-badge-qr";

export default async function VisitorHomePage() {
  const session = await requireVisitorSession();
  let initialBadge: BadgeData | null = null;

  if (session.visitorId) {
    const payload = buildVolunteerBadgePayload(session.visitorId);
    initialBadge = {
      visitorId: session.visitorId,
      name: session.name || "訪員",
      groupName: "",
      badgeNo: "",
      payload,
      qrUrl: await QRCode.toDataURL(payload, { width: 480, margin: 1 }),
    };
  }

  return (
    <AppShell active="badge">
      <VisitorHomePanel
        cacheIdentity={session.visitorId}
        initialBadge={initialBadge}
      />
    </AppShell>
  );
}
