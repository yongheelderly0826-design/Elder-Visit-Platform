import { getCurrentWorkspace } from "@/lib/domain/mock-data";
import { getRuntimeEnvValue, hasRuntimeEnvValue } from "@/lib/runtime/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { getHeadshotPreviewUrl, uploadRegistrationHeadshot } from "@/lib/domain/visitor-headshots";
import { createGasOneTimeToken } from "@/lib/auth/gas-password";
import { gasClient, type GasRegistrationRow } from "@/lib/gas-client";
import type {
  UserRegistrationBatchDecision,
  UserRegistrationBatchDecisionResult,
  UserRegistrationDecision,
  UserRegistrationDecisionResult,
  UserRegistrationRequest,
  VisitorInvitationResult,
  VisitorRegistrationSubmission,
  VisitorRegistrationSubmissionResult,
  VisitorRegistrationWorkerGroup,
  VisitorRemittanceReviewStatus,
  WorkspaceRoleKey,
} from "@/lib/domain/types";

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
];

export const visitorRegistrationJobTitles = [
  "公所人員",
  "里長",
  "里幹事",
  "社工",
  "志工",
  "其他（鄰長）",
  "其他",
];

export async function getUserManagementOverview() {
  const workspace = getCurrentWorkspace();
  const useSupabase = isSupabaseUserManagementConfigured();
  const requests = useSupabase
    ? await getSupabaseRegistrationRequests()
    : (await gasClient.registrations.list()).map(mapGasRegistrationRow);

  return {
    workspace,
    registrationRequests: requests,
    flow: [
      "使用者建立帳號並完成 email 驗證。",
      "新訪員填寫清冊欄位：姓名、性別、身分證字號、民政/社政、職稱、公務信箱與教育訓練。",
      "系統依單位、姓名、職稱產生暱稱，並建立白底一寸證件照預覽。",
      "承辦管理者先審核工作空間與角色，再送社會局覆核訪查資格。",
      "覆核通過後建立訪員身分與工作空間權限，完成資料確認後才可納入派案。",
    ],
  };
}

export function createVisitorDisplayName(
  submission: Pick<
    VisitorRegistrationSubmission,
    "rootUnitName" | "departmentName" | "departmentOther" | "fullName" | "jobTitle" | "jobTitleOther"
  >,
) {
  const department =
    submission.departmentName === "其他"
      ? submission.departmentOther?.trim() || "其他單位"
      : submission.departmentName;
  const jobTitle =
    submission.jobTitle === "其他"
      ? submission.jobTitleOther?.trim() || "其他職稱"
      : submission.jobTitle === "其他（鄰長）"
        ? "鄰長"
        : submission.jobTitle;

  return `${submission.rootUnitName}${department}-${submission.fullName || "未填姓名"}-${jobTitle}`;
}

function getInitialProfileCompletionStatus(submission: VisitorRegistrationSubmission) {
  return submission.fullName &&
    submission.email &&
    submission.nationalId &&
    submission.phone &&
    submission.headshotProcessedUrl
    ? "submitted"
    : "incomplete";
}

export async function submitVisitorRegistration(
  submission: VisitorRegistrationSubmission,
): Promise<VisitorRegistrationSubmissionResult> {
  const normalizedSubmission = normalizeVisitorRegistrationSubmission(submission);

  if (!submission.headshotOriginalUrl || !submission.headshotProcessedUrl) {
    throw new Error("請先拍攝或選擇自拍證件照後再送出註冊。");
  }
  if (!isSupportedCompactImageDataUrl(submission.headshotOriginalUrl)) {
    throw new Error("自拍原始照片格式或大小不符合保存規格，請重新拍攝或選擇較小的照片。");
  }
  if (!isSupportedCompactImageDataUrl(submission.headshotProcessedUrl)) {
    throw new Error("自拍證件照預覽格式或大小不符合保存規格，請重新拍攝或選擇較小的照片。");
  }

  const displayName = createVisitorDisplayName(normalizedSubmission);
  const submittedAt = new Date().toISOString();
  const profileCompletionStatus = getInitialProfileCompletionStatus(normalizedSubmission);
  const request: UserRegistrationRequest = {
    id: `reg_${Date.now()}`,
    email: normalizedSubmission.email,
    fullName: normalizedSubmission.fullName,
    requestedUnitName: `${submission.rootUnitName}${
      submission.departmentName === "其他"
        ? submission.departmentOther || "其他單位"
        : submission.departmentName
    }`,
    requestedWorkspaceId: normalizedSubmission.requestedWorkspaceId,
    requestedWorkspaceName: normalizedSubmission.requestedWorkspaceName,
    requestedRoleKey: "visitor",
    status: normalizedSubmission.trainingCompleted ? "pending_social_bureau_review" : "pending_supervisor_review",
    submittedAt,
    reviewNote: normalizedSubmission.trainingCompleted
      ? "訪員已送出註冊資料，待承辦與社會局覆核。"
      : "尚未完成教育訓練，需承辦先退補或保留待補。",
    visitorRegistrationProfile: {
      ...normalizedSubmission,
      displayName,
      socialBureauReviewStatus: normalizedSubmission.trainingCompleted ? "pending" : "not_sent",
      socialBureauReviewedAt: null,
      socialBureauReviewNote: null,
      registrationCode: null,
      authInviteStatus: "not_sent",
      authInvitedAt: null,
      authInviteSentCount: 0,
      authActivatedAt: null,
      profileCompletionStatus,
      profileSubmittedAt: profileCompletionStatus === "submitted" ? submittedAt : null,
      profileReviewedAt: null,
      profileReturnReason: null,
      visitorCode: null,
      qrCodePayload: null,
      bankAccountLast5: null,
      bankName: null,
      bankCode: null,
      bankBranchName: null,
      bankAccountName: null,
      passbookCoverUrl: null,
      passbookUploadedAt: null,
      remittanceReviewStatus: "pending",
      remittanceReady: false,
    },
  };

  if (!isSupabaseUserManagementConfigured()) {
    try {
      const saved = await gasClient.registrations.create(toGasRegistrationInput(request));
      return {
        request: mapGasRegistrationRow(saved),
        message: `${displayName} 的訪員註冊資料已送出。`,
        nextStep: "承辦管理者可在使用者管理頁進行審核。",
        source: "gas",
        warning: null,
      };
    } catch (error) {
      throw new Error(toGasUserMessage(error, "註冊資料未能寫入 Google Sheets，請稍後再試。"));
    }
  }

  const supabaseResult = await insertSupabaseRegistrationRequest(request);
  if (!supabaseResult.request) {
    throw new Error(supabaseResult.warning ?? "註冊資料尚未儲存，請稍後再試；若持續失敗，請聯絡系統管理者。");
  }
  return {
    request: supabaseResult.request,
    message: `${displayName} 的訪員註冊資料已送出。`,
    nextStep: "承辦管理者可在使用者管理頁進行審核。",
    source: "supabase",
    warning: null,
  };
}

