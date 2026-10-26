import type { VisitorRegistrationWorkerGroup } from "@/lib/domain/types";

/** Client-safe constants／types — 勿從此檔再 import 含 node:crypto 的 user-management。 */

export const visitorRegistrationDepartments = [
  "志工",
  "所本部",
  "民政課",
  "會計室",
  "社會人文課",
  "經建課",
  "工務課",
  "秘書室",
  "人事室",
  "政風室",
  "役政災防課",
  "其他",
] as const;

export type VisitorRegistrationDepartment =
  (typeof visitorRegistrationDepartments)[number];

export const visitorRegistrationJobTitles = [
  "公所人員",
  "里長",
  "里幹事",
  "社工",
  "志工",
  "其他（鄰長）",
  "其他",
] as const;

export type VisitorCorrectionResult = {
  requestId: string;
  visitorId: string;
  fullName: string;
  phone: string;
  photoUpdated: boolean;
  displayName: string | null;
  workerGroup: VisitorRegistrationWorkerGroup | null;
  departmentName: string | null;
  departmentOther: string | null;
  message: string;
};
