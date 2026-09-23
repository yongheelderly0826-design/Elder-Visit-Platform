import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getHeadshotPreviewUrl } from "@/lib/domain/visitor-headshots";
import { getPassbookPreviewUrl, uploadVisitorPassbook } from "@/lib/domain/visitor-documents";
import { VOLUNTEER_CLOCK_COOKIE } from "@/lib/domain/volunteer-attendance";
import { resolveVisitorIdentity } from "@/lib/domain/demo-visitor-link";

type VisitorSelfProfile = {
  id: string;
  fullName: string;
  displayName: string | null;
  visitorCode: string | null;
  officialEmail: string | null;
  phone: string | null;
  rootUnitName: string | null;
  departmentName: string | null;
  jobTitle: string | null;
  workerType: string | null;
  headshotProcessedUrl: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  bankAccountLast5: string | null;
  bankName: string | null;
  bankCode: string | null;
  bankBranchName: string | null;
  bankAccountName: string | null;
  passbookCoverUrl: string | null;
  passbookUploadedAt: string | null;
  remittanceReviewStatus: string;
  serviceAvailability: Record<string, unknown>;
  profileCompletionStatus: string;
  qrCodePayload: string | null;
};

export async function GET(request: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return getDemoVisitorProfile(request);
  }

  const profile = await getProfileByAuthUser(authUser.id, authUser.email ?? "");

  if (!profile) {
    return NextResponse.json(
      {
        error: {
          code: "PROFILE_NOT_FOUND",
          message: "找不到你的訪員資料，請聯絡承辦管理者確認審核狀態。",
        },
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: profile, source: "supabase" });
}

export async function PATCH(request: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json(
      {
        error: {
          code: "SUPABASE_SESSION_REQUIRED",
          message: "示範登入不能正式更新資料，請使用審核後的 Supabase 帳號登入。",
        },
      },
      { status: 401 },
    );
  }

  const body = (await request.json()) as Partial<{
    phone: string;
    officialEmail: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    bankAccountLast5: string;
    bankName: string;
    bankCode: string;
    bankBranchName: string;
    bankAccountName: string;
    passbookCoverUrl: string;
    serviceAvailability: Record<string, unknown>;
  }>;
  const profile = await getProfileByAuthUser(authUser.id, authUser.email ?? "");

  if (!profile) {
    return NextResponse.json(
      {
        error: {
          code: "PROFILE_NOT_FOUND",
          message: "找不到你的訪員資料，請聯絡承辦管理者確認審核狀態。",
        },
      },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  const inlinePassbook = sanitizePassbookDataUrl(body.passbookCoverUrl, null);
  let passbookCoverUrl: string | null = null;
  if (inlinePassbook) {
    passbookCoverUrl = (await uploadVisitorPassbook(profile.id, inlinePassbook)) ?? inlinePassbook;
  }
  const patch: Record<string, unknown> = {
    phone: sanitizeText(body.phone, profile.phone),
    official_email: sanitizeText(body.officialEmail, profile.officialEmail),
    emergency_contact_name: sanitizeText(body.emergencyContactName, profile.emergencyContactName),
    emergency_contact_phone: sanitizeText(body.emergencyContactPhone, profile.emergencyContactPhone),
    bank_account_last5: sanitizeBankLast5(body.bankAccountLast5, profile.bankAccountLast5),
    bank_name: sanitizeText(body.bankName, profile.bankName),
    bank_code: sanitizeText(body.bankCode, profile.bankCode),
    bank_branch_name: sanitizeText(body.bankBranchName, profile.bankBranchName),
    bank_account_name: sanitizeText(body.bankAccountName, profile.bankAccountName),
    remittance_review_status: "pending",
    remittance_ready: false,
    service_availability: body.serviceAvailability ?? profile.serviceAvailability ?? {},
    profile_completion_status: "submitted",
    profile_completed_at: now,
    updated_at: now,
  };
  if (inlinePassbook) {
    patch.passbook_cover_url = passbookCoverUrl;
    patch.passbook_uploaded_at = now;
  }

  try {
    const supabase = createAdminClient();
    const updateResult = await (supabase as unknown as VisitorProfileUpdateClient)
      .from("visitor_profiles")
      .update(patch)
      .eq("id", profile.id);

    if (updateResult.error) {
      return NextResponse.json(
        {
          error: {
            code: "UPDATE_FAILED",
            message: "資料更新失敗，請稍後再試。",
          },
        },
        { status: 500 },
      );
    }

    await (supabase as unknown as RegistrationByAccountUpdateClient)
      .from("workspace_registration_requests")
      .update({
        profile_completion_status: "submitted",
        profile_submitted_at: now,
      })
      .eq("account_id", profile.accountId);

    const updatedProfile = await getProfileByAuthUser(authUser.id, authUser.email ?? "");
    return NextResponse.json({
      data: updatedProfile,
      source: "supabase",
      message: "資料已送出，等待承辦管理者確認。",
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "UPDATE_FAILED",
          message: "資料更新失敗，請確認 Supabase 管理端環境設定。",
        },
      },
      { status: 500 },
    );
  }
}

