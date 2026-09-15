import { AppShell } from "@/components/layout/app-shell";
import { VisitorConsentForm } from "@/components/consent/visitor-consent-form";
import { requireVisitorSession } from "@/lib/auth/visitor-guard";
import { resolveVisitorIdentity } from "@/lib/domain/demo-visitor-link";

export default async function VisitorConsentsPage() {
  const session = await requireVisitorSession({ next: "/visitor/login?next=/visitor/consents" });
  const { visitorId, name } = resolveVisitorIdentity(session);

  return (
    <AppShell active="visitorConsents">
      <VisitorConsentForm
        visitorName={name}
        visitorId={visitorId}
      />
    </AppShell>
  );
}
