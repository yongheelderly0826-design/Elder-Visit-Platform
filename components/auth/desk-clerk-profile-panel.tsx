"use client";

import { useMemo, useState } from "react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";

function getSafeNextPath(fallback: string) {
  if (typeof window === "undefined") return fallback;
  const nextPath = new URLSearchParams(window.location.search).get("next");
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return fallback;
  }
  return nextPath;
}

export function DeskClerkProfilePanel({
  clerkId,
  initialName = "",
}: {
  clerkId: string;
  initialName?: string;
}) {
  const [displayName, setDisplayName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const nextPath = useMemo(() => getSafeNextPath("/desk/care-forms"), []);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/desk-clerk/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ displayName, next: nextPath }),
      });
      const json = (await response.json()) as {
        data?: { nextPath?: string; displayName?: string };
        error?: { message?: string };
      };
      if (!response.ok) {
        setMessage(json.error?.message ?? "姓名儲存失敗。");
        return;
      }
      window.location.href = json.data?.nextPath ?? nextPath;
    } catch {
      setMessage("目前無法連線，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-xl items-center">
        <section className="w-full overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="border-b bg-primary/5 p-5 lg:p-6">
            <BrandLogo variant="full" size="lg" className="h-28 w-full max-w-md" />
            <div className="mt-2 min-w-0">
              <p className="text-base font-semibold">臨時登打 · 第一次登入</p>
              <p className="text-sm text-muted-foreground">帳號 {clerkId}</p>
            </div>
          </div>

          <div className="grid gap-4 p-5 lg:p-6">
            <div>
              <h1 className="text-2xl font-semibold">請輸入您的中文姓名</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                系統會記錄此姓名，之後每次進入會顯示「歡迎您」，左下角也會顯示您的名字，方便論件對帳。
              </p>
            </div>

            <label className="block text-sm font-medium">
              中文姓名 *
              <input
                className="mt-2 h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                autoComplete="name"
                autoFocus
                placeholder="例：王小明"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void save();
                }}
              />
            </label>

            <Button
              className="h-11 w-full"
              disabled={busy || displayName.trim().length < 2}
              onClick={() => void save()}
            >
              {busy ? "儲存中…" : "儲存並進入建檔"}
            </Button>

            {message ? (
              <p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">{message}</p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
