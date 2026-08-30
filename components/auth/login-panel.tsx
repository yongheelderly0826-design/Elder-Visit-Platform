"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Eye,
  EyeOff,
  LogIn,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";

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

export function LoginPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [inviteMode, setInviteMode] = useState(false);
  const [inviteReady, setInviteReady] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loginError = getLoginErrorMessage(params.get("error"));
    if (loginError) setMessage(loginError);
    void fetch("/api/auth/google/status")
      .then((res) => res.json())
      .then((json: { data?: { enabled?: boolean } }) => setGoogleEnabled(Boolean(json.data?.enabled)))
      .catch(() => setGoogleEnabled(false));
  }, []);

  useEffect(() => {
    async function prepareInviteSession() {
      if (typeof window === "undefined") return;

      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const isInvite =
        searchParams.get("invited") === "1" ||
        hashParams.get("type") === "invite" ||
        hashParams.get("type") === "recovery";

      if (!isInvite) return;

      setInviteMode(true);
      setMessage("請先設定密碼，完成後再用 Email 與新密碼登入系統。");

      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (!accessToken || !refreshToken) {
        setInviteReady(false);
        return;
      }

      try {
        const supabase = createBrowserSupabaseClient();
        const { error, data } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error || !data.session) {
          setInviteReady(false);
          setMessage("邀請連結已失效或無法讀取，請請承辦管理者重寄登入邀請。");
          return;
        }

        setEmail(data.session.user.email ?? "");
        setPassword("");
        setInviteReady(true);
        window.history.replaceState(null, "", "/login?invited=1");
      } catch {
        setInviteReady(false);
        setMessage("目前無法啟用邀請連結，請稍後再試或請管理者重寄。");
      }
    }

    void prepareInviteSession();
  }, []);

  async function loginWithGoogle() {
    const nextPath = getSafeNextPath("/dashboard");
    window.location.href = `/api/auth/google?next=${encodeURIComponent(nextPath)}`;
  }

  async function login() {
    setMessage(null);

    const nextPath = getSafeNextPath("/dashboard");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        email,
        password,
        next: nextPath,
      }),
    });

    if (!response.ok) {
      setMessage("帳號或密碼錯誤，請確認登入資料後再試一次。");
      return;
    }

    const result = (await response.json()) as { data?: { nextPath?: string } };
    window.location.href = result.data?.nextPath ?? nextPath;
  }

  async function setupPassword() {
    setMessage(null);

    if (newPassword.length < 8) {
      setMessage("密碼至少需要 8 個字元。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("兩次輸入的密碼不一致。");
      return;
    }

    setSettingPassword(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        setMessage(error.message || "密碼設定失敗，請重新開啟邀請信連結。");
        return;
      }

      await supabase.auth.signOut();
      setPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setInviteReady(false);
      setInviteMode(false);
      setMessage("密碼已設定完成，請用 Email 與新密碼登入系統。");
    } catch {
      setMessage("密碼設定失敗，請重新開啟邀請信連結。");
    } finally {
      setSettingPassword(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-xl items-center">
        <section className="w-full overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="border-b bg-primary/5 p-5 lg:p-6">
            <div className="flex flex-col">
              <BrandLogo variant="full" size="lg" className="h-28 w-full max-w-md" />
              <div className="mt-2 min-w-0">
                <p className="text-base font-semibold">獨居長者訪查管理平台</p>
                <p className="text-sm text-muted-foreground">公益治理 SaaS 後台</p>
              </div>
            </div>
          </div>

          <div className="p-5 lg:p-6">
            <div>
              <p className="text-sm font-medium text-primary">使用者登入</p>
              <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">登入工作空間</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                永和區承辦人請用 Google 帳號登入；訪員請用 Email 密碼或先完成註冊送件。
              </p>
            </div>

            <div className="mt-6 grid gap-4">
              {googleEnabled && (
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-sm font-semibold">永和區管理者登入</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    使用公所指定 Google 帳號登入，管理個案、派案與匯出。
                  </p>
                  <Button className="mt-3 h-11 w-full" variant="outline" onClick={loginWithGoogle}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    使用 Google 帳號登入
                  </Button>
                </div>
              )}

              <div className="grid gap-4">
              {inviteMode && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="text-sm font-semibold text-primary">訪員帳號啟用</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    請設定至少 8 個字元的新密碼。完成後回到登入畫面，用 Email 與新密碼登入。
                  </p>
                  <div className="mt-3 grid gap-3">
                    <input
                      className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="設定新密碼"
                      disabled={!inviteReady || settingPassword}
                    />
                    <input
                      className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus-within:ring-ring"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="再次輸入新密碼"
                      disabled={!inviteReady || settingPassword}
                    />
                    <Button
                      className="h-11 w-full"
                      onClick={setupPassword}
                      disabled={!inviteReady || settingPassword}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {settingPassword ? "設定中" : "完成密碼設定"}
                    </Button>
                    {!inviteReady && (
                      <p className="text-xs leading-5 text-muted-foreground">
                        如果按鈕不能使用，代表邀請連結缺少啟用資訊或已失效，請請承辦管理者重寄登入邀請。
                      </p>
                    )}
                  </div>
                </div>
              )}

              <label className="block text-sm font-medium">
                帳號 Email
                <input
                  className="mt-2 h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>

              <label className="block text-sm font-medium">
                密碼
                <div className="mt-2 flex h-11 items-center rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring">
                  <input
                    className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                    autoComplete="current-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "隱藏密碼" : "顯示密碼"}
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              <Button className="h-11 w-full" onClick={login}>
                <LogIn className="h-4 w-4" />
                登入系統
              </Button>

              <div className="rounded-lg border bg-primary/5 p-3">
                <p className="text-sm font-semibold text-primary">新訪員還沒有帳號？</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  先填寫註冊資料、自拍證件照與教育訓練資訊，送出後由承辦管理者審核。
                </p>
                <Button asChild variant="outline" className="mt-3 h-10 w-full bg-card">
                  <Link href="/register">
                    <UserPlus className="h-4 w-4" />
                    前往新訪員註冊
                  </Link>
                </Button>
              </div>

              {message && (
                <p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">
                  {message}
                </p>
              )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
