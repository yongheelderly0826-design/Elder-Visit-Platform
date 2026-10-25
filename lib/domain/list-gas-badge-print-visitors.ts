import { gasClient, isGasConfigured } from "@/lib/gas-client";
import {
  visitorMatchesWanted,
  type GasBadgePrintVisitor,
} from "@/lib/domain/gas-physical-badge-print";

function asVisitorRows(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  if (data && typeof data === "object") {
    const obj = data as { items?: unknown; rows?: unknown };
    if (Array.isArray(obj.items)) return obj.items as Array<Record<string, unknown>>;
    if (Array.isArray(obj.rows)) return obj.rows as Array<Record<string, unknown>>;
  }
  return [];
}

function isApprovedStatus(status: string) {
  if (!status) return true;
  return /已核准|核准|approved|active/i.test(status);
}

export async function listGasBadgePrintVisitors(input?: {
  visitorIds?: string[];
}): Promise<GasBadgePrintVisitor[]> {
  if (!isGasConfigured()) {
    throw new Error("GAS 尚未設定，無法讀取訪員名冊。");
  }

  const wanted = new Set((input?.visitorIds ?? []).map((id) => id.trim()).filter(Boolean));

  const [visitors, registrations] = await Promise.all([
    gasClient.visitors.list(),
    gasClient.registrations.list({ status: "approved" }),
  ]);

  const byId = new Map<string, GasBadgePrintVisitor>();

  for (const row of asVisitorRows(visitors)) {
    const visitorId = String(row.visitor_id || row.id || "").trim();
    const email = String(row.email || "")
      .trim()
      .toLowerCase();
    const name = String(row.name || row.full_name || "").trim();
    const status = String(row.status || "");
    if (!visitorId) continue;
    if (!isApprovedStatus(status)) continue;
    const visitor: GasBadgePrintVisitor = {
      visitorId,
      name: name || "訪員",
      email,
      status: status || "已核准",
      hasPhoto: Boolean(String(row.photo_url || "").trim()),
      visitorCode: String(row.visitor_code || row.badge_no || visitorId).trim(),
    };
    if (!visitorMatchesWanted(visitor, wanted)) continue;
    byId.set(visitorId, visitor);
  }

  for (const reg of registrations) {
    if (String(reg.status) !== "approved") continue;
    const visitorId = String(reg.visitor_id || "").trim();
    if (!visitorId) continue;
    const prev = byId.get(visitorId);
    const visitor: GasBadgePrintVisitor = {
      visitorId,
      name: String(reg.full_name || prev?.name || "訪員").trim() || "訪員",
      email: String(reg.email || prev?.email || "")
        .trim()
        .toLowerCase(),
      status: prev?.status || "已核准",
      hasPhoto: prev?.hasPhoto || Boolean(reg.profile?.headshotProcessedUrl),
      visitorCode: String(
        (reg.profile as { visitor_code?: string; visitorCode?: string } | undefined)?.visitor_code ||
          (reg.profile as { visitorCode?: string } | undefined)?.visitorCode ||
          prev?.visitorCode ||
          visitorId,
      ).trim(),
    };
    if (!visitorMatchesWanted(visitor, wanted)) continue;
    byId.set(visitorId, visitor);
  }

  return [...byId.values()].sort(
    (a, b) => a.name.localeCompare(b.name, "zh-Hant") || a.visitorId.localeCompare(b.visitorId),
  );
}
