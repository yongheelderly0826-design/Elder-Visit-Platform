"use client";

import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
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
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loginError = getLoginErrorMessage(params.get("error"));
    if (loginError) setMessage(loginError);
  }, []);

  async function loginAsManager() {
    setMessage(null);
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
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-xl items-center">
        <section className="w-full overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="border-b bg-primary/5 p-5 lg:p-6">
            <BrandLogo variant="full" size="lg" className="h-28 w-full max-w-md" />
            <div className="mt-2 min-w-0">
              <p className="text-base font-semibold">獨居長者訪查管理平台</p>
              <p className="text-sm text-muted-foreground">承辦專用入口</p>
            </div>
          </div>

          <div className="p-5 lg:p-6">
            <p className="text-sm font-medium text-primary">管理者登入</p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">永和區管理者登入</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              使用公所指定 Google 帳號進入後台。資料存在同一帳號的 Google 試算表，不需 OAuth Client ID。
            </p>

            <div className="mt-6 rounded-lg border bg-card p-3">
              <label className="block text-sm font-medium">
                Google 帳號（Gmail）
                <input
                  className="mt-2 h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  autoComplete="email"
                  value={managerEmail}
                  onChange={(event) => setManagerEmail(event.target.value)}
                />
              </label>
              <Button className="mt-3 h-11 w-full" onClick={() => void loginAsManager()}>
                <LogIn className="h-4 w-4" />
                以管理者進入
              </Button>
            </div>

            {message ? (
              <p className="mt-4 rounded-md bg-secondary p-3 text-sm text-muted-foreground">{message}</p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