export async function reviewRegistration(
  decision: UserRegistrationDecision,
): Promise<UserRegistrationDecisionResult> {
  if (!isSupabaseUserManagementConfigured()) {
    try {
      const result = await gasClient.registrations.review({
        request_id: decision.requestId,
        decision: decision.decision,
        role_key: decision.roleKey,
        workspace_id: decision.workspaceId,
        note: decision.note,
      });
      return createGasRegistrationDecisionResult(result.registration, result.previously_completed);
    } catch (error) {
      throw new Error(toGasUserMessage(error, "Google Sheets 審核寫入失敗，請確認 GAS 已更新並重新整理。"));
    }
  }
  const supabaseResult = await reviewSupabaseRegistration(decision);
  if (supabaseResult) {
    return {
      ...supabaseResult,
      source: "supabase",
    };
  }
  throw new Error("核准未完成，請重新整理後再試；若持續失敗，請聯絡系統管理者。");
}

export async function reviewRegistrationsBatch(
  decision: UserRegistrationBatchDecision,
): Promise<UserRegistrationBatchDecisionResult> {
  const requestIds = Array.from(new Set(decision.requestIds.filter(Boolean)));
  if (requestIds.length === 0) {
    throw new Error("沒有可批次核准的待審核申請。");
  }

  if (!isSupabaseUserManagementConfigured()) {
    try {
      const gasResults = await gasClient.registrations.batchReview({
        request_ids: requestIds,
        decision: decision.decision,
        role_key: "visitor",
        workspace_id: decision.workspaceId,
        note: decision.note,
      });
      const results: UserRegistrationDecisionResult[] = gasResults.map((item, index) => {
        if ("error" in item) {
          return {
            requestId: item.request_id || requestIds[index],
            status: "pending_social_bureau_review",
            message: item.error,
            nextStep: "請重新整理後再單筆重試。",
            source: "gas",
          };
        }
        return createGasRegistrationDecisionResult(item.registration, item.previously_completed);
      });
      const approved = gasResults.filter(
        (item) =>
          "registration" in item &&
          !item.previously_completed &&
          item.registration.status === "approved",
      ).length;
      const failed = gasResults.filter((item) => "error" in item).length;
      const skipped = gasResults.filter((item) => "previously_completed" in item && item.previously_completed).length;
      return {
        total: requestIds.length,
        approved,
        skipped,
        failed,
        results,
        message: `整批核准完成：${approved} 筆通過、${skipped} 筆已處理、${failed} 筆未完成。`,
        nextStep: "請接續產生一次性設定密碼連結。",
        source: "gas",
      };
    } catch (error) {
      throw new Error(toGasUserMessage(error, "Google Sheets 整批審核失敗，請確認 GAS 已更新。"));
    }
  }

  const supabase = createAdminClient();
  const results: UserRegistrationDecisionResult[] = [];
  let approved = 0;
  let skipped = 0;
  let failed = 0;

  for (const requestId of requestIds) {
    const { data: currentRequest, error } = await (supabase as unknown as RegistrationRequestByIdClient)
      .from("workspace_registration_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (error || !currentRequest) {
      failed += 1;
      results.push({
        requestId,
        status: "pending_social_bureau_review",
        message: "找不到這筆申請，無法核准。",
        nextStep: "請重新整理使用者管理頁後再試一次。",
        source: "supabase",
      });
      continue;
    }

    if (currentRequest.status === "approved" || currentRequest.status === "rejected") {
      skipped += 1;
      results.push({
        ...createRegistrationDecisionResult(currentRequest, true),
        source: "supabase",
      });
      continue;
    }

    const result = await reviewRegistration({
      requestId,
      decision: "approve",
      roleKey: normalizeWorkspaceRoleKey(currentRequest.requested_role_key),
      workspaceId: currentRequest.requested_workspace_id ?? decision.workspaceId,
      note: decision.note,
    });

    if (result.status === "approved") {
      approved += 1;
    } else {
      failed += 1;
    }
    results.push(result);
  }

  return {
    total: requestIds.length,
    approved,
    skipped,
    failed,
    results,
    message:
      failed > 0
        ? `整批核准完成：${approved} 筆通過、${skipped} 筆已處理、${failed} 筆未完成。`
        : `整批核准完成：${approved} 筆通過、${skipped} 筆已處理。`,
    nextStep: "請接續到已通過名冊發送登入邀請，或確認待補資料狀態。",
    source: "supabase",
  };
}

export async function inviteApprovedVisitor(
  requestId: string,
  origin: string,
): Promise<VisitorInvitationResult> {
  if (!isSupabaseUserManagementConfigured()) {
    return issueGasPasswordLink(requestId, origin, "invite");
  }
  try {
    const supabase = createAdminClient();
    const { data: request, error } = await (supabase as unknown as RegistrationRequestByIdClient)
      .from("workspace_registration_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (error || !request) {
      return {
        requestId,
        email: "",
        status: "failed",
        message: "找不到這筆已通過訪員註冊資料。",
        nextStep: "請重新整理使用者管理頁後再試一次。",
      };
    }

    if (request.status !== "approved") {
      return {
        requestId,
        email: request.email,
        status: "failed",
        message: "這筆註冊尚未審核通過，不能發送登入邀請。",
        nextStep: "請先完成核准加入，再發送登入邀請。",
      };
    }

    if (request.auth_invite_status === "activated") {
      return {
        requestId,
        email: request.email,
        status: "activated",
        message: "此訪員已完成帳號啟用。",
        nextStep: "無需重寄邀請，請接續確認補充資料與可派案狀態。",
      };
    }

    const redirectTo = `${origin}/login?invited=1`;
    const inviteResult = await supabase.auth.admin.inviteUserByEmail(request.email, {
      redirectTo,
      data: {
        full_name: request.full_name,
        role_key: request.requested_role_key,
        visitor_code: request.visitor_code,
        registration_code: request.registration_code,
      },
    });

    if (inviteResult.error || !inviteResult.data.user) {
      await updateInvitationStatus(supabase, request, "failed", null);
      return {
        requestId,
        email: request.email,
        status: "failed",
        message: "登入邀請發送失敗。",
        nextStep: "請確認系統寄信設定後再重寄邀請。",
      };
    }

    await updateInvitationStatus(supabase, request, "sent", inviteResult.data.user.id);

    return {
      requestId,
      email: request.email,
      status: "sent",
      message: `已發送登入設定邀請到 ${request.email}。`,
      nextStep: "訪員收到信後可進入設定密碼流程；若未收到，可在後台重寄邀請。",
    };
  } catch {
    return {
      requestId,
      email: "",
      status: "failed",
      message: "登入邀請目前無法發送。",
      nextStep: "請稍後重試；若持續失敗，請聯絡系統管理者。",
    };
  }
}

