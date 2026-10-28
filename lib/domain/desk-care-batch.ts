import type { VisitorRegistrationWorkerGroup } from "@/lib/domain/types";
import type { MissedVisitTimeSlot } from "@/lib/domain/visits";

export const DESK_BATCH_STORAGE_KEY = "elder-desk-care-batch-v1";

/** 場生 KEY：預設每案時段長度（簽到／快速 KEY 後備）；連續 KEY 改由 1／5／10 勾選 */
export const DESK_BATCH_SLOT_MINUTES = 10;
/** 案與案之間預留移動時間（分鐘） */
export const DESK_BATCH_TRAVEL_GAP_MINUTES = 5;
/** 紙本連續 KEY：關懷表內訪視時長單選（分鐘） */
export const DESK_VISIT_DURATION_OPTIONS = [1, 5, 10] as const;
export type DeskVisitDurationMinutes = (typeof DESK_VISIT_DURATION_OPTIONS)[number];

/**
 * 剛 prepare 寫入的佇列：Sheets / GAS 讀取可能短暫落後。
 * 此寬限內 mount／preflight 不可因單次 false-missing 就清掉品牌新佇列。
 */
export const DESK_BATCH_FRESH_MS = 2 * 60 * 1000;

/** assignment-status：缺列時再查一次的間隔 */
export const DESK_BATCH_STATUS_RETRY_MS = 1200;

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

/** 起始＋時長 → 結束；超出當日則 null。 */
export function endTimeFromStartAndDuration(
  start: string,
  durationMinutes: number,
): string | null {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  return addMinutesToTime(String(start || "").trim().slice(0, 5), durationMinutes);
}

/** 上一案結束＋移動間隔 → 下一案起始。 */
export function nextVisitStartAfterEnd(
  end: string,
  gapMinutes: number = DESK_BATCH_TRAVEL_GAP_MINUTES,
): string | null {
  if (!Number.isFinite(gapMinutes) || gapMinutes < 0) return null;
  return addMinutesToTime(String(end || "").trim().slice(0, 5), gapMinutes);
}

/** 若起迄差恰為 1／5／10，回傳該時長；否則 null（表示手改過）。 */
export function inferDeskVisitDurationMinutes(
  start: string,
  end: string,
): DeskVisitDurationMinutes | null {
  const startMin = toMinutes(String(start || "").trim().slice(0, 5));
  const endMin = toMinutes(String(end || "").trim().slice(0, 5));
  if (startMin == null || endMin == null) return null;
  const delta = endMin - startMin;
  if (
    delta === 1 ||
    delta === 5 ||
    delta === 10
  ) {
    return delta;
  }
  return null;
}

export type DeskStaggeredVisitSlot = {
  visitDate: string;
  visitStartTime: string;
  visitEndTime: string;
};

/**
 * @deprecated 連續 KEY 改為表內勾 1／5／10 再鏈接；保留給舊腳本／測試。
 * 以第 1 筆起迄為基準，後案同日、依「時長 + 移動間隔」往後排。
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

/**
 * 批次只定「日期＋第 1 案起始」：全部寫入日期；僅第一筆 ready 寫起始；清掉結束與後案起始。
 */
export function seedDeskBatchDateAndFirstStart(
  state: DeskBatchState,
  visitDate: string,
  firstStart: string,
):
  | { ok: true; state: DeskBatchState; first: DeskBatchQueueItem }
  | { ok: false; message: string } {
  const date = String(visitDate || "").trim();
  const start = String(firstStart || "").trim().slice(0, 5);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: "請填寫訪視日期。" };
  }
  if (toMinutes(start) == null) {
    return { ok: false, message: "請填寫第 1 筆開始時間。" };
  }
  const readyIndex = state.items.findIndex((item) => item.status === "ready");
  if (readyIndex < 0) {
    return { ok: false, message: "沒有可 KEY 的個案。" };
  }
  const items = state.items.map((item, index) => ({
    ...item,
    visitDate: date,
    visitStartTime: index === readyIndex ? start : undefined,
    visitEndTime: undefined,
  }));
  const next: DeskBatchState = {
    ...state,
    items,
    updatedAt: new Date().toISOString(),
  };
  return { ok: true, state: next, first: items[readyIndex]! };
}

/**
 * 送出後：寫入本案起迄並標 keyed；下一 ready 起始＝本案結束＋移動間隔（同日）。
 */
