"use client";

import { useState } from "react";
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

function getLoginErrorMessage(code: string | null) {
  if (code === "not_allowed") return "此 Google 帳號尚未被授權為永和區管理者，請聯絡系統管理員。";
  if (code === "google_denied") return "已取消 Google 登入。";
  if (code === "google_token" || code === "google_profile") return "Google 登入失敗，請稍後再試。";
  if (code === "GOOGLE_AUTH_NOT_CONFIGURED") return "Google 登入尚未設定，請見系統文件。";
  return null;
}

export function ManagerLoginPanel() {
  const [managerEmail, setManagerEmail] = useState("yongheelderly0826@gmail.com");
  const [clerkId, setClerkId] = useState("");
  const [clerkPasscode, setClerkPasscode] = useState("");
  const [message, setMessage] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return getLoginErrorMessage(new URLSearchParams(window.location.search).get("error"));
  });
  const [busy, setBusy] = useState(false);

  async function loginAsManager() {
    setBusy(true);
    setMessage(null);
    try {
      const nextPath = getSafeNextPath("/dashboard");
      const response = await fetch("/api/auth/manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: managerEmail, next: nextPath }),
      });

      if (!response.ok) {
        setMessage("此 Google 帳號尚未被授權為永和區管理者。");
        return;
      }

      const result = (await response.json()) as { data?: { nextPath?: string } };
      window.location.href = result.data?.nextPath ?? nextPath;
    } catch {
      setMessage("目前無法連線，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

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
        data?: { nextPath?: string; displayName?: string; clerkId?: string };
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
              <p className="text-sm text-muted-foreground">永和區入口</p>
            </div>
          </div>

          <div className="grid gap-6 p-5 lg:p-6">
            <div>
              <p className="text-sm font-medium text-primary">臨時登打（紙本 KEY）</p>
              <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">輸入臨時帳號</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                使用承辦核發的 TEMP-01～TEMP-20 帳號與通行碼進入關懷表建檔。帳號可設定到期日，時間到即無法登入。
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

            <div className="border-t pt-6">
              <p className="text-sm font-medium text-muted-foreground">總承辦／後台（Gmail）</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                完整後台（派案、匯出、臨時登打管理）請用公所指定 Google 帳號。
              </p>
              <div className="mt-4 rounded-lg border bg-card p-3">
                <label className="block text-sm font-medium">
                  Google 帳號（Gmail）
                  <input
                    className="mt-2 h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    autoComplete="email"
                    value={managerEmail}
                    onChange={(event) => setManagerEmail(event.target.value)}
                  />
                </label>
                <Button
                  className="mt-3 h-11 w-full"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void loginAsManager()}
                >
                  <LogIn className="h-4 w-4" />
                  以管理者進入後台
                </Button>
              </div>
            </div>

            {message ? (
              <p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">{message}</p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
