import { extractTaiwanId } from "@/lib/domain/volunteer-attendance";

/** Compact payload for office barcode scanners / phone QR. */
export const VOLUNTEER_BADGE_PREFIX = "EVVOL";

export function buildVolunteerBadgePayload(visitorId: string) {
  const id = String(visitorId || "").trim();
  if (!id) throw new Error("缺少志工編號");
  return `${VOLUNTEER_BADGE_PREFIX}:${id}`;
}

export function buildVolunteerBadgeUrl(origin: string, visitorId: string) {
  const base = origin.replace(/\/$/, "");
  return `${base}/volunteer/badge?v=${encodeURIComponent(visitorId.trim())}`;
}

export type VolunteerScanKind = "badge_qr" | "taiwan_id" | "unknown";

export type ParsedVolunteerScan = {
  kind: VolunteerScanKind;
  visitorId?: string;
  idNumber?: string;
  raw: string;
};

/**
 * Parse kiosk / scanner input:
 * - EVVOL:V-YH-xxx (personal badge QR)
 * - URL with ?v= or /volunteer/badge
 * - raw visitor id V-...
 * - Taiwan national ID
 */
export function parseVolunteerAttendanceScan(rawInput: string): ParsedVolunteerScan {
  const raw = String(rawInput || "").trim();
  if (!raw) return { kind: "unknown", raw };

  const upper = raw.toUpperCase();

  const prefixed = upper.match(new RegExp(`^${VOLUNTEER_BADGE_PREFIX}\\s*[:|=]\\s*(V-[A-Z0-9-]+)$`, "i"));
  if (prefixed?.[1]) {
    return { kind: "badge_qr", visitorId: prefixed[1].toUpperCase(), raw };
  }

  try {
    const url = new URL(raw);
    const fromQuery = url.searchParams.get("v") || url.searchParams.get("visitor_id");
    if (fromQuery && /^V-[A-Z0-9-]+$/i.test(fromQuery)) {
      return { kind: "badge_qr", visitorId: fromQuery.toUpperCase(), raw };
    }
    const pathMatch = url.pathname.match(/\/volunteer\/badge\/?(V-[A-Z0-9-]+)?/i);
    if (pathMatch?.[1]) {
      return { kind: "badge_qr", visitorId: pathMatch[1].toUpperCase(), raw };
    }
  } catch {
    // not a URL
  }

  if (/^V-[A-Z0-9-]+$/i.test(raw)) {
    return { kind: "badge_qr", visitorId: raw.toUpperCase(), raw };
  }

  const idNumber = extractTaiwanId(raw);
  if (idNumber) {
    return { kind: "taiwan_id", idNumber, raw };
  }

  return { kind: "unknown", raw };
}
