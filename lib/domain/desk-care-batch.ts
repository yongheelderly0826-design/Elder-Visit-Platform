import type { VisitorRegistrationWorkerGroup } from "@/lib/domain/types";
import type { MissedVisitTimeSlot } from "@/lib/domain/visits";

export const DESK_BATCH_STORAGE_KEY = "elder-desk-care-batch-v1";

/** 場生 KEY：預設每案時段長度；案與案之間預留移動時間（分鐘） */
export const DESK_BATCH_SLOT_MINUTES = 10;
export const DESK_BATCH_TRAVEL_GAP_MINUTES = 5;

/**
 * 未遇紙本三趟固定時段（早／中／晚）。
 * MissedVisitTimeSlot 對照：早→上午、中→中午、晚→夜間。
 */
export const DESK_PAPER_MISS_WINDOWS = {
  EARLY: {
    paperKey: "早" as const,
    start: "09:00",
    end: "09:10",
    missedSlot: "上午" as MissedVisitTimeSlot,
    attempt: 1,
    dayOffsetFromLate: -2,
  },
  MID: {
    paperKey: "中" as const,
    start: "14:00",
    end: "14:10",
    missedSlot: "中午" as MissedVisitTimeSlot,
    attempt: 2,
    dayOffsetFromLate: -1,
  },
  LATE: {
    paperKey: "晚" as const,
    start: "19:00",
    end: "19:10",
    missedSlot: "夜間" as MissedVisitTimeSlot,
    attempt: 3,
    dayOffsetFromLate: 0,
  },
} as const;

export type DeskPaperMissWindowKey = keyof typeof DESK_PAPER_MISS_WINDOWS;

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
  /** 紙本 KEY 對照（可缺；舊 sessionStorage 批次可能沒有） */
  village?: string;
  villageSeq?: number | null;
  villageCode?: string;
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

/** 日界溢出後改排隔日上午（與紙本早班／建檔預設一致）。 */
export const DESK_NEXT_DAY_MORNING_START = "09:00";

export type ResolvedVisitSlot = {
  visitDate: string;
  visitStartTime: string;
  visitEndTime: string;
  shifted: boolean;
  /** 促使第一次移位的衝突案（若有） */
  conflict?: DeskVisitWindow;
};

/**
 * 若 candidate 與 existing 重疊，把「本案」往後挪：衝突結束＋移動間隔，
 * 維持原時長；當日放不下則改隔日 morningStart。純函式，不打 API。
 * `existing` 可含多日視窗（同日才會重疊）。
 */
export function resolveNonOverlappingVisitSlot(input: {
  candidate: DeskVisitWindow;
  existing: DeskVisitWindow[];
  travelGapMinutes?: number;
  morningStart?: string;
  /** 單日內最多嘗試次數（防死迴圈） */
  maxAttemptsPerDay?: number;
  /** 最多跨幾天（含起始日） */
  maxDayHops?: number;
}):
  | { ok: true; slot: ResolvedVisitSlot }
  | { ok: false; message: string } {
  const travelGap =
    input.travelGapMinutes == null
      ? DESK_BATCH_TRAVEL_GAP_MINUTES
      : Number(input.travelGapMinutes);
  const morningStart = String(input.morningStart || DESK_NEXT_DAY_MORNING_START)
    .trim()
    .slice(0, 5);
  const maxAttempts = Math.max(1, Math.floor(input.maxAttemptsPerDay ?? 96));
  const maxDayHops = Math.max(1, Math.floor(input.maxDayHops ?? 14));

  const visitDate = String(input.candidate.visitDate || "").trim();
  let start = String(input.candidate.start || "").trim().slice(0, 5);
  let end = String(input.candidate.end || "").trim().slice(0, 5);
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  if (!visitDate || !/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
    return { ok: false, message: "請填寫訪視日期。" };
  }
  if (startMin == null || endMin == null) {
    return { ok: false, message: "請完整填寫開始與結束時間。" };
  }
  if (endMin <= startMin) {
    return { ok: false, message: "結束時間必須晚於開始時間。" };
  }
  if (!Number.isFinite(travelGap) || travelGap < 0) {
    return { ok: false, message: "移動間隔分鐘數無效。" };
  }
  const morningMin = toMinutes(morningStart);
  if (morningMin == null) {
    return { ok: false, message: "隔日上午開始時間無效。" };
  }

  const durationMinutes = endMin - startMin;
  const morningEnd = minutesToTime(morningMin + durationMinutes);
  if (!morningEnd) {
    return { ok: false, message: "隔日上午時段長度無效。" };
  }

  const existing = input.existing;
  let shifted = false;
  let firstConflict: DeskVisitWindow | undefined;
  let currentDate = visitDate;

  for (let dayHop = 0; dayHop < maxDayHops; dayHop += 1) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const candidate: DeskVisitWindow = {
        ...input.candidate,
        visitDate: currentDate,
        start,
        end,
      };
      const hit = findOverlappingWindow(candidate, existing);
      if (!hit) {
        return {
          ok: true,
          slot: {
            visitDate: currentDate,
            visitStartTime: start,
            visitEndTime: end,
            shifted,
            conflict: firstConflict,
          },
        };
      }
      if (!firstConflict) firstConflict = hit;
      shifted = true;

      const hitEnd = toMinutes(hit.end);
      if (hitEnd == null) {
        return { ok: false, message: "衝突時段格式無效，無法自動調整。" };
      }
      const nextStartMin = hitEnd + travelGap;
      const nextEndMin = nextStartMin + durationMinutes;
      if (nextStartMin >= 24 * 60 || nextEndMin > 24 * 60) {
        break;
      }
      const nextStart = minutesToTime(nextStartMin);
      const nextEnd = minutesToTime(nextEndMin);
      if (!nextStart || !nextEnd) break;
      start = nextStart;
      end = nextEnd;
    }

    const nextDate = addCalendarDaysIso(currentDate, 1);
    if (!nextDate) {
      return { ok: false, message: "無法推算隔日日期，時段衝突無法自動排除。" };
    }
    currentDate = nextDate;
    start = morningStart;
    end = morningEnd;
    shifted = true;
  }

  return { ok: false, message: "無法自動排除時段衝突，請手動調整訪視時間。" };
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

