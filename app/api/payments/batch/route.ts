import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { getRepository } from "@/lib/repositories";
import { invalidateGasReadCaches } from "@/lib/gas-read-cache";

export async function GET() {
  const repository = getRepository();
  const data = await repository.getPaymentBatchPreview();

  return NextResponse.json({
    data: data.batch,
    feeRule: data.feeRule,
  });
}

export async function POST(request: NextRequest) {
  const forbidden = requireCapability(request, "payments.calculate");
  if (forbidden) return forbidden;
  const repository = getRepository();
  const data = await repository.createPaymentBatch();
  invalidateGasReadCaches();

  return NextResponse.json({
    data: data.batch,
    feeRule: data.feeRule,
  });
}
