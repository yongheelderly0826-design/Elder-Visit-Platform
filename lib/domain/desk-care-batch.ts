import type { VisitorRegistrationWorkerGroup } from "@/lib/domain/types";

export const DESK_BATCH_STORAGE_KEY = "elder-desk-care-batch-v1";

/** 場生 KEY：預設每案時段長度；案與案之間預留移動時間（分鐘） */
export const DESK_BATCH_SLOT_MINUTES = 10;
export const DESK_BATCH_TRAVEL_GAP_MINUTES = 5;

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

export function minutesToTime(total: number) {
  if (!Number.isFinite(total) || total < 0 || total >= 24 * 60) return null;
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function addMinutesToTime(time: string, deltaMinutes: number) {
  const base = toMinutes(time);
  if (base == null || !Number.isFinite(deltaMinutes)) return null;
  return minutesToTime(base + deltaMinutes);
}

export type DeskStaggeredVisitSlot = {
  visitDate: string;
  visitStartTime: string;
  visitEndTime: string;
};

/**
 * 以第 1 筆起迄為基準，後案同日、依「時長 + 移動間隔」往後排。
 * 例：09:00–09:10、間隔 5 分 → 09:15–09:25、09:30–09:40。
 */
export function buildStaggeredVisitWindows(input: {
  visitDate: string;
  firstStart: string;
  firstEnd: string;
  count: number;
  travelGapMinutes?: number;
}):
  | {
      ok: true;
      slots: DeskStaggeredVisitSlot[];
      durationMinutes: number;
      travelGapMinutes: number;
      stepMinutes: number;
    }
  | { ok: false; message: string } {
  const visitDate = String(input.visitDate || "").trim();
  const firstStart = String(input.firstStart || "").trim().slice(0, 5);
  const firstEnd = String(input.firstEnd || "").trim().slice(0, 5);
  const count = Math.max(0, Math.floor(input.count));
  const travelGap =
    input.travelGapMinutes == null
      ? DESK_BATCH_TRAVEL_GAP_MINUTES
      : Number(input.travelGapMinutes);

  if (!visitDate || !/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
    return { ok: false, message: "請填寫訪視日期。" };
  }
  if (count < 1) {
    return { ok: false, message: "沒有可排程的個案。" };
  }
  if (!Number.isFinite(travelGap) || travelGap < 0) {
    return { ok: false, message: "移動間隔分鐘數無效。" };
  }

  const startMin = toMinutes(firstStart);
  const endMin = toMinutes(firstEnd);
  if (startMin == null || endMin == null) {
    return { ok: false, message: "請完整填寫開始與結束時間。" };
  }
  if (endMin <= startMin) {
    return { ok: false, message: "結束時間必須晚於開始時間。" };
  }

  const durationMinutes = endMin - startMin;
  const stepMinutes = durationMinutes + travelGap;

  const slots: DeskStaggeredVisitSlot[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = index * stepMinutes;
    const visitStartTime = addMinutesToTime(firstStart, offset);
    const visitEndTime = addMinutesToTime(firstEnd, offset);
    if (!visitStartTime || !visitEndTime) {
      return {
        ok: false,
        message: `第 ${index + 1} 筆時段超出當日 24:00，請提早第 1 筆開始時間或減少案數。`,
      };
    }
    slots.push({ visitDate, visitStartTime, visitEndTime });
  }

  return { ok: true, slots, durationMinutes, travelGapMinutes: travelGap, stepMinutes };
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

export const DESK_PAPER_SOURCE_NOTE = "公所代填・紙本";
export const FIELD_SELF_SOURCE_NOTE = "訪員自領・實訪";

export function buildDeskAssignmentNotes(input: {
  primaryVisitorId: string;
  primaryVisitorName?: string;
  companionVisitorIds?: string[];
  companionNames?: Record<string, string>;
  visitDate?: string;
  visitStartTime?: string;
  visitEndTime?: string;
  /** 預設紙本代填；快速 KEY／訪員自領用 field_self */
  source?: "desk_paper" | "field_self";
}) {
  const parts = [
    input.source === "field_self" ? FIELD_SELF_SOURCE_NOTE : DESK_PAPER_SOURCE_NOTE,
  ];
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