/** GAS `AssignmentModule.confirm` 找不到列時的英文訊息 → 派案編號 */
export function parseAssignmentNotFoundId(message: unknown): string | null {
  const text = String(message ?? "");
  const match = text.match(/Assignment not found:\s*(ASG-[A-Za-z0-9-]+)/i);
  return match?.[1] ?? null;
}

export function isAssignmentNotFoundError(error?: {
  code?: string;
  message?: string;
} | null) {
  if (!error) return false;
  if (error.code === "ASSIGNMENT_NOT_FOUND") return true;
  if (parseAssignmentNotFoundId(error.message)) return true;
  return (
    (error.code === "NOT_FOUND" || error.code === "GAS_CONFIRM_FAILED") &&
    /Assignment not found/i.test(String(error.message ?? ""))
  );
}

/** 待 KEY 佇列在 sessionStorage，Sheets 派案列卻已刪／重派時的提示 */
export function deskStaleAssignmentMessage(assignmentId?: string) {
  const id = String(assignmentId ?? "").trim();
  const suffix = id ? `（${id}）` : "";
  return `派案已不在表上${suffix}。瀏覽器還留著舊的「待 KEY 清單」，但 Sheets「派案紀錄」已找不到該列（常見於清測資、重派、或換試算表）。請按「清空清單（解鎖）」後再勾個案「一次準備派案」。`;
}

