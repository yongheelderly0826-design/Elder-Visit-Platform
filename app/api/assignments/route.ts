import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { getRepository } from "@/lib/repositories";

export async function GET(request: NextRequest) {
  const forbidden = requireCapability(request, "assignment.manage");
  if (forbidden) return forbidden;

  const repository = getRepository();

  return NextResponse.json({
    data: await repository.getAssignmentDashboard(),
  });
}

export async function POST(request: NextRequest) {
  const forbidden = requireCapability(request, "assignment.confirm");
  if (forbidden) return forbidden;

  const body = (await request.json()) as {
    recommendationId?: string;
    visitorId?: string;
  };

  const repository = getRepository();

  return NextResponse.json({
    data: await repository.confirmAssignment(
      body.recommendationId ?? "",
      body.visitorId,
    ),
  });
}
