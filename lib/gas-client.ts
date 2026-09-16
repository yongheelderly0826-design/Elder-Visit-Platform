/**
 * GAS Web App API 客戶端
 * Next.js 前端透過此模組讀寫 Google Sheets（經 GAS）
 */

const GAS_URL = process.env.GAS_WEB_APP_URL ?? "";
const GAS_TOKEN = process.env.GAS_API_TOKEN ?? "";
const WORKSPACE_ID = process.env.GAS_WORKSPACE_ID ?? "WS-YH-115";

export type GasResponse<T> = {
  ok: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
    errorLines?: string[];
    errors?: unknown;
  } | null;
};

export type GasRegistrationRow = {
  id: string;
  account_id: string | null;
  email: string;
  full_name: string;
  requested_unit_name: string;
  requested_workspace_id: string | null;
  requested_workspace_name: string;
  requested_role_key: string;
  status: string;
  review_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  visitor_id: string | null;
  profile: Record<string, unknown>;
};

export type GasAuthAccount = {
  account_id: string;
  email: string;
  visitor_id: string;
  full_name: string;
  role_key: string;
  status: string;
  password_hash: string;
  password_salt: string;
  password_params: string;
};

export class GasApiError extends Error {
  code: string;
  errorLines: string[];
  errors: unknown;

  constructor(error: NonNullable<GasResponse<unknown>["error"]>) {
    super(error.message);
    this.name = "GasApiError";
    this.code = error.code;
    this.errorLines = error.errorLines ?? [];
    this.errors = error.errors ?? null;
  }
}

export function isUnknownGasAction(error: unknown) {
  if (!(error instanceof GasApiError)) return false;
  return (
    error.code === "NOT_FOUND" &&
    /unknown action/i.test(error.message)
  );
}

