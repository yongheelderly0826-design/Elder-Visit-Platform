import { AppShell } from "@/components/layout/app-shell";
import { DraftList } from "@/components/visitor/draft-list";
import { requireVisitorSession } from "@/lib/auth/visitor-guard";

export default async function VisitorDraftsPage() {
  await requireVisitorSession();

  return (
    <AppShell active="drafts">
      <DraftList />
    </AppShell>
  );
}
