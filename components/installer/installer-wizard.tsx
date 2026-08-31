"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";
import type { CreateInstallerJobPayload, InstallerJob } from "@/lib/installer/types";

const defaultForm: CreateInstallerJobPayload = {
  district: "",
  fiscalYear: "115",
  googleAccountEmail: "",
  enableGithub: true,
  enableVercel: true,
};

export function InstallerWizard() {
  const [form, setForm] = useState(defaultForm);
  const [job, setJob] = useState<InstallerJob | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [gasUrl, setGasUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runner, setRunner] = useState<"local" | "manual">("local");

  const pollJob = useCallback(async (jobId: string) => {
    const res = await fetch(`/api/installer/jobs/${jobId}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || "讀取失敗");
    setJob(json.data.job);
    setLogs(json.data.logs || []);
    setRunner(json.data.runner);
    return json.data.job as InstallerJob;
  }, []);

  useEffect(() => {
    if (!job?.id) return;
    if (job.status === "completed" || job.status === "failed") return;

    const timer = setInterval(() => {
      pollJob(job.id).catch(() => undefined);
    }, 3000);

    return () => clearInterval(timer);
  }, [job?.id, job?.status, pollJob]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload: CreateInstallerJobPayload = {
        district: form.district,
        fiscalYear: form.fiscalYear,
        googleAccountEmail: form.googleAccountEmail,
        allowedEmails: [form.googleAccountEmail],
        enableGithub: form.enableGithub,
        enableVercel: form.enableVercel,
      };

      const res = await fetch("/api/installer/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "建立失敗");

      setJob(json.data.job);
      setRunner(json.data.runner);
      if (json.data.runner === "manual") {
        setError(`本機背景執行未啟用。請在終端機執行：${json.data.manualCommand}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立失敗");
    } finally {
      setLoading(false);
    }
  }

  async function handleResume() {
    if (!job) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/installer/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gasWebAppUrl: gasUrl, action: "resume" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "繼續失敗");
      setJob(json.data.job);
      if (json.data.manualCommand) {
        setError(`請在終端機執行：${json.data.manualCommand}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "繼續失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="flex items-center justify-between">
          <BrandLogo />
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
            返回後台
          </Link>
        </div>

        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">客戶一鍵安裝（懶人包）</h1>
          <p className="text-sm text-muted-foreground">
            只要填行政區與承辦 Gmail。系統會自動完成 GitHub 私有倉庫、試算表、GAS Web App、Vercel 與交接包。
          </p>
        </header>

        {!job ? (
          <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border bg-background p-6 shadow-sm">
            <section className="grid gap-4 sm:grid-cols-2">
              <Field label="行政區" required>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="板橋區"
                  value={form.district}
                  onChange={(e) => setForm({ ...form, district: e.target.value })}
                  required
                />
              </Field>
              <Field label="年度">
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.fiscalYear}
                  onChange={(e) => setForm({ ...form, fiscalYear: e.target.value })}
                />
              </Field>
              <Field label="承辦 Gmail" required>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  type="email"
                  placeholder="office@gmail.com"
                  value={form.googleAccountEmail}
                  onChange={(e) => setForm({ ...form, googleAccountEmail: e.target.value })}
                  required
                />
              </Field>
            </section>

            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.enableGithub !== false}
                  onChange={(e) => setForm({ ...form, enableGithub: e.target.checked })}
                />
                建立 GitHub 私有倉庫（v2）
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.enableVercel !== false}
                  onChange={(e) => setForm({ ...form, enableVercel: e.target.checked })}
                />
                部署 Vercel
              </label>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              開始一鍵安裝
            </Button>
          </form>
        ) : (
          <div className="space-y-6 rounded-xl border bg-background p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">工作 ID</p>
                <p className="font-mono text-sm">{job.id}</p>
              </div>
              <StatusBadge status={job.status} />
            </div>

            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">階段</dt>
                <dd>{job.phase}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">執行模式</dt>
                <dd>{runner === "local" ? "本機背景" : "手動 CLI"}</dd>
              </div>
              {job.github?.htmlUrl ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">GitHub</dt>
                  <dd>
                    <a href={job.github.htmlUrl} className="text-primary underline" target="_blank" rel="noreferrer">
                      {job.github.htmlUrl}
                    </a>
                  </dd>
                </div>
              ) : null}
              {job.message ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">訊息</dt>
                  <dd>{job.message}</dd>
                </div>
              ) : null}
            </dl>

            {job.status === "waiting_gas" ? (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium">請完成 GAS Web App 部署後貼上 URL：</p>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>開啟 script.google.com → 該客戶 GAS 專案</li>
                  <li>部署 → 新增部署 → Web App（執行身分：我，存取：任何人）</li>
                  <li>複製 URL（結尾 /exec）貼到下方</li>
                </ol>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value={gasUrl}
                  onChange={(e) => setGasUrl(e.target.value)}
                />
                <Button type="button" onClick={handleResume} disabled={!gasUrl || loading}>
                  <RefreshCw className="h-4 w-4" />
                  繼續安裝
                </Button>
              </div>
            ) : null}

            {job.status === "completed" ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
                <p className="font-medium text-green-800">安裝完成</p>
                <p className="mt-1 text-green-700">
                  交接包：`installer/output/{job.config.clientId}/handoff.md`
                </p>
              </div>
            ) : null}

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <div>
              <p className="mb-2 text-sm font-medium">安裝日誌</p>
              <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
                {logs.length ? logs.join("\n") : "（等待日誌…）"}
              </pre>
            </div>

            <Button type="button" variant="outline" onClick={() => setJob(null)}>
              新建另一個客戶
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span>
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: InstallerJob["status"] }) {
  const map = {
    queued: "排隊中",
    running: "執行中",
    waiting_gas: "等待 GAS",
    completed: "完成",
    failed: "失敗",
  } as const;
  return (
    <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{map[status]}</span>
  );
}
