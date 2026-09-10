import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireCapability } from "@/lib/api/authorization";
import { gasErrorResponse } from "@/lib/attendance/session";
import {
  ATTENDANCE_SITES,
  VOLUNTEER_GROUPS,
  getVolunteerGroup,
  type AttendanceSite,
  type VolunteerGroupId,
} from "@/lib/domain/volunteer-attendance";
import { GasApiError, gasClient } from "@/lib/gas-client";
import { getRuntimeEnvValue } from "@/lib/runtime/env";
import { getSystemStatus } from "@/lib/system/env";

type SiteRow = AttendanceSite & {
  note?: string;
  custom?: boolean;
  createdAt?: string;
  clockUrl?: string;
  qrUrl?: string;
};

function appOrigin() {
  return (
    getRuntimeEnvValue("NEXT_PUBLIC_APP_URL") ?? "https://elder-visit-platform-ruby.vercel.app"
  ).replace(/\/+$/, "");
}

async function withQr(sites: SiteRow[]): Promise<SiteRow[]> {
  const origin = appOrigin();
  return Promise.all(
    sites.map(async (site) => {
      const clockUrl = `${origin}/volunteer/clock?site=${encodeURIComponent(site.id)}`;
      return {
        ...site,
        clockUrl,
        qrUrl: await QRCode.toDataURL(clockUrl, { width: 320, margin: 1 }),
      };
    }),
  );
}

function mapCatalogSite(row: Record<string, unknown>): SiteRow {
  const groupIdRaw = String(row.group_id ?? row.groupId ?? "other");
  const groupId = (getVolunteerGroup(groupIdRaw)?.id ?? "other") as VolunteerGroupId;
  return {
    id: String(row.id ?? row.site_id ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    groupId,
    kind: (String(row.kind ?? "field") === "office" ? "office" : "field") as AttendanceSite["kind"],
    note: String(row.note ?? ""),
    custom: Boolean(row.custom),
    createdAt: row.created_at ? String(row.created_at) : undefined,
  };
}

export async function GET() {
  try {
    if (getSystemStatus().dataMode === "gas_ready") {
      const catalog = await gasClient.attendance.catalog();
      const sites = await withQr((catalog.sites || []).map((row) => mapCatalogSite(row)));
      return NextResponse.json({
        data: {
          mode: "gas",
          groups: VOLUNTEER_GROUPS,
          sites,
        },
      });
    }
  } catch {
    // fall through to built-in
  }

  const sites = await withQr(
    ATTENDANCE_SITES.map((site) => ({
      ...site,
      note: "",
      custom: false,
    })),
  );

  return NextResponse.json({
    data: {
      mode: "demo",
      groups: VOLUNTEER_GROUPS,
      sites,
    },
  });
}

export async function POST(request: NextRequest) {
  const forbidden = requireCapability(request, "attendance.manage");
  if (forbidden) return forbidden;

  const body = (await request.json()) as {
    name?: string;
    groupId?: string;
    group_id?: string;
    kind?: string;
    note?: string;
    siteId?: string;
    site_id?: string;
  };

  const name = String(body.name ?? "").trim();
  const groupId = String(body.groupId ?? body.group_id ?? "").trim();
  if (!name) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "請輸入集合點名稱" } },
      { status: 400 },
    );
  }
  if (!getVolunteerGroup(groupId)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "請選擇有效組別" } },
      { status: 400 },
    );
  }

  try {
    if (getSystemStatus().dataMode !== "gas_ready") {
      return NextResponse.json(
        {
          error: {
            code: "GAS_REQUIRED",
            message: "目前未連線試算表，無法儲存自訂集合點。",
          },
        },
        { status: 503 },
      );
    }

    const created = await gasClient.attendance.createSite({
      name,
      group_id: groupId,
      kind: body.kind,
      note: body.note,
      site_id: body.siteId ?? body.site_id,
      created_by: request.cookies.get("demo_email")?.value || "",
    });

    const site = mapCatalogSite(created);
    const [withQrSite] = await withQr([site]);
    return NextResponse.json({ data: { site: withQrSite } });
  } catch (error) {
    return gasErrorResponse(error instanceof GasApiError ? error : error, "新增集合點失敗");
  }
}