async function getAuthUser() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

async function getProfileByAuthUser(authUserId: string, email: string) {
  try {
    const supabase = createAdminClient();
    const { data: account, error: accountError } = await (supabase as unknown as AccountLookupClient)
      .from("accounts")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    const accountId = account?.id ?? (await getAccountIdByEmail(email));
    if (accountError || !accountId) return null;

    const { data, error } = await (supabase as unknown as VisitorProfileSelfClient)
      .from("visitor_profiles")
      .select(
        "id, account_id, full_name, display_name, visitor_code, official_email, phone, root_unit_name, department_name, job_title, worker_type, headshot_processed_url, emergency_contact_name, emergency_contact_phone, bank_account_last5, bank_name, bank_code, bank_branch_name, bank_account_name, passbook_cover_url, passbook_uploaded_at, remittance_review_status, service_availability, profile_completion_status, qr_code_payload",
      )
      .eq("account_id", accountId)
      .maybeSingle();

    if (error || !data) return null;
    return mapProfile({
      ...data,
      headshot_processed_url: await getHeadshotPreviewUrl(data.headshot_processed_url),
      passbook_cover_url: await getPassbookPreviewUrl(data.passbook_cover_url),
    });
  } catch {
    return null;
  }
}

async function getAccountIdByEmail(email: string) {
  if (!email) return null;

  try {
    const supabase = createAdminClient();
    const { data, error } = await (supabase as unknown as AccountLookupClient)
      .from("accounts")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (error || !data) return null;
    return data.id;
  } catch {
    return null;
  }
}

function getDemoVisitorProfile(request: NextRequest) {
  if (request.cookies.get("demo_role")?.value !== "visitor") {
    return NextResponse.json(
      {
        error: {
          code: "SUPABASE_SESSION_REQUIRED",
          message: "請使用訪員帳號登入後查看自己的資料。",
        },
      },
      { status: 401 },
    );
  }

  const email = request.cookies.get("demo_email")?.value?.toLowerCase() ?? "visitor@eldervisit.org";
  const { visitorId, name } = resolveVisitorIdentity({
    visitorId: request.cookies.get(VOLUNTEER_CLOCK_COOKIE)?.value,
    email,
    name: request.cookies.get("demo_name")?.value,
  });
  const fullName =
    name ||
    (email === "joe@elder.org" ? "Joe訪員" : "王訪員");
  const visitorCode = visitorId || "EV-115-YH-CIV-0001";
  const isJoe = email === "joe@elder.org";

  const data: VisitorSelfProfile = {
    id: visitorId ? `demo_${visitorId}` : "demo_visitor_profile",
    fullName,
    displayName: `永和區公所民政課-${fullName}`,
    visitorCode,
    officialEmail: email,
    phone: isJoe ? "0912-000-888" : "0912-000-001",
    rootUnitName: "永和區公所",
    departmentName: "民政課",
    jobTitle: "訪員",
    workerType: "civil_affairs",
    headshotProcessedUrl: null,
    emergencyContactName: isJoe ? "陳美玲" : "",
    emergencyContactPhone: isJoe ? "0912-111-222" : "",
    bankAccountLast5: isJoe ? "12345" : "",
    bankName: isJoe ? "台灣銀行" : "",
    bankCode: isJoe ? "004" : "",
    bankBranchName: isJoe ? "永和分行" : "",
    bankAccountName: fullName,
    passbookCoverUrl: null,
    passbookUploadedAt: null,
    remittanceReviewStatus: isJoe ? "approved" : "pending",
    serviceAvailability: isJoe
      ? { weekday: "平日白天", villages: "永和區各里", note: "Joe示範訪員" }
      : { weekday: "平日白天", villages: "可依派案調整" },
    profileCompletionStatus: isJoe ? "complete" : "incomplete",
    qrCodePayload: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://elder-visit-platform-ruby.vercel.app"}/verify/visitor/${encodeURIComponent(visitorCode)}`,
  };

  return NextResponse.json({ data, source: "demo" });
}

