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

/**
 * 訪查員職稱／身分別（註冊、紙本 KEY 編輯共用）。
 * 含衛福社政／民政角色用詞，以及永和在地「電話問安」。
 */
export const visitorRegistrationJobTitles = [
  "公所人員",
  "里長",
  "村里長",
  "里幹事",
  "村里幹事",
  "社會局/處",
  "社工",
  "志工",
  "電話問安",
  "其他（鄰長）",
  "其他",
] as const;

export type VisitorRegistrationJobTitle =
  (typeof visitorRegistrationJobTitles)[number];

/** 紙本 KEY 編輯：民政職稱／身分別（含註冊用詞與永和「電話問安」） */
export const deskCivilJobTitles = [
  "公所人員",
  "村里長",
  "村里幹事",
  "里長",
  "里幹事",
  "其他（鄰長）",
  "電話問安",
] as const satisfies readonly VisitorRegistrationJobTitle[];

/** 紙本 KEY 編輯：社政職稱／身分別 */
export const deskSocialJobTitles = [
  "社會局/處",
  "社工",
  "志工",
  "其他",
  "電話問安",
] as const satisfies readonly VisitorRegistrationJobTitle[];

export function deskJobTitlesForWorkerGroup(
  workerGroup: VisitorRegistrationWorkerGroup,
): readonly VisitorRegistrationJobTitle[] {
  return workerGroup === "social_affairs" ? deskSocialJobTitles : deskCivilJobTitles;
}

export function defaultDeskJobTitle(
  workerGroup: VisitorRegistrationWorkerGroup,
): VisitorRegistrationJobTitle {
  return workerGroup === "social_affairs" ? "志工" : "公所人員";
}

/** 職稱 → 關懷表社政／民政「訪查人身分」官方允許值 */
export function mapJobTitleToMohwWorkerRole(
  kind: "civil" | "social",
  jobTitle: string | null | undefined,
): { role: string; roleOther?: string } {
  const title = String(jobTitle ?? "").trim();

  if (kind === "civil") {
    if (title === "村里長" || title === "里長") return { role: "村里長" };
    if (title === "村里幹事" || title === "里幹事") return { role: "村里幹事" };
    if (title === "公所人員") return { role: "公所人員" };
    // 電話問安／鄰長等非官表身分：民政側歸公所人員
    return { role: "公所人員" };
  }

  if (title === "社會局/處") return { role: "社會局/處" };
  if (title === "社工") return { role: "社工" };
  if (title === "志工") return { role: "志工" };
  if (title === "電話問安") return { role: "其他", roleOther: "電話問安" };
  if (title === "其他（鄰長）") return { role: "其他", roleOther: "鄰長" };
  if (title === "其他") return { role: "其他", roleOther: undefined };
  // 民政職稱被勾到社政欄時：保守用社會局/處
  return { role: "社會局/處" };
}

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
