import { validateTaiwanId } from "@/lib/domain/mohw-life-care-validation";
import { normalizeTaiwanMobilePhone } from "@/lib/domain/phone";
import { extractTaiwanId } from "@/lib/domain/volunteer-attendance";
import type { VisitorRegistrationWorkerGroup } from "@/lib/domain/types";
import {
  defaultDeskJobTitle,
  visitorRegistrationDepartments,
  visitorRegistrationJobTitles,
  type VisitorRegistrationDepartment,
  type VisitorRegistrationJobTitle,
} from "@/lib/domain/visitor-registration-options";

export type DeskVisitorGender = "男" | "女" | "其他";

export type DeskVisitorFormValues = {
  name: string;
  phone: string;
  email: string;
  idNumber: string;
  gender: DeskVisitorGender;
  workerGroup: VisitorRegistrationWorkerGroup;
  departmentName: VisitorRegistrationDepartment | string;
  departmentOther: string;
  jobTitle: string;
  /** Compact JPEG data URL for create; optional on edit. */
  photoUrl: string | null;
};

export const DESK_VISITOR_REQUIRED_HINT =
  "必填：姓名、信箱、身分證字號、手機、自拍證件照、職稱、民政／社政。";

export const DESK_VISITOR_EDIT_REQUIRED_HINT =
  "必填：姓名、信箱、身分證字號、手機、職稱、民政／社政。";

const ALLOWED_JOB_TITLES = new Set<string>(visitorRegistrationJobTitles);
const ALLOWED_DEPARTMENTS = new Set<string>(visitorRegistrationDepartments);

export function emptyDeskVisitorForm(
  workerGroup: VisitorRegistrationWorkerGroup = "civil_affairs",
): DeskVisitorFormValues {
  return {
    name: "",
    phone: "",
    email: "",
    idNumber: "",
    gender: "女",
    workerGroup,
    departmentName: workerGroup === "social_affairs" ? "志工" : "民政課",
    departmentOther: "",
    jobTitle: defaultDeskJobTitle(workerGroup),
    photoUrl: null,
  };
}

export function normalizeDeskJobTitle(raw: unknown): string {
  const title = String(raw ?? "").trim();
  if (!title) return "";
  return ALLOWED_JOB_TITLES.has(title) ? title : title.slice(0, 20);
}

export function normalizeDeskDepartment(raw: unknown): string {
  const name = String(raw ?? "").trim();
  if (!name) return "";
  return ALLOWED_DEPARTMENTS.has(name) ? name : name.slice(0, 40);
}

export function deskVisitorCreateCanSubmit(values: DeskVisitorFormValues): boolean {
  return Boolean(
    values.name.trim() &&
      values.email.trim() &&
      values.idNumber.trim() &&
      values.phone.trim() &&
      values.jobTitle.trim() &&
      values.workerGroup &&
      values.photoUrl,
  );
}

export function deskVisitorEditCanSubmit(
  values: Pick<
    DeskVisitorFormValues,
    "name" | "email" | "idNumber" | "phone" | "jobTitle" | "workerGroup"
  >,
): boolean {
  return Boolean(
    values.name.trim() &&
      values.email.trim() &&
      values.idNumber.trim() &&
      values.phone.trim() &&
      values.jobTitle.trim() &&
      values.workerGroup,
  );
}

export type DeskVisitorValidatedPayload = {
  name: string;
  phone: string;
  email: string;
  idNumber: string;
  gender: DeskVisitorGender;
  workerGroup: VisitorRegistrationWorkerGroup;
  department: string;
  jobTitle: string;
  photoUrl: string;
};

/**
 * Server-side validation for desk create. Returns Chinese error message or null + payload.
 */
