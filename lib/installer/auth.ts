import type { NextRequest } from "next/server";
import { decodeManagerSession, SESSION_COOKIE } from "@/lib/auth/google-manager";

export function isInstallerEnabled() {
  if (process.env.INSTALLER_ENABLED === "true") return true;
  if (process.env.NODE_ENV === "development") return true;
  return false;
}

export function canAccessInstaller(request: NextRequest) {
  if (!isInstallerEnabled()) {
    return { ok: false as const, reason: "INSTALLER_DISABLED" };
  }

  const secret = process.env.INSTALLER_SECRET;
  const headerSecret = request.headers.get("x-installer-secret");
  if (secret && headerSecret === secret) {
    return { ok: true as const };
  }

  const manager = decodeManagerSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (manager?.roleKey === "workspace_owner") {
    return { ok: true as const };
  }

  if (process.env.NODE_ENV === "development") {
    return { ok: true as const };
  }

  return { ok: false as const, reason: "FORBIDDEN" };
}

export function canSpawnLocalRunner() {
  return process.env.INSTALLER_RUNNER !== "disabled";
}
