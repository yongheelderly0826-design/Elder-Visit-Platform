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

export function listDemoVisitorLinks() {
  return links as Record<string, DemoVisitorLink>;
}
