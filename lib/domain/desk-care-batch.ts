import type { VisitorRegistrationWorkerGroup } from "@/lib/domain/types";

export const DESK_BATCH_STORAGE_KEY = "elder-desk-care-batch-v1";

export type DeskVisitWindow = {
  visitDate: string;
  start: string;
  end: string;
  label: string;
  assignmentId?: string;
  caseId?: string;
  visitorIds: string[];
};

export type DeskBatchQueueItem = {
  caseId: string;
  caseName: string;
  caseCode: string;
  assignmentId: string;
  status: "ready" | "keyed" | "skipped";
  visitDate?: string;
  visitStartTime?: string;
  visitEndTime?: string;
};

export type DeskBatchState = {
  version: 1;
  returnPath: string;
  identityKey: string;
  village: string;
  primaryVisitorId: string;
  companionVisitorIds: string[];
  visitorNames: Record<string, string>;
  items: DeskBatchQueueItem[];
  updatedAt: string;
};

export function normalizeDeskWorkerGroup(
  value: unknown,
): VisitorRegistrationWorkerGroup | "unknown" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "unknown";
  if (
    raw === "social_affairs" ||
    raw.includes("social") ||
    raw.includes("社政")
  ) {
    return "social_affairs";
  }
  if (
    raw === "civil_affairs" ||
    raw.includes("civil") ||
    raw.includes("民政")
  ) {
    return "civil_affairs";
  }
  return "unknown";
}

export function toMinutes(time: string) {
  const match = String(time || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function windowsOverlap(a: DeskVisitWindow, b: DeskVisitWindow) {
  if (a.visitDate !== b.visitDate) return false;
  if (a.assignmentId && b.assignmentId && a.assignmentId === b.assignmentId) {
    return false;
  }
  const shared = a.visitorIds.some((id) => b.visitorIds.includes(id));
  if (!shared) return false;
  const aStart = toMinutes(a.start);
  const aEnd = toMinutes(a.end);
  const bStart = toMinutes(b.start);
  const bEnd = toMinutes(b.end);
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return false;
  if (aEnd <= aStart || bEnd <= bStart) return false;
  return aStart < bEnd && bStart < aEnd;
}

export function findOverlappingWindow(
  candidate: DeskVisitWindow,
  existing: DeskVisitWindow[],
) {
  return existing.find((item) => windowsOverlap(candidate, item)) ?? null;
}

export function buildDeskAssignmentNotes(input: {
  primaryVisitorId: string;
  primaryVisitorName?: string;
  companionVisitorIds?: string[];
  companionNames?: Record<string, string>;
  visitDate?: string;
  visitStartTime?: string;
  visitEndTime?: string;
}) {
  const parts = ["公所代填・紙本"];
  const primaryLabel = input.primaryVisitorName
    ? `${input.primaryVisitorId}:${input.primaryVisitorName}`
    : input.primaryVisitorId;
  parts.push(`主填:${primaryLabel}`);
  const companions = (input.companionVisitorIds ?? []).filter(Boolean);
  if (companions.length) {
    const labels = companions.map((id) => {
      const name = input.companionNames?.[id];
      return name ? `${id}:${name}` : id;
    });
    parts.push(`同行:${labels.join(",")}`);
  }
  if (input.visitDate && input.visitStartTime && input.visitEndTime) {
    parts.push(`時段:${input.visitDate} ${input.visitStartTime}-${input.visitEndTime}`);
  }
  return parts.join("｜");
}

export function parseDeskAssignmentNotes(notes: unknown): {
  primaryVisitorId: string | null;
  companionVisitorIds: string[];
  visitDate: string | null;
  visitStartTime: string | null;
  visitEndTime: string | null;
  teamVisitorIds: string[];
} {
  const text = String(notes ?? "");
  const primaryMatch = text.match(/主填:([^｜|]+)/);
  const companionMatch = text.match(/同行:([^｜|]+)/);
  const windowMatch = text.match(
    /時段:(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/,
  );

  const primaryVisitorId = primaryMatch
    ? String(primaryMatch[1].split(":")[0] || "").trim() || null
    : null;
  const companionVisitorIds = companionMatch
    ? companionMatch[1]
        .split(",")
        .map((part) => String(part.split(":")[0] || "").trim())
        .filter(Boolean)
    : [];

  return {
    primaryVisitorId,
    companionVisitorIds,
    visitDate: windowMatch?.[1] ?? null,
    visitStartTime: windowMatch?.[2] ?? null,
    visitEndTime: windowMatch?.[3] ?? null,
    teamVisitorIds: [
      ...new Set(
        [primaryVisitorId, ...companionVisitorIds].filter(Boolean) as string[],
      ),
    ],
  };
}

export function teamIdsIntersect(teamA: string[], teamB: string[]) {
  const setB = new Set(teamB);
  return teamA.some((id) => setB.has(id));
}

export function readDeskBatchState(): DeskBatchState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DESK_BATCH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeskBatchState;
    if (parsed?.version !== 1 || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDeskBatchState(state: DeskBatchState) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(DESK_BATCH_STORAGE_KEY, JSON.stringify(state));
}

export function clearDeskBatchState() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(DESK_BATCH_STORAGE_KEY);
}
