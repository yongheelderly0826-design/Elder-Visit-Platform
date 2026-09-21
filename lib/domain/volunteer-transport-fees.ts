/**
 * 永和區志工交通費核銷規則
 * 依據：新北市永和區公所推行志願服務實施計畫（115.07.01）
 * 送餐單價由承辦確認：早／中／晚每次 100 元。
 *
 * 時數表只看累積是否達標，發該檔總額；不用「時數 × 每小時」。
 */

export const VOLUNTEER_TRANSPORT_SOURCE = "永和區志願服務實施計畫 115.07.01";
export const MEAL_FEE_PER_TRIP = 100;
export const MAX_MEAL_TRIPS_PER_DAY = 3;
export const MEAL_SLOTS = ["早", "中", "晚"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export type TransportSchedule = "quarterly_hours" | "annual_hours" | "per_trip";

export type HourBracket = {
  minHours: number;
  maxHours: number | null;
  amount: number;
  referenceHourly: number | null;
};

export type TransportFeePlan = {
  schedule: TransportSchedule;
  code: string;
  title: string;
  groups: string[];
  aliases: string[];
  brackets?: HourBracket[];
  perTripAmount?: number;
};

export type TransportFeeInput = {
  group: string;
  hours: number;
  tripCount?: number;
};

export type TransportFeeResult = {
  amount: number;
  ruleCode: string;
  ruleLabel: string;
  schedule: TransportSchedule | "none";
  matchedHours: number;
  tripCount: number;
  bracketAmount: number;
};

const QUARTERLY_BRACKETS: HourBracket[] = [
  { minHours: 30, maxHours: null, amount: 620, referenceHourly: 20.66 },
  { minHours: 27, maxHours: null, amount: 550, referenceHourly: 20.37 },
  { minHours: 24, maxHours: null, amount: 480, referenceHourly: 20 },
  { minHours: 21, maxHours: null, amount: 400, referenceHourly: 19.04 },
  { minHours: 18, maxHours: null, amount: 250, referenceHourly: 13.88 },
  { minHours: 15, maxHours: null, amount: 200, referenceHourly: 13.33 },
];

const ANNUAL_BRACKETS: HourBracket[] = [
  { minHours: 108, maxHours: null, amount: 2350, referenceHourly: 21.75 },
  { minHours: 71, maxHours: 107, amount: 1850, referenceHourly: 17.28 },
  { minHours: 41, maxHours: 70, amount: 1200, referenceHourly: 17.14 },
  { minHours: 31, maxHours: 40, amount: 600, referenceHourly: 15 },
  { minHours: 20, maxHours: 30, amount: 310, referenceHourly: 10.33 },
  { minHours: 12, maxHours: 19, amount: 190, referenceHourly: 10 },
];

export const VOLUNTEER_TRANSPORT_PLANS: TransportFeePlan[] = [
  {
    schedule: "per_trip",
    code: "meal",
    title: "送餐組（早／中／晚每次 100 元）",
    groups: ["送餐組", "送餐服務組"],
    aliases: ["meal", "送餐", "獨居送早(中)餐", "獨老送早(中)餐", "獨居送餐"],
    perTripAmount: MEAL_FEE_PER_TRIP,
  },
  {
    schedule: "quarterly_hours",
    code: "quarterly",
    title: "每季結算（累積達標時數）",
    groups: ["巡迴組", "悠遊卡組", "道路維護組", "公園綠化組", "接駁車組", "調解會組", "電話問安組"],
    aliases: [
      "patrol",
      "easycard",
      "road",
      "park",
      "shuttle",
      "mediation",
      "phone_care",
      "elder_care",
      "traffic",
      "巡迴",
      "悠遊卡",
      "道路維護",
      "公園綠化",
      "接駁車",
      "調解會",
      "電話問安",
      "獨居關懷組",
      "交通服務組",
    ],
    brackets: QUARTERLY_BRACKETS,
  },
  {
    schedule: "annual_hours",
    code: "annual",
    title: "年度結算（累積達標時數）",
    groups: ["榮民(眷)服務組", "文化組", "防災收容組", "文書組"],
    aliases: [
      "veteran",
      "culture",
      "disaster",
      "office",
      "clerical",
      "榮服",
      "榮民",
      "榮民(眷)服務",
      "榮民服務組",
      "文化",
      "圖書文化組",
      "防災收容",
      "防災巡守組",
      "文書",
      "行政內勤組",
    ],
    brackets: ANNUAL_BRACKETS,
  },
];

function normalizeGroup(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s()（）]/g, "");
}

export function findTransportFeePlan(group: string): TransportFeePlan | null {
  const key = normalizeGroup(group);
  if (!key) return null;
  for (const plan of VOLUNTEER_TRANSPORT_PLANS) {
    const names = [...plan.groups, ...plan.aliases].map(normalizeGroup);
    if (names.includes(key)) return plan;
  }
  return null;
}