export async function issueGasPasswordLink(
  requestId: string,
  origin: string,
  mode: "invite" | "recovery",
): Promise<VisitorInvitationResult> {
  const { token, tokenHash } = createGasOneTimeToken();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const url = new URL("/login", origin);
  url.searchParams.set("gas_token", token);
  url.searchParams.set("mode", mode);
  try {
    const issued = await gasClient.accounts.issueToken({
      request_id: requestId,
      mode,
      token_hash: tokenHash,
      expires_at: expiresAt,
      setup_url: url.toString(),
    });
    return {
      requestId,
      email: issued.email,
      status: mode === "invite" ? "sent" : "activated",
      message:
        mode === "invite"
          ? `設定密碼信已寄到 ${issued.email}。`
          : `重設密碼信已寄到 ${issued.email}。`,
      nextStep: "請訪員在 30 分鐘內開啟信件中的一次性連結；管理者也可複製連結備用。",
      setupUrl: url.toString(),
      expiresAt,
    };
  } catch (error) {
    throw new Error(toGasUserMessage(error, mode === "invite" ? "無法產生設定密碼連結。" : "無法產生重設密碼連結。"));
  }
}

function isSupabaseUserManagementConfigured() {
  return (
    getRuntimeEnvValue("USER_MANAGEMENT_BACKEND") === "supabase" &&
    hasRuntimeEnvValue("NEXT_PUBLIC_SUPABASE_URL") &&
    hasRuntimeEnvValue("SUPABASE_SERVICE_ROLE_KEY")
  );
}

function toGasRegistrationInput(request: UserRegistrationRequest): Record<string, unknown> {
  return {
    request_id: request.id,
    email: request.email,
    full_name: request.fullName,
    requested_unit_name: request.requestedUnitName,
    requested_workspace_id: request.requestedWorkspaceId,
    requested_workspace_name: request.requestedWorkspaceName,
    requested_role_key: request.requestedRoleKey,
    status: request.status,
    review_note: request.reviewNote,
    submitted_at: request.submittedAt,
    profile: request.visitorRegistrationProfile ?? {},
  };
}

function mapGasRegistrationRow(row: GasRegistrationRow): UserRegistrationRequest {
  const profile = row.profile ?? {};
  const hasProfile = Object.keys(profile).length > 0;
  const value = (key: string) => profile[key];
  const text = (key: string, fallback = "") =>
    typeof value(key) === "string" ? (value(key) as string) : fallback;
  const nullableText = (key: string) => text(key) || null;

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    requestedUnitName: row.requested_unit_name || "未指定單位",
    requestedWorkspaceId: row.requested_workspace_id,
    requestedWorkspaceName: row.requested_workspace_name || getCurrentWorkspace().name,
    requestedRoleKey: normalizeRoleKey(row.requested_role_key),
    status: normalizeRegistrationStatus(row.status),
    submittedAt: row.submitted_at,
    reviewNote: row.review_note,
    visitorRegistrationProfile: hasProfile
      ? {
          rootUnitName: text("rootUnitName", "永和區公所"),
          departmentName: text("departmentName", "其他"),
          departmentOther: nullableText("departmentOther"),
          jobTitle: text("jobTitle", "其他"),
          jobTitleOther: nullableText("jobTitleOther"),
          displayName: text("displayName", row.full_name),
          gender: normalizeGender(nullableText("gender")),
          nationalId: text("nationalId"),
          workerGroup: normalizeWorkerGroup(nullableText("workerGroup")),
          officialEmail: text("officialEmail", row.email),
          phone: text("phone"),
          trainingCompleted: Boolean(value("trainingCompleted")),
          trainingCompletedAt: nullableText("trainingCompletedAt"),
          visitorCertificateNo: nullableText("visitorCertificateNo"),
          headshotOriginalUrl: nullableText("headshotOriginalUrl"),
          headshotProcessedUrl: nullableText("headshotProcessedUrl"),
          socialBureauReviewStatus: normalizeReviewStatus(nullableText("socialBureauReviewStatus")),
          socialBureauReviewedAt: nullableText("socialBureauReviewedAt"),
          socialBureauReviewNote: nullableText("socialBureauReviewNote"),
          registrationCode: nullableText("registrationCode"),
          authInviteStatus: normalizeAuthInviteStatus(nullableText("authInviteStatus")),
          authInvitedAt: nullableText("authInvitedAt"),
          authInviteSentCount: Number(value("authInviteSentCount") || 0),
          authActivatedAt: nullableText("authActivatedAt"),
          profileCompletionStatus: normalizeProfileCompletionStatus(nullableText("profileCompletionStatus")),
          profileSubmittedAt: nullableText("profileSubmittedAt"),
          profileReviewedAt: nullableText("profileReviewedAt"),
          profileReturnReason: nullableText("profileReturnReason"),
          visitorCode: nullableText("visitorCode") ?? row.visitor_id,
          qrCodePayload: nullableText("qrCodePayload"),
          bankAccountLast5: nullableText("bankAccountLast5"),
          bankName: nullableText("bankName"),
          bankCode: nullableText("bankCode"),
          bankBranchName: nullableText("bankBranchName"),
          bankAccountName: nullableText("bankAccountName"),
          passbookCoverUrl: nullableText("passbookCoverUrl"),
          passbookUploadedAt: nullableText("passbookUploadedAt"),
          remittanceReviewStatus: normalizeRemittanceReviewStatus(nullableText("remittanceReviewStatus")),
          remittanceReady: Boolean(value("remittanceReady")),
          note: nullableText("note"),
        }
      : undefined,
  };
}

