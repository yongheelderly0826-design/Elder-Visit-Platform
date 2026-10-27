"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardPen, LogIn } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";

function getSafeNextPath(fallback: string) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const nextPath = new URLSearchParams(window.location.search).get("next");
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return fallback;
  }

  return nextPath;
}

/** 臨時登打專用：TEMP-01～TEMP-20，不含管理者 Gmail。 */
export function DeskClerkLoginPanel() {
  const [clerkId, setClerkId] = useState("");
  const [clerkPasscode, setClerkPasscode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loginDeskClerk() {
    setBusy(true);
    setMessage(null);
    try {
      const nextPath = getSafeNextPath("/desk/care-forms");
      const response = await fetch("/api/auth/desk-clerk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          clerkId: clerkId.trim(),
          passcode: clerkPasscode,
          next: nextPath,
        }),
      });
      const result = (await response.json()) as {
        data?: { nextPath?: string };
        error?: { message?: string };
      };
      if (!response.ok) {
        setMessage(result.error?.message ?? "帳號或通行碼不正確。");
        return;
      }
      window.location.href = result.data?.nextPath ?? "/desk/care-forms";
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
              <p className="text-base font-semibold">獨居長者訪查管理平台</p>
              <p className="text-sm text-muted-foreground">永和區 · 臨時登打入口</p>
            </div>
          </div>

          <div className="grid gap-6 p-5 lg:p-6">
            <div>
              <p className="text-sm font-medium text-primary">臨時登打（紙本 KEY）</p>
              <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">輸入臨時帳號</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                請使用承辦核發的 <span className="font-medium text-foreground">TEMP-01～TEMP-20</span>{" "}
                與通行碼。此頁沒有管理者登入，請勿輸入 Gmail。
              </p>
              <div className="mt-6 space-y-3 rounded-lg border bg-card p-3">
                <label className="block text-sm font-medium">
                  臨時帳號
                  <input
                    className="mt-2 h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    autoComplete="username"
                    placeholder="例：TEMP-01"
                    value={clerkId}
                    onChange={(event) => setClerkId(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void loginDeskClerk();
                    }}
                  />
                </label>
                <label className="block text-sm font-medium">
                  通行碼
                  <input
                    className="mt-2 h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    type="password"
                    autoComplete="current-password"
                    value={clerkPasscode}
                    onChange={(event) => setClerkPasscode(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void loginDeskClerk();
                    }}
                  />
                </label>
                <Button
                  className="h-11 w-full"
                  disabled={busy || !clerkId.trim() || !clerkPasscode.trim()}
                  onClick={() => void loginDeskClerk()}
                >
                  <ClipboardPen className="h-4 w-4" />
                  {busy ? "進入中…" : "進入關懷表建檔"}
                </Button>
              </div>
            </div>

            {message ? (
              <p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">{message}</p>
            ) : null}

            <p className="border-t pt-4 text-center text-sm text-muted-foreground">
              總承辦請改走：
              <Link
                href="/yonghe"
                className="ml-1 inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                <LogIn className="h-3.5 w-3.5" />
                /yonghe
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