export function matchHourBracket(hours: number, brackets: HourBracket[]): HourBracket | null {
  const sorted = [...brackets].sort((a, b) => b.minHours - a.minHours);
  for (const bracket of sorted) {
    if (hours + 1e-9 >= bracket.minHours) return bracket;
  }
  return null;
}

export function calculateVolunteerTransportFee(input: TransportFeeInput): TransportFeeResult {
  const hours = Math.max(0, Number(input.hours) || 0);
  const tripCount = Math.max(0, Math.floor(Number(input.tripCount) || 0));
  const plan = findTransportFeePlan(input.group);
  if (!plan) {
    return {
      amount: 0,
      ruleCode: "none",
      ruleLabel: "此組別未列交通費級距",
      schedule: "none",
      matchedHours: hours,
      tripCount,
      bracketAmount: 0,
    };
  }

  if (plan.schedule === "per_trip") {
    const amount = tripCount * (plan.perTripAmount ?? MEAL_FEE_PER_TRIP);
    return {
      amount,
      ruleCode: plan.code,
      ruleLabel: `${plan.title}；${tripCount} 次 × ${plan.perTripAmount ?? MEAL_FEE_PER_TRIP} 元`,
      schedule: plan.schedule,
      matchedHours: hours,
      tripCount,
      bracketAmount: plan.perTripAmount ?? MEAL_FEE_PER_TRIP,
    };
  }

  const bracket = matchHourBracket(hours, plan.brackets || []);
  if (!bracket) {
    const floor = plan.brackets?.[plan.brackets.length - 1]?.minHours ?? 0;
    return {
      amount: 0,
      ruleCode: plan.code,
      ruleLabel: `${plan.title}；累積 ${hours} 小時未達 ${floor} 小時`,
      schedule: plan.schedule,
      matchedHours: hours,
      tripCount,
      bracketAmount: 0,
    };
  }

  const rangeLabel =
    bracket.maxHours == null ? `${bracket.minHours} 小時以上` : `${bracket.minHours}–${bracket.maxHours} 小時`;
  return {
    amount: bracket.amount,
    ruleCode: plan.code,
    ruleLabel: `${plan.title}；${rangeLabel} → ${bracket.amount} 元`,
    schedule: plan.schedule,
    matchedHours: hours,
    tripCount,
    bracketAmount: bracket.amount,
  };
}

export function rocYearToGregorian(year: number) {
  return year < 1911 ? year + 1911 : year;
}

export function periodDatePrefix(period: string): { start: string; end: string } | { prefix: string } | null {
  const raw = String(period || "").trim();
  if (!raw) return null;
  const quarter = raw.match(/^(\d{2,4})-Q([1-4])$/i);
  if (quarter) {
    const year = rocYearToGregorian(Number(quarter[1]));
    const q = Number(quarter[2]);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    return {
      start: `${year}-${String(startMonth).padStart(2, "0")}-01`,
      end: `${year}-${String(endMonth).padStart(2, "0")}-31`,
    };
  }
  const yearMonth = raw.match(/^(\d{2,4})-(\d{2})$/);
  if (yearMonth) {
    const year = rocYearToGregorian(Number(yearMonth[1]));
    return { prefix: `${year}-${yearMonth[2]}` };
  }
  const yearOnly = raw.match(/^(\d{2,4})$/);
  if (yearOnly) {
    return { prefix: String(rocYearToGregorian(Number(yearOnly[1]))) };
  }
  return { prefix: raw };
}

export function dateInPeriod(dateValue: string, period: string) {
  const date = String(dateValue || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const bound = periodDatePrefix(period);
  if (!bound) return true;
  if ("prefix" in bound) return date.indexOf(bound.prefix) === 0;
  return date >= bound.start && date <= bound.end;
}

export function detectMealSlot(row: Record<string, unknown>): MealSlot | "" {
  const raw = [row.meal_slot, row.notes, row.note, row.site_name, row.group_name]
    .map((value) => String(value || ""))
    .join(" ");
  if (/晚餐|晚上|晚膳/.test(raw)) return "晚";
  if (/中餐|午餐|中午/.test(raw)) return "中";
  if (/早餐|早上|早晨/.test(raw)) return "早";
  return "";
}

export function countMealTrips(rows: Array<Record<string, unknown>>) {
  const byDay = new Map<string, { slots: Set<string>; unmarked: number }>();
  for (const row of rows) {
    const day = String(row.session_date || row.checkin_at || "").slice(0, 10);
    if (!day) continue;
    const current = byDay.get(day) ?? { slots: new Set<string>(), unmarked: 0 };
    const slot = detectMealSlot(row);
    if (slot) current.slots.add(slot);
    else current.unmarked += 1;
    byDay.set(day, current);
  }
  let total = 0;
  for (const day of byDay.values()) {
    total += Math.min(MAX_MEAL_TRIPS_PER_DAY, day.slots.size + day.unmarked);
  }
  return total;
}