function createGasRegistrationDecisionResult(
  row: GasRegistrationRow,
  previouslyCompleted: boolean,
): UserRegistrationDecisionResult {
  const request = mapGasRegistrationRow(row);
  const approved = request.status === "approved";
  return {
    requestId: request.id,
    status: request.status,
    message: approved
      ? `${request.fullName} 已通過加入申請。`
      : `${request.fullName} 的加入申請已退回。`,
    nextStep: previouslyCompleted
      ? "此申請已完成審核，無需重複操作。"
      : approved
        ? "訪員主檔與帳號已建立，請產生一次性設定密碼連結。"
        : "請通知申請人補正後重新提出申請。",
    source: "gas",
  };
}

function toGasUserMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    if (error.message.includes("not configured")) {
      return "GAS 尚未設定，請設定 GAS_WEB_APP_URL 與 GAS_API_TOKEN 後再試。";
    }
    return error.message;
  }
  return fallback;
}

async function updateInvitationStatus(
  supabase: unknown,
  request: WorkspaceRegistrationRequestRow,
  status: "sent" | "failed",
  authUserId: string | null,
) {
  const now = new Date().toISOString();

  await (supabase as RegistrationRequestReviewClient)
    .from("workspace_registration_requests")
    .update({
      auth_invite_status: status,
      auth_invited_at: status === "sent" ? now : request.auth_invited_at,
      auth_invite_sent_count:
        status === "sent" ? (request.auth_invite_sent_count ?? 0) + 1 : request.auth_invite_sent_count,
    })
    .eq("id", request.id);

  if (authUserId && request.account_id) {
    await (supabase as AccountAuthUserUpdateClient)
      .from("accounts")
      .update({
        auth_user_id: authUserId,
        updated_at: now,
      })
      .eq("id", request.account_id);
  }
}

async function reviewSupabaseRegistration(
  decision: UserRegistrationDecision,
): Promise<UserRegistrationDecisionResult | null> {
  try {
    const supabase = createAdminClient();
    const { data: currentRequest, error: currentError } = await (
      supabase as unknown as RegistrationRequestByIdClient
    )
      .from("workspace_registration_requests")
      .select("*")
      .eq("id", decision.requestId)
      .single();

    if (currentError || !currentRequest) {
      return null;
    }

    if (currentRequest.status === "approved" || currentRequest.status === "rejected") {
      return createRegistrationDecisionResult(currentRequest, true);
    }

    const reviewedAt = new Date().toISOString();
    const status = decision.decision === "approve" ? "approved" : "rejected";
    const reviewNote =
      decision.note ||
      (decision.decision === "approve" ? "承辦管理者已核准加入。" : "承辦管理者已退回申請。");

    const { data, error } = await (supabase as unknown as RegistrationRequestReviewClient)
      .from("workspace_registration_requests")
      .update({
        status,
        requested_role_key: decision.roleKey,
        requested_workspace_id: decision.workspaceId,
        review_note: reviewNote,
        reviewed_at: reviewedAt,
        social_bureau_review_status: status,
        social_bureau_reviewed_at: reviewedAt,
        social_bureau_review_note: reviewNote,
        profile_completion_status: decision.decision === "approve" ? "submitted" : "returned",
        profile_reviewed_at: reviewedAt,
        profile_return_reason: decision.decision === "reject" ? reviewNote : null,
      })
      .eq("id", decision.requestId)
      .eq("status", currentRequest.status)
      .select("*")
      .maybeSingle();

    if (error || !data) {
      const { data: latestRequest } = await (supabase as unknown as RegistrationRequestByIdClient)
        .from("workspace_registration_requests")
        .select("*")
        .eq("id", decision.requestId)
        .single();
      if (latestRequest?.status === "approved" || latestRequest?.status === "rejected") {
        return createRegistrationDecisionResult(latestRequest, true);
      }
      return null;
    }

    if (decision.decision === "approve") {
      await activateApprovedRegistration(supabase, data, decision);
    }

    return createRegistrationDecisionResult(data, false);
  } catch {
    return null;
  }
}

function createRegistrationDecisionResult(
  row: WorkspaceRegistrationRequestRow,
  previouslyCompleted: boolean,
): UserRegistrationDecisionResult {
  const request = mapRegistrationRow(row);
  const isApproved = request.status === "approved";

  return {
    requestId: request.id,
    status: request.status,
    message: isApproved
      ? `${request.fullName} 已通過加入申請。`
      : `${request.fullName} 的加入申請已退回。`,
    nextStep: previouslyCompleted
      ? "此申請已完成審核，無需重複操作。"
      : isApproved
        ? "後續可進行登入邀請與資料確認。"
        : "如需重新提出申請，請由申請人補正資料後再次送出。",
  };
}

