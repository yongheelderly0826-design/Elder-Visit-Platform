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

async function gasFetch<T>(
  action: string,
  options: {
    method?: "GET" | "POST";
    params?: Record<string, string>;
    body?: unknown;
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

  const init: RequestInit = {
    method: options.method ?? "GET",
    headers,
    redirect: "follow",
  };

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
    get: (assignmentId: string) =>
      gasFetch<unknown>("assignments.get", { params: { assignment_id: assignmentId } }),
    dispatch: (body: unknown) =>
      gasFetch<unknown>("assignments.dispatch", { method: "POST", body }),
    confirm: (body: unknown) =>
      gasFetch<unknown>("assignments.confirm", { method: "POST", body }),
  },
  careform: {
    get: (assignmentId: string) =>
      gasFetch<unknown>("careform.get", { params: { assignment_id: assignmentId } }),
    saveDraft: (body: unknown) =>
      gasFetch<unknown>("careform.saveDraft", { method: "POST", body }),
    submit: (body: unknown) => gasFetch<unknown>("careform.submit", { method: "POST", body }),
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
    status: (params: { visitor_id?: string; id_number?: string }) =>
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
    }) => gasFetch<Record<string, unknown>>("attendance.clock", { method: "POST", body }),
    list: (params?: { period?: string; group_id?: string; visitor_id?: string }) =>
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
  },
};

export function isGasConfigured(): boolean {
  return Boolean(GAS_URL && GAS_TOKEN);
}
