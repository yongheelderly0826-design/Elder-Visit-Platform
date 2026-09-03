export type VolunteerGroupId =
  | "elder_care"
  | "meal"
  | "road"
  | "park"
  | "cleaning"
  | "disaster"
  | "traffic"
  | "community"
  | "culture"
  | "event"
  | "office"
  | "other";

export type AttendanceChannel = "qr" | "barcode" | "manual";
export type AttendanceSource = "field_qr" | "office_kiosk" | "visit";
export type AttendanceAction = "checkin" | "checkout";

export type VolunteerGroup = {
  id: VolunteerGroupId;
  name: string;
  field: boolean;
};

export type AttendanceSite = {
  id: string;
  name: string;
  groupId: VolunteerGroupId;
  kind: "field" | "office";
};

export type VolunteerWorker = {
  visitorId: string;
  name: string;
  phone: string;
  idNumber: string;
  groupId: string;
  groupName: string;
  status: string;
  badgeNo: string;
};

export type AttendanceRecord = {
  attendanceId: string;
  visitorId: string;
  workerName: string;
  idNumber: string;
  groupId: string;
  groupName: string;
  sessionDate: string;
  checkinAt: string;
  checkoutAt: string;
  durationMinutes: number | null;
  hours: string;
  channel: string;
  channelLabel: string;
  siteId: string;
  siteName: string;
  source: string;
};

export type VolunteerClockStatus = {
  visitor: VolunteerWorker;
  today: string;
  open: AttendanceRecord | null;
};

export const VOLUNTEER_GROUPS: VolunteerGroup[] = [
  { id: "elder_care", name: "獨居關懷組", field: true },
  { id: "meal", name: "送餐服務組", field: true },
  { id: "road", name: "道路維護組", field: true },
  { id: "park", name: "公園綠化組", field: true },
  { id: "cleaning", name: "清潔美化組", field: true },
  { id: "disaster", name: "防災巡守組", field: true },
  { id: "traffic", name: "交通服務組", field: true },
  { id: "community", name: "社區關懷組", field: true },
  { id: "culture", name: "圖書文化組", field: true },
  { id: "event", name: "活動支援組", field: true },
  { id: "office", name: "行政內勤組", field: false },
  { id: "other", name: "其他支援組", field: true },
];

export const ATTENDANCE_SITES: AttendanceSite[] = [
  { id: "SITE-ELDER", name: "獨居關懷組集合點", groupId: "elder_care", kind: "field" },
  { id: "SITE-MEAL", name: "送餐服務組集合點", groupId: "meal", kind: "field" },
  { id: "SITE-ROAD", name: "道路維護組集合點", groupId: "road", kind: "field" },
  { id: "SITE-PARK", name: "公園綠化組集合點", groupId: "park", kind: "field" },
  { id: "SITE-CLEAN", name: "清潔美化組集合點", groupId: "cleaning", kind: "field" },
  { id: "SITE-DISASTER", name: "防災巡守組集合點", groupId: "disaster", kind: "field" },
  { id: "SITE-TRAFFIC", name: "交通服務組集合點", groupId: "traffic", kind: "field" },
  { id: "SITE-COMMUNITY", name: "社區關懷組集合點", groupId: "community", kind: "field" },
  { id: "SITE-CULTURE", name: "圖書文化組集合點", groupId: "culture", kind: "field" },
  { id: "SITE-EVENT", name: "活動支援組集合點", groupId: "event", kind: "field" },
  { id: "SITE-OTHER", name: "其他支援組集合點", groupId: "other", kind: "field" },
  { id: "SITE-KIOSK", name: "公所刷證櫃台", groupId: "office", kind: "office" },
];

export const VOLUNTEER_CLOCK_COOKIE = "volunteer_clock";
export const OFFICE_KIOSK_SITE_ID = "SITE-KIOSK";

export const ATTENDANCE_EXPORT_HEADERS = [
  "年月",
  "組別",
  "姓名",
  "身分證字號",
  "志工編號",
  "日期",
  "簽到時間",
  "簽退時間",
  "出勤時數",
  "簽到方式",
  "地點",
  "出勤編號",
] as const;

export function getVolunteerGroup(id: string | null | undefined) {
  return VOLUNTEER_GROUPS.find((group) => group.id === id) ?? null;
}

export function getAttendanceSite(id: string | null | undefined) {
  if (!id) return null;
  return ATTENDANCE_SITES.find((site) => site.id === id.trim().toUpperCase()) ?? null;
}

export function extractTaiwanId(raw: string | null | undefined) {
  const normalized = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const match = normalized.match(/[A-Z][0-9]{9}/);
  return match?.[0] ?? normalized;
}

export function currentAttendancePeriod(date = new Date()) {
  const taipei = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const year = taipei.getFullYear();
  const month = String(taipei.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function taipeiToday(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function taipeiTime(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function hoursFromMinutes(minutes: number | string | null | undefined) {
  const n = typeof minutes === "number" ? minutes : Number.parseInt(String(minutes ?? ""), 10);
  if (!Number.isFinite(n)) return "";
  return String(Math.round((n / 60) * 10) / 10);
}

export function attendanceChannelLabel(channel?: string, source?: string) {
  if (source === "office_kiosk" || channel === "barcode") return "公所刷證";
  if (channel === "qr") return "外勤QR";
  return channel || source || "";
}

export function volunteerClockPath(siteId?: string) {
  return siteId ? `/volunteer/clock?site=${encodeURIComponent(siteId)}` : "/volunteer/clock";
}

export function attendanceExportRow(period: string, record: AttendanceRecord) {
  return [
    period,
    record.groupName,
    record.workerName,
    record.idNumber,
    record.visitorId,
    record.sessionDate,
    taipeiTime(record.checkinAt),
    taipeiTime(record.checkoutAt),
    record.hours || hoursFromMinutes(record.durationMinutes),
    record.channelLabel || attendanceChannelLabel(record.channel, record.source),
    record.siteName,
    record.attendanceId,
  ];
}
