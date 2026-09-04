import {
  attendanceChannelLabel,
  extractTaiwanId,
  getVolunteerGroup,
  hoursFromMinutes,
  taipeiToday,
  type AttendanceRecord,
  type VolunteerClockStatus,
  type VolunteerWorker,
} from "@/lib/domain/volunteer-attendance";

function text(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function dateText(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 10);
  return taipeiToday(date);
}

export function mapGasVolunteer(row: Record<string, unknown> | null | undefined): VolunteerWorker | null {
  if (!row) return null;
  const groupId = text(row.volunteer_group);
  const group = getVolunteerGroup(groupId);
  return {
    visitorId: text(row.visitor_id),
    name: text(row.name),
    phone: text(row.phone),
    idNumber: extractTaiwanId(text(row.id_number)),
    groupId,
    groupName: text(row.group_name) || group?.name || groupId,
    status: text(row.status),
    badgeNo: text(row.badge_no),
  };
}

export function mapGasAttendanceRecord(
  row: Record<string, unknown> | null | undefined,
): AttendanceRecord | null {
  if (!row) return null;
  const durationRaw = row.duration_minutes;
  const durationMinutes =
    durationRaw === "" || durationRaw == null ? null : Number.parseInt(String(durationRaw), 10);
  const channel = text(row.channel);
  const source = text(row.source);
  return {
    attendanceId: text(row.attendance_id),
    visitorId: text(row.visitor_id),
    assignmentId: text(row.assignment_id),
    sessionType: text(row.session_type) || "志工出勤",
    workerName: text(row.worker_name) || text(row.name),
    idNumber: extractTaiwanId(text(row.id_number)),
    groupId: text(row.group_id),
    groupName: text(row.group_name),
    sessionDate: dateText(row.session_date),
    checkinAt: text(row.checkin_at),
    checkoutAt: text(row.checkout_at),
    durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
    hours: hoursFromMinutes(durationMinutes),
    channel,
    channelLabel: attendanceChannelLabel(channel, source),
    siteId: text(row.site_id),
    siteName: text(row.site_name),
    source,
  };
}

export function mapGasClockStatus(payload: Record<string, unknown>): VolunteerClockStatus {
  const visitor = mapGasVolunteer(
    (payload.visitor as Record<string, unknown> | undefined) ?? payload,
  );
  if (!visitor) {
    throw new Error("GAS 未回傳志工資料");
  }
  return {
    visitor,
    today: text(payload.today) || taipeiToday(),
    open: mapGasAttendanceRecord(payload.open as Record<string, unknown> | undefined),
  };
}