async function activateApprovedRegistration(
  supabase: unknown,
  row: WorkspaceRegistrationRequestRow,
  decision: UserRegistrationDecision,
) {
  const workspaceId = row.requested_workspace_id ?? decision.workspaceId;
  if (!workspaceId) return;

  const { data: account } = await (supabase as AccountWriteClient)
    .from("accounts")
    .upsert(
      {
        email: row.email,
        full_name: row.full_name,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    )
    .select("id")
    .single();

  if (!account?.id) return;

  await (supabase as RegistrationRequestReviewClient)
    .from("workspace_registration_requests")
    .update({ account_id: account.id })
    .eq("id", row.id);

  await (supabase as WorkspaceMembershipWriteClient)
    .from("workspace_memberships")
    .upsert(
      {
        workspace_id: workspaceId,
        account_id: account.id,
        role_name: decision.roleKey,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,account_id" },
    );

  if (decision.roleKey === "visitor") {
    const visitorIdentity = await upsertVisitorProfile(supabase, row, account.id, workspaceId);
    await (supabase as RegistrationRequestReviewClient)
      .from("workspace_registration_requests")
      .update({
        visitor_code: visitorIdentity.visitorCode,
        qr_code_payload: visitorIdentity.qrCodePayload,
      })
      .eq("id", row.id);
  }
}

async function upsertVisitorProfile(
  supabase: unknown,
  row: WorkspaceRegistrationRequestRow,
  accountId: string,
  workspaceId: string,
) {
  const { data: existing } = await (supabase as VisitorProfileReviewClient)
    .from("visitor_profiles")
    .select("id, visitor_code")
    .eq("workspace_id", workspaceId)
    .eq("account_id", accountId)
    .limit(1)
    .maybeSingle();

  const workerType = normalizeWorkerGroup(row.worker_group) === "civil_affairs" ? "civil_affairs" : "social_affairs";
  const visitorCode =
    existing?.visitor_code ?? (await createVisitorCode(supabase, workspaceId, workerType, row.registration_code ?? row.id));
  const qrCodePayload = createVisitorQrCodePayload(visitorCode);
  const profileCompletionStatus = getRowProfileCompletionStatus(row);
  const now = new Date().toISOString();

  const profileRow = {
    workspace_id: workspaceId,
    account_id: accountId,
    full_name: row.full_name,
    status: profileCompletionStatus === "submitted" ? "available" : "pending_profile_completion",
    worker_type: workerType,
    visitor_code: visitorCode,
    visitor_certificate_no: row.visitor_certificate_no,
    certificate_status: row.visitor_certificate_no ? "valid" : "missing",
    training_date: row.training_completed_at,
    root_unit_name: row.root_unit_name,
    department_name: row.department_name,
    job_title: row.job_title,
    display_name: row.display_name ?? row.full_name,
    gender: normalizeGender(row.gender),
    national_id: row.national_id,
    official_email: row.official_email ?? row.email,
    phone: row.phone,
    headshot_processed_url: row.headshot_processed_url,
    social_bureau_review_status: "approved",
    social_bureau_reviewed_at: now,
    profile_completion_status: profileCompletionStatus,
    profile_completed_at: profileCompletionStatus === "submitted" ? (row.profile_submitted_at ?? now) : null,
    profile_reviewed_at: row.profile_reviewed_at,
    qr_code_payload: qrCodePayload,
    qr_code_generated_at: now,
    is_assignable: false,
    updated_at: now,
  };

  if (existing?.id) {
    await (supabase as VisitorProfileReviewClient)
      .from("visitor_profiles")
      .update(profileRow)
      .eq("id", existing.id);
    return { visitorCode, qrCodePayload };
  }

  await (supabase as VisitorProfileReviewClient).from("visitor_profiles").insert(profileRow);
  return { visitorCode, qrCodePayload };
}

async function getSupabaseRegistrationRequests(): Promise<UserRegistrationRequest[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await (supabase as unknown as RegistrationRequestClient)
      .from("workspace_registration_requests")
      .select("*")
      .order("submitted_at", { ascending: false })
      .limit(1000);

    if (error || !data) {
      return [];
    }

    const profiles = await getSupabaseVisitorProfileRemittance(data);

    const displayRows = await Promise.all(
      data.map(async (row) => ({
        ...row,
        headshot_processed_url: await getHeadshotPreviewUrl(row.headshot_processed_url),
      })),
    );

    return displayRows.map((row) => mapRegistrationRow(row, profiles.get(row.account_id ?? "")));
  } catch {
    return [];
  }
}

async function getSupabaseVisitorProfileRemittance(
  requests: WorkspaceRegistrationRequestRow[],
): Promise<Map<string, VisitorProfileRemittanceRow>> {
  const accountIds = Array.from(
    new Set(requests.map((request) => request.account_id).filter((id): id is string => Boolean(id))),
  );

  if (accountIds.length === 0) {
    return new Map();
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await (supabase as unknown as VisitorProfileRemittanceClient)
      .from("visitor_profiles")
      .select(
        "account_id, visitor_code, qr_code_payload, profile_completion_status, profile_reviewed_at, is_assignable, bank_account_last5, bank_name, bank_code, bank_branch_name, bank_account_name, passbook_cover_url, passbook_uploaded_at, remittance_review_status, remittance_ready",
      )
      .in("account_id", accountIds);

    if (error || !data) {
      return new Map();
    }

    return new Map(data.map((profile) => [profile.account_id, profile]));
  } catch {
    return new Map();
  }
}

async function insertSupabaseRegistrationRequest(
  request: UserRegistrationRequest,
): Promise<{
  request: UserRegistrationRequest | null;
  source: "supabase";
  warning: string | null;
}> {
  try {
    const supabase = createAdminClient();
    const workspace = await getSupabaseActiveWorkspace();
    const profile = request.visitorRegistrationProfile;
    const profileCompletionStatus = profile?.profileCompletionStatus ?? "incomplete";
    await assertNoDuplicateVisitorRegistration(supabase, workspace?.id ?? request.requestedWorkspaceId, request);
    const { data, error } = await (supabase as unknown as RegistrationRequestWriteClient)
      .from("workspace_registration_requests")
      .insert({
        registration_code: profile?.registrationCode ?? createRegistrationCode(request.submittedAt),
        email: request.email,
        full_name: request.fullName,
        requested_unit_name: request.requestedUnitName,
        requested_workspace_id: workspace?.id ?? null,
        requested_role_key: request.requestedRoleKey,
        status: request.status,
        review_note: request.reviewNote,
        submitted_at: request.submittedAt,
        root_unit_name: profile?.rootUnitName ?? null,
        department_name: profile?.departmentName ?? null,
        department_other: profile?.departmentOther ?? null,
        job_title: profile?.jobTitle ?? null,
        job_title_other: profile?.jobTitleOther ?? null,
        display_name: profile?.displayName ?? request.fullName,
        gender: profile?.gender ?? null,
        national_id: profile?.nationalId ?? null,
        worker_group: profile?.workerGroup ?? null,
        official_email: profile?.officialEmail ?? request.email,
        phone: profile?.phone ?? null,
        training_completed: profile?.trainingCompleted ?? false,
        training_completed_at: profile?.trainingCompletedAt ?? null,
        visitor_certificate_no: profile?.visitorCertificateNo ?? null,
        headshot_original_url: profile?.headshotOriginalUrl ?? null,
        headshot_processed_url: profile?.headshotProcessedUrl ?? null,
        social_bureau_review_status: profile?.socialBureauReviewStatus ?? "not_sent",
        social_bureau_reviewed_at: profile?.socialBureauReviewedAt ?? null,
        social_bureau_review_note: profile?.socialBureauReviewNote ?? null,
        auth_invite_status: profile?.authInviteStatus ?? "not_sent",
        auth_invited_at: profile?.authInvitedAt ?? null,
        auth_invite_sent_count: profile?.authInviteSentCount ?? 0,
        auth_activated_at: profile?.authActivatedAt ?? null,
        profile_completion_status: profileCompletionStatus,
        profile_submitted_at: profile?.profileSubmittedAt ?? (profileCompletionStatus === "submitted" ? request.submittedAt : null),
        profile_reviewed_at: profile?.profileReviewedAt ?? null,
        profile_return_reason: profile?.profileReturnReason ?? null,
      })
      .select("*")
      .single();

    if (error || !data) {
      console.error("Visitor registration insert failed.", error);
      return {
        request: null,
        source: "supabase",
        warning: "註冊資料尚未儲存，請稍後再試；若持續失敗，請聯絡系統管理者。",
      };
    }

    let savedRow = data;
    if (profile?.headshotProcessedUrl) {
      const storagePath = await uploadRegistrationHeadshot(data.id, profile.headshotProcessedUrl);
      if (storagePath) {
        const { data: storageRow } = await (supabase as unknown as RegistrationRequestReviewClient)
          .from("workspace_registration_requests")
          .update({
            headshot_original_url: null,
            headshot_processed_url: storagePath,
          })
          .eq("id", data.id)
          .select("*")
          .single();
        savedRow = storageRow ?? data;
      }
    }

    const previewUrl = await getHeadshotPreviewUrl(savedRow.headshot_processed_url);
    return {
      request: mapRegistrationRow({ ...savedRow, headshot_processed_url: previewUrl }),
      source: "supabase",
      warning: null,
    };
  } catch (error) {
    console.error("Visitor registration connection failed.", error);
    return {
      request: null,
      source: "supabase",
      warning: "註冊資料尚未儲存，請稍後再試；若持續失敗，請聯絡系統管理者。",
    };
  }
}

function normalizeVisitorRegistrationSubmission(
  submission: VisitorRegistrationSubmission,
): VisitorRegistrationSubmission {
  return {
    ...submission,
    email: normalizeRegistrationEmail(submission.email),
    fullName: submission.fullName.trim(),
    officialEmail: normalizeRegistrationEmail(submission.officialEmail),
    nationalId: normalizeRegistrationNationalId(submission.nationalId),
    phone: normalizeRegistrationPhone(submission.phone),
  };
}

function normalizeRegistrationEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeRegistrationNationalId(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}

function normalizeRegistrationPhone(value: string | null | undefined) {
  return (value ?? "").replace(/[^\d+]/g, "");
}

function getDuplicateRegistrationChecks(request: UserRegistrationRequest) {
  const profile = request.visitorRegistrationProfile;
  const checks = [
    {
      column: "email",
      value: normalizeRegistrationEmail(request.email),
      label: "登入信箱",
      profileColumn: null,
    },
    {
      column: "official_email",
      value: normalizeRegistrationEmail(profile?.officialEmail),
      label: "公務信箱",
      profileColumn: "official_email",
    },
    {
      column: "national_id",
      value: normalizeRegistrationNationalId(profile?.nationalId),
      label: "身分證字號",
      profileColumn: "national_id",
    },
    {
      column: "phone",
      value: normalizeRegistrationPhone(profile?.phone),
      label: "手機",
      profileColumn: "phone",
    },
  ];
  const seen = new Set<string>();
  return checks.filter((check) => {
    if (!check.value) return false;
    const key = `${check.column}:${check.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function assertNoDuplicateVisitorRegistration(
  supabase: unknown,
  workspaceId: string | null | undefined,
  request: UserRegistrationRequest,
) {
  if (!workspaceId || request.requestedRoleKey !== "visitor") {
    return;
  }

  const checks = getDuplicateRegistrationChecks(request);

  for (const check of checks) {
    if (check.profileColumn) {
      const { data: existingProfiles, error: profileError } = await (supabase as VisitorDuplicateProfileLookupClient)
        .from("visitor_profiles")
        .select("id, full_name, visitor_code, status")
        .eq("workspace_id", workspaceId)
        .eq(check.profileColumn, check.value)
        .limit(1);

      if (profileError) {
        throw new Error("目前無法完成重複資料檢查，請稍後再試。");
      }

      if (existingProfiles?.[0]) {
        const name = existingProfiles[0].full_name || request.fullName;
        const visitorCode = existingProfiles[0].visitor_code ? `（${existingProfiles[0].visitor_code}）` : "";
        throw new Error(`${check.label} 已有正式訪員 ${name}${visitorCode}，請勿重複送出註冊。`);
      }
    }

    const { data: existingRequests, error: requestError } = await (supabase as RegistrationDuplicateLookupClient)
      .from("workspace_registration_requests")
      .select("id, full_name, status, visitor_code")
      .eq("requested_workspace_id", workspaceId)
      .eq("requested_role_key", "visitor")
      .neq("status", "rejected")
      .eq(check.column, check.value)
      .order("submitted_at", { ascending: false })
      .limit(1);

    if (requestError) {
      throw new Error("目前無法完成重複資料檢查，請稍後再試。");
    }

    if (existingRequests?.[0]) {
      const existing = existingRequests[0];
      const statusText = existing.status === "approved" ? "已通過" : "待審核";
      throw new Error(`${check.label} 已有${statusText}申請，請勿重複送出；如需修改資料，請洽承辦管理者。`);
    }
  }
}

function isSupportedCompactImageDataUrl(value: string) {
  return value.startsWith("data:image/") && value.length <= 1_000_000;
}

async function getSupabaseActiveWorkspace() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await (supabase as unknown as ActiveWorkspaceClient)
      .from("workspaces")
      .select("id, workspace_name")
      .eq("status", "active")
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

function mapRegistrationRow(
  row: WorkspaceRegistrationRequestRow,
  remittanceProfile?: VisitorProfileRemittanceRow,
): UserRegistrationRequest {
  const fallbackWorkspace = getCurrentWorkspace();
  const workerGroup = normalizeWorkerGroup(row.worker_group);
  const status = normalizeRegistrationStatus(row.status);
  const socialBureauReviewStatus = normalizeReviewStatus(row.social_bureau_review_status);

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    requestedUnitName: row.requested_unit_name ?? row.root_unit_name ?? "未指定單位",
    requestedWorkspaceId: row.requested_workspace_id,
    requestedWorkspaceName: fallbackWorkspace.name,
    requestedRoleKey: normalizeRoleKey(row.requested_role_key),
    status,
    submittedAt: row.submitted_at,
    reviewNote: row.review_note,
    visitorRegistrationProfile:
      row.root_unit_name || row.department_name || row.job_title || row.national_id
        ? {
            rootUnitName: row.root_unit_name ?? "永和區公所",
            departmentName: row.department_name ?? "其他",
            departmentOther: row.department_other,
            jobTitle: row.job_title ?? "其他",
            jobTitleOther: row.job_title_other,
            displayName: row.display_name ?? row.full_name,
            gender: normalizeGender(row.gender),
            nationalId: row.national_id ?? "",
            workerGroup,
            officialEmail: row.official_email ?? row.email,
            phone: row.phone ?? "",
            trainingCompleted: Boolean(row.training_completed),
            trainingCompletedAt: row.training_completed_at,
            visitorCertificateNo: row.visitor_certificate_no,
            headshotOriginalUrl: row.headshot_original_url,
            headshotProcessedUrl: row.headshot_processed_url,
            socialBureauReviewStatus,
            socialBureauReviewedAt: row.social_bureau_reviewed_at,
            socialBureauReviewNote: row.social_bureau_review_note,
            registrationCode: row.registration_code,
            authInviteStatus: normalizeAuthInviteStatus(row.auth_invite_status),
            authInvitedAt: row.auth_invited_at,
            authInviteSentCount: row.auth_invite_sent_count ?? 0,
            authActivatedAt: row.auth_activated_at,
            profileCompletionStatus: normalizeProfileCompletionStatus(
              remittanceProfile?.profile_completion_status ?? row.profile_completion_status,
            ),
            profileSubmittedAt: row.profile_submitted_at,
            profileReviewedAt: remittanceProfile?.profile_reviewed_at ?? row.profile_reviewed_at,
            profileReturnReason: row.profile_return_reason,
            visitorCode: remittanceProfile?.visitor_code ?? row.visitor_code,
            qrCodePayload: remittanceProfile?.qr_code_payload ?? row.qr_code_payload,
            bankAccountLast5: remittanceProfile?.bank_account_last5 ?? null,
            bankName: remittanceProfile?.bank_name ?? null,
            bankCode: remittanceProfile?.bank_code ?? null,
            bankBranchName: remittanceProfile?.bank_branch_name ?? null,
            bankAccountName: remittanceProfile?.bank_account_name ?? null,
            passbookCoverUrl: remittanceProfile?.passbook_cover_url ?? null,
            passbookUploadedAt: remittanceProfile?.passbook_uploaded_at ?? null,
            remittanceReviewStatus: normalizeRemittanceReviewStatus(
              remittanceProfile?.remittance_review_status ?? null,
            ),
            remittanceReady: Boolean(remittanceProfile?.remittance_ready),
            note: null,
          }
        : undefined,
  };
}

function normalizeRegistrationStatus(value: string): UserRegistrationRequest["status"] {
  if (
    value === "draft" ||
    value === "email_verified" ||
    value === "pending_workspace_review" ||
    value === "pending_supervisor_review" ||
    value === "pending_social_bureau_review" ||
    value === "approved" ||
    value === "rejected"
  ) {
    return value;
  }

  return "pending_workspace_review";
}

function normalizeRoleKey(value: string): WorkspaceRoleKey {
  if (
    value === "workspace_owner" ||
    value === "workspace_manager" ||
    value === "supervisor" ||
    value === "visitor" ||
    value === "auditor" ||
    value === "viewer"
  ) {
    return value;
  }

  return "visitor";
}

function normalizeWorkerGroup(value: string | null): VisitorRegistrationWorkerGroup {
  if (value === "social_affairs" || value === "civil_affairs") {
    return value;
  }

  return "civil_affairs";
}

function normalizeGender(value: string | null): "男" | "女" | "其他" {
  if (value === "男" || value === "女" || value === "其他") {
    return value;
  }

  return "其他";
}

function normalizeReviewStatus(value: string | null) {
  if (value === "not_sent" || value === "pending" || value === "approved" || value === "rejected") {
    return value;
  }

  return "not_sent";
}

function normalizeAuthInviteStatus(value: string | null) {
  if (value === "not_sent" || value === "sent" || value === "activated" || value === "failed") {
    return value;
  }

  return "not_sent";
}

function normalizeProfileCompletionStatus(value: string | null) {
  if (value === "incomplete" || value === "submitted" || value === "verified" || value === "returned") {
    return value;
  }

  return "incomplete";
}

function normalizeRemittanceReviewStatus(value: string | null): VisitorRemittanceReviewStatus {
  if (value === "pending" || value === "approved" || value === "rejected") {
    return value;
  }

  return "pending";
}

function getRowProfileCompletionStatus(row: WorkspaceRegistrationRequestRow) {
  const existingStatus = normalizeProfileCompletionStatus(row.profile_completion_status);
  if (existingStatus === "verified" || existingStatus === "returned") {
    return existingStatus;
  }

  return row.full_name &&
    row.email &&
    row.national_id &&
    row.phone &&
    row.headshot_processed_url
    ? "submitted"
    : "incomplete";
}

function createRegistrationCode(submittedAt: string) {
  const date = new Date(submittedAt);
  const compactTimestamp = Number.isNaN(date.getTime())
    ? Date.now().toString(36).toUpperCase()
    : date.getTime().toString(36).toUpperCase();
  return `REG-115-YH-${compactTimestamp}`;
}

async function createVisitorCode(
  supabase: unknown,
  workspaceId: string,
  workerType: "civil_affairs" | "social_affairs",
  fallbackSeed: string,
) {
  const typeCode = workerType === "civil_affairs" ? "CIV" : "SOC";
  const prefix = `EV-115-YH-${typeCode}`;

  try {
    const { data, error } = await (supabase as VisitorCodeLookupClient)
      .from("visitor_profiles")
      .select("visitor_code")
      .eq("workspace_id", workspaceId)
      .eq("worker_type", workerType);

    if (!error && data) {
      const nextSequence =
        data.reduce((max, item) => {
          const match = item.visitor_code?.match(/-(\d+)$/);
          const value = match ? Number(match[1]) : 0;
          return Number.isFinite(value) ? Math.max(max, value) : max;
        }, 0) + 1;
      return `${prefix}-${String(nextSequence).padStart(4, "0")}`;
    }
  } catch {
    // Fallback below keeps review from failing if code lookup is unavailable.
  }

  const suffix = fallbackSeed.replace(/[^0-9]/g, "").slice(-4) || Date.now().toString().slice(-4);
  return `${prefix}-${suffix.padStart(4, "0")}`;
}

function createVisitorQrCodePayload(visitorCode: string) {
  const siteUrl = (getRuntimeEnvValue("NEXT_PUBLIC_APP_URL") ?? "https://elder-visit-platform.vercel.app").replace(/\/+$/, "");
  return `${siteUrl}/verify/visitor/${visitorCode}`;
}

function normalizeWorkspaceRoleKey(value: string): WorkspaceRoleKey {
  const allowed: WorkspaceRoleKey[] = [
    "workspace_owner",
    "workspace_manager",
    "supervisor",
    "visitor",
    "auditor",
    "viewer",
  ];
  return allowed.includes(value as WorkspaceRoleKey) ? (value as WorkspaceRoleKey) : "visitor";
}

type WorkspaceRegistrationRequestRow = {
  id: string;
  account_id: string | null;
  email: string;
  full_name: string;
  requested_unit_name: string | null;
  requested_workspace_id: string | null;
  requested_role_key: string;
  status: string;
  review_note: string | null;
  submitted_at: string;
  root_unit_name: string | null;
  department_name: string | null;
  department_other: string | null;
  job_title: string | null;
  job_title_other: string | null;
  display_name: string | null;
  gender: string | null;
  national_id: string | null;
  worker_group: string | null;
  official_email: string | null;
  phone: string | null;
  training_completed: boolean;
  training_completed_at: string | null;
  visitor_certificate_no: string | null;
  headshot_original_url: string | null;
  headshot_processed_url: string | null;
  social_bureau_review_status: string;
  social_bureau_reviewed_at: string | null;
  social_bureau_review_note: string | null;
  registration_code: string | null;
  auth_invite_status: string | null;
  auth_invited_at: string | null;
  auth_invite_sent_count: number | null;
  auth_activated_at: string | null;
  profile_completion_status: string | null;
  profile_submitted_at: string | null;
  profile_reviewed_at: string | null;
  profile_return_reason: string | null;
  visitor_code: string | null;
  qr_code_payload: string | null;
};

type RegistrationRequestClient = {
  from(table: "workspace_registration_requests"): {
    select(query: string): {
      order(column: string, options: { ascending: boolean }): {
        limit(count: number): Promise<{
          data: WorkspaceRegistrationRequestRow[] | null;
          error: unknown;
        }>;
      };
    };
  };
};

type VisitorProfileRemittanceRow = {
  account_id: string;
  visitor_code: string | null;
  qr_code_payload: string | null;
  profile_completion_status: string | null;
  profile_reviewed_at: string | null;
  is_assignable: boolean | null;
  bank_account_last5: string | null;
  bank_name: string | null;
  bank_code: string | null;
  bank_branch_name: string | null;
  bank_account_name: string | null;
  passbook_cover_url: string | null;
  passbook_uploaded_at: string | null;
  remittance_review_status: string | null;
  remittance_ready: boolean | null;
};

type VisitorProfileRemittanceClient = {
  from(table: "visitor_profiles"): {
    select(query: string): {
      in(column: string, values: string[]): Promise<{
        data: VisitorProfileRemittanceRow[] | null;
        error: unknown;
      }>;
    };
  };
};

type DuplicateRegistrationRow = {
  id: string;
  full_name: string;
  status: string;
  visitor_code: string | null;
};

type RegistrationDuplicateLookupFilter = {
  eq(column: string, value: string): RegistrationDuplicateLookupFilter;
  neq(column: string, value: string): RegistrationDuplicateLookupFilter;
  order(column: string, options: { ascending: boolean }): {
    limit(count: number): Promise<{
      data: DuplicateRegistrationRow[] | null;
      error: unknown;
    }>;
  };
};

type RegistrationDuplicateLookupClient = {
  from(table: "workspace_registration_requests"): {
    select(query: string): RegistrationDuplicateLookupFilter;
  };
};

type DuplicateVisitorProfileRow = {
  id: string;
  full_name: string;
  visitor_code: string | null;
  status: string;
};

type VisitorDuplicateProfileLookupFilter = {
  eq(column: string, value: string): VisitorDuplicateProfileLookupFilter;
  limit(count: number): Promise<{
    data: DuplicateVisitorProfileRow[] | null;
    error: unknown;
  }>;
};

type VisitorDuplicateProfileLookupClient = {
  from(table: "visitor_profiles"): {
    select(query: string): VisitorDuplicateProfileLookupFilter;
  };
};

type RegistrationRequestByIdClient = {
  from(table: "workspace_registration_requests"): {
    select(query: string): {
      eq(column: string, value: string): {
        single(): Promise<{
          data: WorkspaceRegistrationRequestRow | null;
          error: unknown;
        }>;
      };
    };
  };
};

type RegistrationRequestWriteClient = {
  from(table: "workspace_registration_requests"): {
    insert(row: Record<string, unknown>): {
      select(query: string): {
        single(): Promise<{
          data: WorkspaceRegistrationRequestRow | null;
          error: unknown;
        }>;
      };
    };
  };
};

type RegistrationRequestReviewClient = {
  from(table: "workspace_registration_requests"): {
    update(row: Record<string, unknown>): {
      eq(column: string, value: string): RegistrationRequestReviewFilter;
    };
  };
};

type RegistrationRequestReviewFilter = PromiseLike<{
  data: WorkspaceRegistrationRequestRow | null;
  error: unknown;
}> & {
  eq(column: string, value: string): RegistrationRequestReviewFilter;
  select(query: string): {
    single(): Promise<{
      data: WorkspaceRegistrationRequestRow | null;
      error: unknown;
    }>;
    maybeSingle(): Promise<{
      data: WorkspaceRegistrationRequestRow | null;
      error: unknown;
    }>;
  };
};

type AccountWriteClient = {
  from(table: "accounts"): {
    upsert(row: Record<string, unknown>, options: { onConflict: string }): {
      select(query: string): {
        single(): Promise<{
          data: { id: string } | null;
          error: unknown;
        }>;
      };
    };
  };
};

type AccountAuthUserUpdateClient = {
  from(table: "accounts"): {
    update(row: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{
        data: unknown;
        error: unknown;
      }>;
    };
  };
};

type WorkspaceMembershipWriteClient = {
  from(table: "workspace_memberships"): {
    upsert(row: Record<string, unknown>, options: { onConflict: string }): Promise<{
      data: unknown;
      error: unknown;
    }>;
  };
};

type VisitorProfileReviewClient = {
  from(table: "visitor_profiles"): {
    select(query: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          limit(count: number): {
            maybeSingle(): Promise<{
              data: { id: string; visitor_code: string | null } | null;
              error: unknown;
            }>;
          };
        };
      };
    };
    update(row: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{
        data: unknown;
        error: unknown;
      }>;
    };
    insert(row: Record<string, unknown>): Promise<{
      data: unknown;
      error: unknown;
    }>;
  };
};

type VisitorCodeLookupClient = {
  from(table: "visitor_profiles"): {
    select(query: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): Promise<{
          data: Array<{ visitor_code: string | null }> | null;
          error: unknown;
        }>;
      };
    };
  };
};

type ActiveWorkspaceClient = {
  from(table: "workspaces"): {
    select(query: string): {
      eq(column: string, value: string): {
        limit(count: number): {
          single(): Promise<{
            data: { id: string; workspace_name: string } | null;
            error: unknown;
          }>;
        };
      };
    };
  };
};