async function gasFetch<T>(
  action: string,
  options: {
    method?: "GET" | "POST";
    params?: Record<string, string>;
    body?: unknown;
    revalidateSeconds?: number;
    tags?: string[];
  } = {}
): Promise<T> {
  if (!GAS_URL) {
    throw new Error("GAS_WEB_APP_URL is not configured");
  }

  const url = new URL(GAS_URL);
  url.searchParams.set("action", action);
  // GAS Web App GET 無法可靠讀取自訂 HTTP headers，需以 query 傳 token。
  if (GAS_TOKEN) {
    url.searchParams.set("token", GAS_TOKEN);
  }
  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => {
      if (v != null && v !== "") url.searchParams.set(k, v);
    });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${GAS_TOKEN}`,
    "X-Workspace-Id": WORKSPACE_ID,
  };

  const init: RequestInit & { next?: { revalidate?: number; tags?: string[] } } = {
    method: options.method ?? "GET",
    headers,
    redirect: "follow",
  };

  if (options.revalidateSeconds && !options.body) {
    init.next = {
      revalidate: options.revalidateSeconds,
      tags: options.tags,
    };
  } else if (!options.body) {
    init.cache = "no-store";
  }

  if (options.body) {
    const serialized = JSON.stringify(options.body);
    if (serialized.length < 3500) {
      url.searchParams.set("body", serialized);
    }
    headers["Content-Type"] = "application/json";
    init.method = "POST";
    init.body = serialized;
  }

  const res = await fetch(url.toString(), init);
  const json = (await res.json()) as GasResponse<T>;

  if (!json.ok || json.error) {
    throw new GasApiError(
      json.error ?? { code: "GAS_REQUEST_FAILED", message: "GAS request failed" },
    );
  }

  return json.data as T;
}

export const gasClient = {
  visitors: {
    list: (params?: { status?: string }) =>
      gasFetch<unknown[]>("visitors.list", { params: params as Record<string, string> }),
    get: (id: string) => gasFetch<unknown>("visitors.get", { params: { id } }),
    getByIdNumber: (idNumber: string) =>
      gasFetch<unknown>("visitors.getByIdNumber", { params: { id_number: idNumber } }),
    create: (body: unknown) => gasFetch<unknown>("visitors.create", { method: "POST", body }),
    update: (body: unknown) => gasFetch<unknown>("visitors.update", { method: "POST", body }),
    approve: (body: unknown) => gasFetch<unknown>("visitors.approve", { method: "POST", body }),
  },
  registrations: {
    list: (params?: { status?: string }) =>
      gasFetch<GasRegistrationRow[]>("registrations.list", {
        params: params as Record<string, string> | undefined,
      }),
    get: (requestId: string) =>
      gasFetch<GasRegistrationRow | null>("registrations.get", {
        params: { request_id: requestId },
      }),
    create: (body: Record<string, unknown>) =>
      gasFetch<GasRegistrationRow>("registrations.create", { method: "POST", body }),
    review: (body: Record<string, unknown>) =>
      gasFetch<{ registration: GasRegistrationRow; previously_completed: boolean }>(
        "registrations.review",
        { method: "POST", body },
      ),
    batchReview: (body: Record<string, unknown>) =>
      gasFetch<
        Array<
          | { registration: GasRegistrationRow; previously_completed: boolean }
          | { request_id: string; error: string; code: string }
        >
      >("registrations.batchReview", { method: "POST", body }),
  },
  accounts: {
    getAuthByEmail: (email: string) =>
      gasFetch<GasAuthAccount | null>("accounts.getAuthByEmail", { params: { email } }),
    issueToken: (body: {
      request_id: string;
      mode: "invite" | "recovery";
      token_hash: string;
      expires_at: string;
      setup_url: string;
    }) =>
      gasFetch<{
        request_id: string;
        email: string;
        full_name: string;
        mode: "invite" | "recovery";
        expires_at: string;
      }>("accounts.issueToken", { method: "POST", body }),
    setPassword: (body: {
      mode: "invite" | "recovery";
      token_hash: string;
      password_hash: string;
      password_salt: string;
      password_params: string;
    }) =>
      gasFetch<{
        account_id: string;
        email: string;
        visitor_id: string;
        full_name: string;
        role_key: string;
        status: string;
      }>("accounts.setPassword", { method: "POST", body }),
    markLogin: (email: string) =>
      gasFetch<boolean>("accounts.markLogin", { method: "POST", body: { email } }),
  },
  cases: {
    list: (params?: { district?: string; case_type?: string; visit_status?: string }) =>
      gasFetch<unknown[]>("cases.list", { params: params as Record<string, string> }),
    get: (id: string) => gasFetch<unknown>("cases.get", { params: { id } }),
    getEncoded: (code: string) => gasFetch<unknown>("cases.getEncoded", { params: { code } }),
    import: (body: { rows: unknown[] }) =>
      gasFetch<{ imported: number; case_ids: string[] }>("cases.import", { method: "POST", body }),
  },
  assignments: {
    list: (params?: { visitor_id?: string; status?: string; active_only?: string }) =>
      gasFetch<unknown[]>("assignments.list", { params: params as Record<string, string> }),
    visitorTasksBundle: (params: { visitor_id?: string; active_only?: string }) =>
      gasFetch<{
        visitor_id?: string;
        assignments: unknown[];
        cases: unknown[];
        attempt_counts?: Record<string, number>;
      }>("assignments.visitorTasksBundle", {
        params: params as Record<string, string>,
        revalidateSeconds: 20,
        tags: ["gas-visitor-tasks"],
      }),
    get: (assignmentId: string) =>
      gasFetch<unknown>("assignments.get", { params: { assignment_id: assignmentId } }),
    dispatch: (body: unknown) =>
      gasFetch<unknown>("assignments.dispatch", { method: "POST", body }),
    confirm: (body: unknown) =>
      gasFetch<unknown>("assignments.confirm", { method: "POST", body }),
  },
  highCare: {
    list: (params?: { color?: string; status?: string }) =>
      gasFetch<Array<Record<string, unknown>>>("highcare.list", {
        params: params as Record<string, string> | undefined,
      }),
    stats: () =>
      gasFetch<Record<string, number>>("highcare.stats"),
    update: (body: { high_care_id: string; status?: string; owner?: string; note?: string }) =>
      gasFetch<Record<string, unknown>>("highcare.update", { method: "POST", body }),
  },
  careform: {
    get: (assignmentId: string) =>
      gasFetch<unknown>("careform.get", { params: { assignment_id: assignmentId } }),
    saveDraft: (body: unknown) =>
      gasFetch<unknown>("careform.saveDraft", { method: "POST", body }),
    submit: (body: unknown) => gasFetch<unknown>("careform.submit", { method: "POST", body }),
    generatePdf: (body: {
      answers: Record<string, unknown>;
      elder_name?: string;
      case_code?: string;
      encoded_id?: string;
      district?: string;
      include_base64?: boolean;
    }) =>
      gasFetch<{
        file_id: string;
        file_url: string;
        file_name: string;
        folder_id: string;
        folder_url: string;
        page_size: "A3";
        orientation: "portrait";
        page_count: 1;
        pdf_base64: string;
      }>("careform.generatePdf", { method: "POST", body }),
    validate: (body: unknown) =>
      gasFetch<{ ok: boolean; errorLines: string[] }>("careform.validate", {
        method: "POST",
        body,
      }),
  },
  export: {
    lifeCareXlsx: (body: {
      case_ids: string[];
      batch_id?: string;
      strict?: boolean;
      only_audited?: boolean;
    }) => gasFetch<unknown>("export.lifeCareXlsx", { method: "POST", body }),
    listCandidates: (params?: {
      district?: string;
      only_audited?: string;
    }) =>
      gasFetch<{
        total: number;
        ready_count: number;
        items: Array<Record<string, unknown>>;
      }>("export.listCandidates", {
        params: params as Record<string, string> | undefined,
      }),
    history: () => gasFetch<unknown[]>("export.history"),
  },
  reports: {
    kpi: (period?: string) =>
      gasFetch<unknown>("reports.kpi", { params: period ? { period } : undefined }),
    dailyVisitBundle: (date: string, options?: { fresh?: boolean }) =>
      gasFetch<{
        date?: string;
        assignments: unknown[];
        visitors: unknown[];
        cases: unknown[];
        attendance: unknown[];
        audits: unknown[];
        careForms: unknown[];
      }>("reports.dailyVisitBundle", {
        params: {
          date,
          ...(options?.fresh ? { fresh: "1" } : {}),
        },
        revalidateSeconds: options?.fresh ? undefined : 20,
        tags: options?.fresh ? undefined : ["gas-daily-visits"],
      }),
    dailyVisitSnapshot: (date: string, options?: { fresh?: boolean }) =>
      gasFetch<{
        date?: string;
        source?: string;
        generated_at?: string;
        assignments: unknown[];
        visitors: unknown[];
        cases: unknown[];
        attendance: unknown[];
        audits: unknown[];
        careForms: unknown[];
        backup?: { file_id?: string; file_url?: string; file_name?: string };
      }>("reports.dailyVisitSnapshot", {
        params: {
          date,
          ...(options?.fresh ? { fresh: "1" } : {}),
        },
        revalidateSeconds: options?.fresh ? undefined : 20,
        tags: options?.fresh ? undefined : ["gas-daily-visits"],
      }),
  },
  audit: {
    queue: (params?: { decision?: string }) =>
      gasFetch<Array<Record<string, unknown>>>("audit.queue", {
        params: params as Record<string, string> | undefined,
      }),
    decide: (body: {
      audit_id: string;
      decision: string;
      reason?: string;
      reviewer?: string;
    }) => gasFetch<Record<string, unknown>>("audit.decide", { method: "POST", body }),
  },
  attendance: {
    identify: (body: { id_number: string }) =>
      gasFetch<Record<string, unknown>>("attendance.identify", { method: "POST", body }),
    status: (params: {
      visitor_id?: string;
      id_number?: string;
      assignment_id?: string;
      session_type?: string;
    }) =>
      gasFetch<Record<string, unknown>>("attendance.status", {
        params: params as Record<string, string>,
      }),
    clock: (body: {
      visitor_id?: string;
      id_number?: string;
      site_id?: string;
      channel?: string;
      source?: string;
      lat?: string;
      lng?: string;
      assignment_id?: string;
      session_type?: string;
    }) => gasFetch<Record<string, unknown>>("attendance.clock", { method: "POST", body }),
    list: (params?: {
      period?: string;
      group_id?: string;
      visitor_id?: string;
      assignment_id?: string;
      session_type?: string;
    }) =>
      gasFetch<Array<Record<string, unknown>>>("attendance.list", {
        params: params as Record<string, string> | undefined,
      }),
    monthlyExport: (body: { period: string }) =>
      gasFetch<Record<string, unknown>>("attendance.monthlyExport", { method: "POST", body }),
    catalog: () =>
      gasFetch<{
        groups: Array<Record<string, unknown>>;
        sites: Array<Record<string, unknown>>;
      }>("attendance.catalog"),
    createSite: (body: {
      name: string;
      group_id?: string;
      groupId?: string;
      kind?: string;
      note?: string;
      site_id?: string;
      siteId?: string;
      created_by?: string;
    }) => gasFetch<Record<string, unknown>>("attendance.sites.create", { method: "POST", body }),
  },
  consent: {
    list: (params?: {
      template_id?: string;
      external_ref?: string;
      visitor_id?: string;
      limit?: string;
      include_signature?: string;
    }) =>
      gasFetch<Array<Record<string, unknown>>>("consent.list", {
        params: params as Record<string, string> | undefined,
      }),
    get: (id: string) =>
      gasFetch<Record<string, unknown>>("consent.get", {
        params: { id, include_signature: "true" },
      }),
    sign: (body: Record<string, unknown>) =>
      gasFetch<Record<string, unknown>>("consent.sign", { method: "POST", body }),
    generatePdf: (consentId: string) =>
      gasFetch<Record<string, unknown>>("consent.generatePdf", {
        method: "POST",
        body: { consent_id: consentId },
      }),
  },
};

export function isGasConfigured(): boolean {
  return Boolean(GAS_URL && GAS_TOKEN);
}