function mapProfile(row: VisitorProfileRow): VisitorSelfProfile & { accountId: string } {
  return {
    id: row.id,
    accountId: row.account_id,
    fullName: row.full_name,
    displayName: row.display_name,
    visitorCode: row.visitor_code,
    officialEmail: row.official_email,
    phone: row.phone,
    rootUnitName: row.root_unit_name,
    departmentName: row.department_name,
    jobTitle: row.job_title,
    workerType: row.worker_type,
    headshotProcessedUrl: row.headshot_processed_url,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactPhone: row.emergency_contact_phone,
    bankAccountLast5: row.bank_account_last5,
    bankName: row.bank_name,
    bankCode: row.bank_code,
    bankBranchName: row.bank_branch_name,
    bankAccountName: row.bank_account_name,
    passbookCoverUrl: row.passbook_cover_url,
    passbookUploadedAt: row.passbook_uploaded_at,
    remittanceReviewStatus: row.remittance_review_status,
    serviceAvailability: normalizeObject(row.service_availability),
    profileCompletionStatus: row.profile_completion_status,
    qrCodePayload: row.qr_code_payload,
  };
}

function sanitizeText(value: string | undefined, fallback: string | null) {
  return typeof value === "string" ? value.trim() : fallback;
}

function sanitizeBankLast5(value: string | undefined, fallback: string | null) {
  if (typeof value !== "string") return fallback;
  const digits = value.replace(/\D/g, "").slice(-5);
  return digits || null;
}

function sanitizePassbookDataUrl(value: string | undefined, fallback: string | null) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  if (!value.startsWith("data:image/")) return fallback;
  if (value.length > 1_500_000) return fallback;
  return value;
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

type AccountLookupClient = {
  from(table: "accounts"): {
    select(query: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{
          data: { id: string } | null;
          error: unknown;
        }>;
      };
    };
  };
};

type VisitorProfileRow = {
  id: string;
  account_id: string;
  full_name: string;
  display_name: string | null;
  visitor_code: string | null;
  official_email: string | null;
  phone: string | null;
  root_unit_name: string | null;
  department_name: string | null;
  job_title: string | null;
  worker_type: string | null;
  headshot_processed_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  bank_account_last5: string | null;
  bank_name: string | null;
  bank_code: string | null;
  bank_branch_name: string | null;
  bank_account_name: string | null;
  passbook_cover_url: string | null;
  passbook_uploaded_at: string | null;
  remittance_review_status: string;
  service_availability: unknown;
  profile_completion_status: string;
  qr_code_payload: string | null;
};

type VisitorProfileSelfClient = {
  from(table: "visitor_profiles"): {
    select(query: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{
          data: VisitorProfileRow | null;
          error: unknown;
        }>;
      };
    };
  };
};

type VisitorProfileUpdateClient = {
  from(table: "visitor_profiles"): {
    update(row: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{
        data: unknown;
        error: unknown;
      }>;
    };
  };
};

type RegistrationByAccountUpdateClient = {
  from(table: "workspace_registration_requests"): {
    update(row: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{
        data: unknown;
        error: unknown;
      }>;
    };
  };
};