export function chainDeskBatchAfterKeyed(
  state: DeskBatchState,
  keyedAssignmentId: string,
  keyedTimes: {
    visitDate: string;
    visitStartTime: string;
    visitEndTime: string;
  },
  options?: { travelGapMinutes?: number },
): DeskBatchState {
  const gap =
    options?.travelGapMinutes == null
      ? DESK_BATCH_TRAVEL_GAP_MINUTES
      : Number(options.travelGapMinutes);
  const visitDate = String(keyedTimes.visitDate || "").trim();
  const visitStartTime = String(keyedTimes.visitStartTime || "").trim().slice(0, 5);
  const visitEndTime = String(keyedTimes.visitEndTime || "").trim().slice(0, 5);
  const nextStart = nextVisitStartAfterEnd(visitEndTime, gap);

  let marked = false;
  const items = state.items.map((item) => {
    if (item.assignmentId !== keyedAssignmentId) return item;
    marked = true;
    return {
      ...item,
      status: "keyed" as const,
      visitDate: visitDate || item.visitDate,
      visitStartTime: visitStartTime || item.visitStartTime,
      visitEndTime: visitEndTime || item.visitEndTime,
    };
  });

  if (!marked) {
    return { ...state, items, updatedAt: new Date().toISOString() };
  }

  const afterIndex = items.findIndex((item) => item.assignmentId === keyedAssignmentId);
  const nextReady =
    afterIndex >= 0
      ? items.find(
          (item, index) => index > afterIndex && item.status === "ready",
        ) ?? items.find((item) => item.status === "ready")
      : items.find((item) => item.status === "ready");

  if (nextReady && nextStart) {
    const nextId = nextReady.assignmentId;
    return {
      ...state,
      items: items.map((item) =>
        item.assignmentId === nextId
          ? {
              ...item,
              visitDate: visitDate || item.visitDate,
              visitStartTime: nextStart,
              // 下一案時長需重新勾選
              visitEndTime: undefined,
            }
          : item,
      ),
      updatedAt: new Date().toISOString(),
    };
  }

  return { ...state, items, updatedAt: new Date().toISOString() };
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

/** 剛準備／剛更新的待 KEY 清單：避免 status probe 誤清。 */
export function isDeskBatchFresh(
  state: Pick<DeskBatchState, "updatedAt"> | null | undefined,
  nowMs: number = Date.now(),
  freshMs: number = DESK_BATCH_FRESH_MS,
) {
  const raw = String(state?.updatedAt ?? "").trim();
  if (!raw) return false;
  const updatedAtMs = Date.parse(raw);
  if (!Number.isFinite(updatedAtMs)) return false;
  return nowMs - updatedAtMs < freshMs;
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

/** API／偵測：待 KEY 佇列在 sessionStorage，Sheets 派案列卻已刪／重派 */
export function deskStaleAssignmentMessage(assignmentId?: string) {
  const id = String(assignmentId ?? "").trim();
  const suffix = id ? `（${id}）` : "";
  return `派案已不在表上${suffix}。瀏覽器「待 KEY 清單」已失效（常見於清測資、重派、或換試算表）。`;
}

/** 桌面端已自動 clear sessionStorage 佇列後的成功回復文案 */
export function deskStaleAssignmentClearedMessage(assignmentId?: string) {
  const id = String(assignmentId ?? "").trim();
  const suffix = id ? `（曾見 ${id}）` : "";
  return `已自動清除失效待 KEY 清單${suffix}，請重新勾選個案後按一次準備派案。`;
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

/** ISO yyyy-MM-dd → 備註用 M/D（不補零）。 */
export function formatDeskNoteMonthDay(isoDate: string): string | null {
  const iso = normalizeDeskVisitDateToIso(isoDate);
  if (!iso) return null;
  const [, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}`;
}

/**
 * 一鍵未遇／住址不詳：一張紙，三次訪視時間寫入「居住-其他說明」與備註
 *（往前 D-2 早、D-1 中，本張 D＋當下起始）。
 * 例：`10/20 09:00訪視未遇；10/22 14:00訪視未遇；10/23 16:30訪視未遇。`
 */
export function buildDeskOnePaperMissedNote(input: {
  visitDateRaw: string;
  visitStartTime?: string;
}): string | null {
  const lateDate = normalizeDeskVisitDateToIso(input.visitDateRaw);
  if (!lateDate) return null;
  const earlyDate = addCalendarDaysIso(lateDate, DESK_PAPER_MISS_WINDOWS.EARLY.dayOffsetFromLate);
  const midDate = addCalendarDaysIso(lateDate, DESK_PAPER_MISS_WINDOWS.MID.dayOffsetFromLate);
  if (!earlyDate || !midDate) return null;

  const lateStart =
    String(input.visitStartTime || "").trim().slice(0, 5) || DESK_PAPER_MISS_WINDOWS.LATE.start;
  const earlyLabel = formatDeskNoteMonthDay(earlyDate);
  const midLabel = formatDeskNoteMonthDay(midDate);
  const lateLabel = formatDeskNoteMonthDay(lateDate);
  if (!earlyLabel || !midLabel || !lateLabel) return null;

  return [
    `${earlyLabel} ${DESK_PAPER_MISS_WINDOWS.EARLY.start}訪視未遇`,
    `${midLabel} ${DESK_PAPER_MISS_WINDOWS.MID.start}訪視未遇`,
    `${lateLabel} ${lateStart}訪視未遇`,
  ].join("；") + "。";
}

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

/**
 * 連續 KEY「Pass／下次再 KEY」：本件標 skipped（不送出），以便跳下一筆；
 * 清單仍可再開表補 KEY，送出成功後會改 keyed。
 */
export function markDeskBatchItemSkipped(
  state: DeskBatchState,
  assignmentId: string,
): DeskBatchState {
  return {
    ...state,
    items: state.items.map((item) =>
      item.assignmentId === assignmentId && item.status !== "keyed"
        ? { ...item, status: "skipped" as const }
        : item,
    ),
    updatedAt: new Date().toISOString(),
  };
}

/** 略過後再進表：把 skipped 改回 ready，方便本批稍後補 KEY。 */
export function reviveDeskBatchItemForKey(
  state: DeskBatchState,
  assignmentId: string,
): DeskBatchState {
  return {
    ...state,
    items: state.items.map((item) =>
      item.assignmentId === assignmentId && item.status === "skipped"
        ? { ...item, status: "ready" as const }
        : item,
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