export function validateDeskVisitorCreate(body: {
  name?: string;
  phone?: string;
  email?: string;
  idNumber?: string;
  gender?: string;
  workerGroup?: string;
  departmentName?: string;
  departmentOther?: string;
  jobTitle?: string;
  photoUrl?: string;
}): { error: string } | { data: DeskVisitorValidatedPayload } {
  const name = String(body.name ?? "").trim();
  const phone = normalizeTaiwanMobilePhone(body.phone);
  const email = String(body.email ?? "").trim().toLowerCase();
  const idNumber = extractTaiwanId(body.idNumber);
  const workerGroup: VisitorRegistrationWorkerGroup =
    body.workerGroup === "social_affairs" ? "social_affairs" : "civil_affairs";
  const jobTitle =
    normalizeDeskJobTitle(body.jobTitle) || defaultDeskJobTitle(workerGroup);
  const genderRaw = String(body.gender ?? "").trim();
  const gender: DeskVisitorGender =
    genderRaw === "男" || genderRaw === "其他" ? genderRaw : "女";
  const departmentName = normalizeDeskDepartment(body.departmentName) || "民政課";
  const departmentOther = String(body.departmentOther ?? "").trim();
  const department =
    departmentName === "其他" ? departmentOther || "其他" : departmentName;
  const photoUrl = String(body.photoUrl ?? "").trim();

  if (!name || !phone || !email || !idNumber || !photoUrl) {
    return {
      error: "新增訪查員請填姓名、手機、身分證、信箱與證件照。",
    };
  }
  if (!/^09\d{8}$/.test(phone)) {
    return { error: "手機請填 09 開頭的 10 碼數字。" };
  }
  if (!email.includes("@")) {
    return { error: "請填有效信箱。" };
  }
  if (!validateTaiwanId(idNumber)) {
    return { error: "身分證字號格式不正確。" };
  }
  if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(photoUrl)) {
    return { error: "請上傳自拍證件照。" };
  }
  if (!jobTitle) {
    return { error: "請選擇職稱／身分別。" };
  }

  return {
    data: {
      name,
      phone,
      email,
      idNumber,
      gender,
      workerGroup,
      department,
      jobTitle,
      photoUrl,
    },
  };
}

export function validateDeskVisitorUpdate(body: {
  name?: string;
  phone?: string;
  email?: string;
  idNumber?: string;
  workerGroup?: string;
  jobTitle?: string;
  gender?: string;
  departmentName?: string;
  departmentOther?: string;
}): { error: string } | {
  data: {
    name: string;
    phone: string;
    email: string;
    idNumber: string;
    gender: DeskVisitorGender;
    workerGroup: VisitorRegistrationWorkerGroup;
    department: string;
    jobTitle: string;
  };
} {
  const name = String(body.name ?? "").trim();
  const phone = normalizeTaiwanMobilePhone(body.phone);
  const email = String(body.email ?? "").trim().toLowerCase();
  const idNumber = extractTaiwanId(body.idNumber);
  const workerGroup: VisitorRegistrationWorkerGroup =
    body.workerGroup === "social_affairs" ? "social_affairs" : "civil_affairs";
  const jobTitle =
    normalizeDeskJobTitle(body.jobTitle) || defaultDeskJobTitle(workerGroup);
  const genderRaw = String(body.gender ?? "").trim();
  const gender: DeskVisitorGender =
    genderRaw === "男" || genderRaw === "其他" ? genderRaw : "女";
  const departmentName = normalizeDeskDepartment(body.departmentName) || "";
  const departmentOther = String(body.departmentOther ?? "").trim();
  const department =
    departmentName === "其他"
      ? departmentOther || "其他"
      : departmentName;

  if (!name || !phone || !email || !idNumber) {
    return {
      error: "請填姓名、手機、身分證與信箱。",
    };
  }
  if (!/^09\d{8}$/.test(phone)) {
    return { error: "手機請填 09 開頭的 10 碼數字。" };
  }
  if (!email.includes("@")) {
    return { error: "請填有效信箱。" };
  }
  if (!validateTaiwanId(idNumber)) {
    return { error: "身分證字號格式不正確。" };
  }

  return {
    data: {
      name,
      phone,
      email,
      idNumber,
      gender,
      workerGroup,
      department,
      jobTitle,
    },
  };
}

export type { VisitorRegistrationJobTitle };
