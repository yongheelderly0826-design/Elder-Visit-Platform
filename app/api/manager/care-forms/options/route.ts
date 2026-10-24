import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
import { mapDeskCase, mapDeskVisitor } from "@/lib/domain/manager-care-form-desk";
import { gasClient } from "@/lib/gas-client";

export async function GET(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "visits.submit");
  if (forbidden) return forbidden;

  try {
    const [caseRows, visitorRows] = await Promise.all([
      gasClient.cases.list({ district: "永和區" }) as Promise<Record<string, unknown>[]>,
      gasClient.visitors.list() as Promise<Record<string, unknown>[]>,
    ]);

    const cases = caseRows.map(mapDeskCase).filter((item) => item.id && item.name);
    const visitors = visitorRows
      .map(mapDeskVisitor)
      .filter((item) => item.id)
      .sort((a, b) => Number(b.status === "已核准") - Number(a.status === "已核准"));

    return NextResponse.json({
      data: { cases, visitors },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法載入個案與訪員";
    return NextResponse.json({ error: { code: "GAS_READ_FAILED", message } }, { status: 502 });
  }
}
