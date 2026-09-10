import { AppShell } from "@/components/layout/app-shell";
import { VisitorHomePanel } from "@/components/visitor/visitor-home-panel";
import { requireVisitorSession } from "@/lib/auth/visitor-guard";

export default async function VisitorHomePage() {
  const session = await requireVisitorSession();

  return (
    <AppShell active="badge">
      <VisitorHomePanel cacheIdentity={session.email || session.name || "visitor"} />
    </AppShell>
  );
}
