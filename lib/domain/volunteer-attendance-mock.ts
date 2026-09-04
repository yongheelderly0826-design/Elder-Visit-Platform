import {
  attendanceChannelLabel,
  extractTaiwanId,
  getAttendanceSite,
  getVolunteerGroup,
  hoursFromMinutes,
  OFFICE_KIOSK_SITE_ID,
  taipeiToday,
  type AttendanceAction,
  type AttendanceRecord,
  type VolunteerClockStatus,
  type VolunteerWorker,
} from "@/lib/domain/volunteer-attendance";

type MockVolunteer = VolunteerWorker;

type MockAttendance = AttendanceRecord;

const volunteers: MockVolunteer[] = [
  {
    visitorId: "V-YH-MEAL01",
    name: "林送餐",
    phone: "0912-111-001",
    idNumber: "A123456789",
    groupId: "meal",
    groupName: "送餐服務組",
    status: "已核准",
    badgeNo: "BADGE-MEAL01",
  },
  {
    visitorId: "V-YH-ROAD01",
    name: "陳道路",
    phone: "0912-111-002",
    idNumber: "B223456789",
    groupId: "road",
    groupName: "道路維護組",
    status: "已核准",
    badgeNo: "BADGE-ROAD01",
  },
  {
    visitorId: "V-YH-PARK01",
    name: "黃綠化",
    phone: "0912-111-003",
    idNumber: "C323456789",
    groupId: "park",
    groupName: "公園綠化組",
    status: "已核准",
    badgeNo: "BADGE-PARK01",
  },
  {
    visitorId: "V-YH-OFF01",
    name: "王內勤",
    phone: "0912-111-004",
    idNumber: "D423456789",
    groupId: "office",
    groupName: "行政內勤組",
    status: "已核准",
    badgeNo: "BADGE-OFF01",
  },
];

const records: MockAttendance[] = [];

function cloneWorker(visitor: MockVolunteer): VolunteerWorker {
  return { ...visitor };
}

function findVolunteer(input: { visitorId?: string; idNumber?: string }) {
  if (input.visitorId) {
    return volunteers.find((row) => row.visitorId === input.visitorId) ?? null;
  }
  if (input.idNumber) {
    const idNumber = extractTaiwanId(input.idNumber);
    return volunteers.find((row) => extractTaiwanId(row.idNumber) === idNumber) ?? null;
  }
  return null;
}

function findOpen(visitorId: string, sessionDate: string, sessionType = "志工出勤") {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const row = records[i];
    if (
      row.visitorId === visitorId &&
      row.sessionDate === sessionDate &&
      !row.checkoutAt &&
      (row.sessionType || "志工出勤") === sessionType
    ) {
      return row;
    }
  }
  return null;
}

function toStatus(visitor: MockVolunteer): VolunteerClockStatus {
  const today = taipeiToday();
  const open = findOpen(visitor.visitorId, today);
  return { visitor: cloneWorker(visitor), today, open: open ? { ...open } : null };
}

export function mockIdentifyVolunteer(idNumber: string) {
  const visitor = findVolunteer({ idNumber });
  if (!visitor) {
    throw Object.assign(new Error("找不到志工資料，請確認身分證或請承辦先建檔"), {
      code: "NOT_FOUND",
    });
  }
  if (visitor.status === "停用" || visitor.status === "駁回") {
    throw Object.assign(new Error("此志工帳號已停用，無法出勤"), { code: "FORBIDDEN" });
  }
  return toStatus(visitor);
}

export function mockAttendanceStatus(input: { visitorId?: string; idNumber?: string }) {
  const visitor = findVolunteer(input);
  if (!visitor) {
    throw Object.assign(new Error("找不到志工資料"), { code: "NOT_FOUND" });
  }
  return toStatus(visitor);
}

