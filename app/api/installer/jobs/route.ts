import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { canAccessInstaller, canSpawnLocalRunner } from "@/lib/installer/auth";
import { buildClientConfig } from "@/lib/installer/config";
import { createJob, listJobs, newJobId } from "@/lib/installer/job-store";
import { spawnInstallJob } from "@/lib/installer/spawn-job";
import type { CreateInstallerJobPayload } from "@/lib/installer/types";

function saveClientConfig(config: ReturnType<typeof buildClientConfig>) {
  const file = path.join(process.cwd(), "installer", "clients", `${config.clientId}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
}

export async function GET(request: NextRequest) {
  const auth = canAccessInstaller(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: { code: auth.reason, message: "安裝精靈未啟用或無權限" } },
      { status: auth.reason === "INSTALLER_DISABLED" ? 503 : 403 },
    );
  }

  return NextResponse.json({
    data: {
      jobs: listJobs(30),
      runner: canSpawnLocalRunner() ? "local" : "manual",
      githubConfigured: Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN),
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = canAccessInstaller(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: { code: auth.reason, message: "安裝精靈未啟用或無權限" } },
      { status: auth.reason === "INSTALLER_DISABLED" ? 503 : 403 },
    );
  }

  const payload = (await request.json()) as CreateInstallerJobPayload;
  if (!payload.district || !payload.googleAccountEmail) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "請填寫行政區與承辦 Gmail" } },
      { status: 400 },
    );
  }

  const config = buildClientConfig(payload);
  saveClientConfig(config);
  const job = createJob({
    id: newJobId(),
    status: "queued",
    phase: "preflight",
    message: "已建立安裝工作",
    config,
    gasWebAppUrl: payload.gasWebAppUrl,
  });

  let runner: "spawned" | "manual" = "manual";
  if (canSpawnLocalRunner()) {
    spawnInstallJob(job.id);
    runner = "spawned";
  }

  return NextResponse.json({
    data: {
      job,
      runner,
      manualCommand: `npm run install:client -- --config installer/clients/${config.clientId}.json`,
    },
  });
}