/** 民國 yyy/MM/dd 或 ISO yyyy-MM-dd → ISO；無法解析則 null。 */
export function normalizeDeskVisitDateToIso(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() + 1 !== month ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const roc = text.match(/^(\d{2,3})\/(\d{1,2})\/(\d{1,2})$/);
  if (roc) {
    const year = Number(roc[1]) + 1911;
    const month = Number(roc[2]);
    const day = Number(roc[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() + 1 !== month ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

/** ISO 日期加減天（以 UTC 日界，避免本地 DST）。 */
export function addCalendarDaysIso(isoDate: string, deltaDays: number): string | null {
  const base = normalizeDeskVisitDateToIso(isoDate);
  if (!base) return null;
  const [y, m, d] = base.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export type DeskMissedPaperPlanItem = {
  attempt: number;
  paperKey: "早" | "中" | "晚";
  visitDate: string;
  visitStartTime: string;
  visitEndTime: string;
  missedSlot: MissedVisitTimeSlot;
  /** true＝本次已送出的那張（晚／D）；false＝需新建 */
  isSubmittedPaper: boolean;
};

/**
 * 以已送出未遇紙本的訪視日 D 為準：本張＝D 晚（第 3 次），另兩張＝D-2 早、D-1 中。
 */
export function buildMissedDeskPaperSupplementPlan(
  visitDateRaw: string,
):
  | { ok: true; lateDate: string; items: DeskMissedPaperPlanItem[] }
  | { ok: false; message: string } {
  const lateDate = normalizeDeskVisitDateToIso(visitDateRaw);
  if (!lateDate) {
    return { ok: false, message: "訪視日期無效，無法建立未遇紙本補件。" };
  }
  const earlyDate = addCalendarDaysIso(lateDate, DESK_PAPER_MISS_WINDOWS.EARLY.dayOffsetFromLate);
  const midDate = addCalendarDaysIso(lateDate, DESK_PAPER_MISS_WINDOWS.MID.dayOffsetFromLate);
  if (!earlyDate || !midDate) {
    return { ok: false, message: "無法推算未遇補件日期。" };
  }

  const items: DeskMissedPaperPlanItem[] = [
    {
      attempt: DESK_PAPER_MISS_WINDOWS.EARLY.attempt,
      paperKey: DESK_PAPER_MISS_WINDOWS.EARLY.paperKey,
      visitDate: earlyDate,
      visitStartTime: DESK_PAPER_MISS_WINDOWS.EARLY.start,
      visitEndTime: DESK_PAPER_MISS_WINDOWS.EARLY.end,
      missedSlot: DESK_PAPER_MISS_WINDOWS.EARLY.missedSlot,
      isSubmittedPaper: false,
    },
    {
      attempt: DESK_PAPER_MISS_WINDOWS.MID.attempt,
      paperKey: DESK_PAPER_MISS_WINDOWS.MID.paperKey,
      visitDate: midDate,
      visitStartTime: DESK_PAPER_MISS_WINDOWS.MID.start,
      visitEndTime: DESK_PAPER_MISS_WINDOWS.MID.end,
      missedSlot: DESK_PAPER_MISS_WINDOWS.MID.missedSlot,
      isSubmittedPaper: false,
    },
    {
      attempt: DESK_PAPER_MISS_WINDOWS.LATE.attempt,
      paperKey: DESK_PAPER_MISS_WINDOWS.LATE.paperKey,
      visitDate: lateDate,
      visitStartTime: DESK_PAPER_MISS_WINDOWS.LATE.start,
      visitEndTime: DESK_PAPER_MISS_WINDOWS.LATE.end,
      missedSlot: DESK_PAPER_MISS_WINDOWS.LATE.missedSlot,
      isSubmittedPaper: true,
    },
  ];

  return { ok: true, lateDate, items };
}

export function findNextReadyDeskBatchItem(
  state: DeskBatchState | null | undefined,
  options?: { afterAssignmentId?: string; excludeAssignmentIds?: string[] },
): DeskBatchQueueItem | null {
  if (!state?.items?.length) return null;
  const exclude = new Set(
    (options?.excludeAssignmentIds ?? []).map((id) => String(id || "").trim()).filter(Boolean),
  );
  const afterId = String(options?.afterAssignmentId ?? "").trim();
  const ready = state.items.filter(
    (item) => item.status === "ready" && !exclude.has(item.assignmentId),
  );
  if (!ready.length) return null;
  if (!afterId) return ready[0] ?? null;
  const afterIndex = state.items.findIndex((item) => item.assignmentId === afterId);
  if (afterIndex < 0) return ready[0] ?? null;
  const afterInReady = ready.find(
    (item) => state.items.indexOf(item) > afterIndex,
  );
  return afterInReady ?? ready[0] ?? null;
}

export function markDeskBatchItemKeyed(
  state: DeskBatchState,
  assignmentId: string,
): DeskBatchState {
  return {
    ...state,
    items: state.items.map((item) =>
      item.assignmentId === assignmentId ? { ...item, status: "keyed" as const } : item,
    ),
    updatedAt: new Date().toISOString(),
  };
}

/** 把新項目插在指定 assignment 之後（找不到則插在最前）。 */
export function insertDeskBatchItemsAfter(
  state: DeskBatchState,
  afterAssignmentId: string,
  newItems: DeskBatchQueueItem[],
): DeskBatchState {
  if (!newItems.length) return state;
  const existingIds = new Set(state.items.map((item) => item.assignmentId));
  const toInsert = newItems.filter((item) => !existingIds.has(item.assignmentId));
  if (!toInsert.length) return state;
  const index = state.items.findIndex((item) => item.assignmentId === afterAssignmentId);
  const items =
    index < 0
      ? [...toInsert, ...state.items]
      : [
          ...state.items.slice(0, index + 1),
          ...toInsert,
          ...state.items.slice(index + 1),
        ];
  return { ...state, items, updatedAt: new Date().toISOString() };
}

export function buildDeskCareFormPath(
  assignmentId: string,
  input: {
    visitDate?: string;
    visitStartTime?: string;
    visitEndTime?: string;
    returnPath?: string;
    missedSlot?: MissedVisitTimeSlot | string;
    paperKey?: string;
  },
) {
  const params = new URLSearchParams();
  if (input.visitDate) params.set("date", input.visitDate);
  if (input.visitStartTime) params.set("start", input.visitStartTime);
  if (input.visitEndTime) params.set("end", input.visitEndTime);
  if (input.returnPath) params.set("return", input.returnPath);
  if (input.missedSlot) params.set("missedSlot", String(input.missedSlot));
  if (input.paperKey) params.set("paperKey", String(input.paperKey));
  const query = params.toString();
  return `/manager/care-forms/${assignmentId}${query ? `?${query}` : ""}`;
}

export function isDeskPaperAssignmentNotes(notes: unknown) {
  const text = String(notes ?? "");
  return text.includes(DESK_PAPER_SOURCE_NOTE) || text.includes("公所代填");
}
