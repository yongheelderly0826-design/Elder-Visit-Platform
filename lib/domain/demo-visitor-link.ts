import links from "@/lib/domain/demo-visitor-links.json";

export type DemoVisitorLink = {
  visitorId: string;
  name: string;
  idNumber: string;
  assignmentId?: string;
  caseId?: string;
};

export function getDemoVisitorLink(email: string | null | undefined): DemoVisitorLink | null {
  if (!email) return null;
  const row = (links as Record<string, DemoVisitorLink>)[email.toLowerCase()];
  return row ?? null;
}

export function resolveVisitorIdentity(session: {
  visitorId?: string | null;
  email?: string | null;
  name?: string | null;
}) {
  const link = getDemoVisitorLink(session.email);
  return {
    visitorId: String(session.visitorId ?? "").trim() || link?.visitorId || "",
    name: String(session.name ?? "").trim() || link?.name || "",
    link,
  };
}

export function listDemoVisitorLinks() {
  return links as Record<string, DemoVisitorLink>;
}
