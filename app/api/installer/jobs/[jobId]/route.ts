import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { canAccessInstaller, canSpawnLocalRunner } from "@/lib/installer/auth";
import { getJob, readJobLog, updateJob } from "@/lib/installer/job-store";
import { spawnInstallJob } from "@/lib/installer/spawn-job";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = canAccessInstaller(request);
  if (!auth.ok) {
    return NextResponse.json({ error: { code: auth.reason } }, { status: 403 });
  }

  const { jobId } = await context.params;
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      job,
      logs: readJobLog(jobId, 100),
      runner: canSpawnLocalRunner() ? "local" : "manual",
    },
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = canAccessInstaller(request);
  if (!auth.ok) {
    return NextResponse.json({ error: { code: auth.reason } }, { status: 403 });
  }

  const { jobId } = await context.params;
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const body = (await request.json()) as { gasWebAppUrl?: string; action?: string };

  if (body.gasWebAppUrl) {
    updateJob(jobId, {
      gasWebAppUrl: body.gasWebAppUrl,
      message: "已收到 GAS Web App URL，準備繼續安裝",
    });
  }

  if (body.action === "resume") {
    if (!canSpawnLocalRunner()) {
      return NextResponse.json({
        data: {
          job: getJob(jobId),
          runner: "manual",
          manualCommand: `npm run install:client -- --config installer/clients/${job.config.clientId}.json --resume`,
        },
      });
    }
    spawnInstallJob(jobId, true);
    updateJob(jobId, { status: "running", message: "背景安裝已繼續" });
  }

  return NextResponse.json({ data: { job: getJob(jobId) } });
}
