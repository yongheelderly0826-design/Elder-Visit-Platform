import type { WorkspaceRoleKey } from "@/lib/domain/types";

export type ManagerSession = {
  email: string;
  name: string;
  picture?: string;
  roleKey: WorkspaceRoleKey;
  provider: "google";
};

const SESSION_COOKIE = "manager_session";

export function getAllowedManagerEmails(): string[] {
  const raw = process.env.GOOGLE_ALLOWED_EMAILS ?? "yongheelderly0826@gmail.com";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function inferManagerRole(email: string): WorkspaceRoleKey {
  const ownerEmails = (process.env.GOOGLE_OWNER_EMAILS ?? "yongheelderly0826@gmail.com")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  if (ownerEmails.includes(email.toLowerCase())) {
    return "workspace_owner";
  }
  return "workspace_manager";
}

export function isAllowedManagerEmail(email: string) {
  return getAllowedManagerEmails().includes(email.trim().toLowerCase());
}

export function encodeManagerSession(session: ManagerSession): string {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

export function decodeManagerSession(value: string | undefined | null): ManagerSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as ManagerSession;
    if (!parsed.email || !parsed.roleKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getGoogleOAuthConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ??
      `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/auth/google/callback`,
  };
}

export function isGoogleAuthConfigured() {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  return Boolean(clientId && clientSecret);
}

export { SESSION_COOKIE };
