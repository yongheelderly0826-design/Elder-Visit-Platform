import { AppShell } from "@/components/layout/app-shell";
import { VisitorConsentForm } from "@/components/consent/visitor-consent-form";
import { requireVisitorSession } from "@/lib/auth/visitor-guard";
import { getDemoVisitorLink } from "@/lib/domain/demo-visitor-link";

export default async function VisitorConsentsPage() {
  const session = await requireVisitorSession({ next: "/visitor/login?next=/visitor/consents" });
  const link = getDemoVisitorLink(session.email);

  return (
    <AppShell active="visitorConsents">
      <VisitorConsentForm
        visitorName={session.name || link?.name || ""}
        visitorId={session.visitorId || link?.visitorId || ""}
      />
    </AppShell>
  );
}