export function mockClockAttendance(input: {
  visitorId?: string;
  idNumber?: string;
  siteId?: string;
  channel?: string;
  source?: string;
  lat?: string;
  lng?: string;
  assignmentId?: string;
  sessionType?: string;
}): { action: AttendanceAction; record: AttendanceRecord; visitor: VolunteerWorker } {
  const visitor = findVolunteer(input);
  if (!visitor) {
    throw Object.assign(new Error("找不到志工資料，請確認身分證或先建檔"), { code: "NOT_FOUND" });
  }
  const today = taipeiToday();
  const sessionType = input.sessionType || "志工出勤";
  const open = findOpen(visitor.visitorId, today, sessionType);
  if (open) {
    const checkoutAt = new Date().toISOString();
    const durationMinutes = Math.max(
      0,
      Math.round((new Date(checkoutAt).getTime() - new Date(open.checkinAt).getTime()) / 60000),
    );
    open.checkoutAt = checkoutAt;
    open.durationMinutes = durationMinutes;
    open.hours = hoursFromMinutes(durationMinutes);
    return { action: "checkout", record: { ...open }, visitor: cloneWorker(visitor) };
  }

  const isVisit = sessionType === "訪查";
  const isKiosk = input.channel === "barcode" || input.source === "office_kiosk";
  const site = isVisit
    ? { id: "SITE-VISIT", name: "到宅訪查", groupId: "elder_care" as const }
    : getAttendanceSite(input.siteId || (isKiosk ? OFFICE_KIOSK_SITE_ID : ""));
  if (!site) {
    throw Object.assign(new Error("無效的出勤地點 QR，請重新掃描海報"), {
      code: "VALIDATION_ERROR",
    });
  }
  const group = getVolunteerGroup(visitor.groupId) ?? getVolunteerGroup(site.groupId);
  const record: AttendanceRecord = {
    attendanceId: `ATT-${Math.random().toString(16).slice(2, 10)}`,
    visitorId: visitor.visitorId,
    assignmentId: input.assignmentId || "",
    sessionType,
    workerName: visitor.name,
    idNumber: visitor.idNumber,
    groupId: visitor.groupId || site.groupId,
    groupName: group?.name ?? visitor.groupName,
    sessionDate: today,
    checkinAt: new Date().toISOString(),
    checkoutAt: "",
    durationMinutes: null,
    hours: "",
    channel: input.channel || (isVisit ? "gps" : isKiosk ? "barcode" : "qr"),
    channelLabel: attendanceChannelLabel(
      input.channel || (isVisit ? "gps" : isKiosk ? "barcode" : "qr"),
      input.source || (isVisit ? "visit" : isKiosk ? "office_kiosk" : "field_qr"),
    ),
    siteId: site.id,
    siteName: site.name,
    source: input.source || (isVisit ? "visit" : isKiosk ? "office_kiosk" : "field_qr"),
  };
  records.push(record);
  return { action: "checkin", record: { ...record }, visitor: cloneWorker(visitor) };
}

export function mockVisitClockStatus(assignmentId: string, visitorId?: string) {
  const visitor =
    findVolunteer({ visitorId: visitorId || "V-YH-MEAL01" }) ?? volunteers[0];
  const today = taipeiToday();
  const open =
    records
      .slice()
      .reverse()
      .find(
        (row) =>
          row.assignmentId === assignmentId &&
          row.sessionType === "訪查" &&
          !row.checkoutAt,
      ) ?? null;
  const latest =
    records
      .slice()
      .reverse()
      .find((row) => row.assignmentId === assignmentId && row.sessionType === "訪查") ?? null;
  return {
    visitor: cloneWorker(visitor),
    today,
    open: open ? { ...open } : null,
    latest: latest ? { ...latest } : null,
    sessionType: "訪查" as const,
  };
}

export function mockListAttendance(period?: string) {
  return records
    .filter((row) => !period || row.sessionDate.startsWith(period))
    .map((row) => ({ ...row }));
}

export function mockListVolunteers() {
  return volunteers.map(cloneWorker);
}

export function mockCreateVolunteer(input: {
  name: string;
  idNumber: string;
  phone: string;
  groupId: string;
}) {
  const idNumber = extractTaiwanId(input.idNumber);
  if (findVolunteer({ idNumber })) {
    throw Object.assign(new Error("此身分證已有志工資料"), { code: "VALIDATION_ERROR" });
  }
  const group = getVolunteerGroup(input.groupId);
  const visitor: MockVolunteer = {
    visitorId: `V-YH-${String(Date.now()).slice(-6)}`,
    name: input.name.trim(),
    phone: input.phone.trim(),
    idNumber,
    groupId: input.groupId,
    groupName: group?.name ?? input.groupId,
    status: "已核准",
    badgeNo: "",
  };
  volunteers.push(visitor);
  return cloneWorker(visitor);
}
