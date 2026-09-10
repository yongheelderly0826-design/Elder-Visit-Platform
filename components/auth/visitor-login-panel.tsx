"use client";

import { useState } from "react";
import { Eye, EyeOff, IdCard, LogIn, Smartphone } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";

export function VisitorLoginPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email,
          password,
          visitorOnly: true,
        }),
      });
      const result = (await response.json()) as {
        data?: { nextPath?: string };
        error?: { message?: string };
      };
      if (!response.ok) {
        setMessage(result.error?.message ?? "訪員帳號或密碼錯誤。");
        return;
      }
      window.location.replace(result.data?.nextPath ?? "/visitor/home");
    } catch {
      setMessage("目前無法登入，請確認網路後再試。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-6 text-foreground">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-md items-center">
        <section className="w-full overflow-hidden rounded-xl border bg-card shadow-sm">
          <header className="border-b bg-primary/5 p-5">
            <BrandLogo variant="full" size="lg" className="h-24 w-full" />
            <div className="mt-3 flex items-center gap-2 text-primary">
              <IdCard className="h-5 w-5" />
              <p className="font-semibold">訪員專用入口</p>
            </div>
            <h1 className="mt-2 text-2xl font-semibold">登入後顯示訪員證</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              本頁只接受訪員帳號，不顯示管理者登入或新訪員註冊。
            </p>
          </header>

          <form className="grid gap-4 p-5" onSubmit={(event) => void login(event)}>
            <label className="grid gap-2 text-sm font-medium">
              訪員 Email
              <input
                className="h-12 rounded-md border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring"
                type="email"
                autoComplete="username"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              密碼
              <span className="flex h-12 items-center rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring">
                <input
                  className="min-w-0 flex-1 bg-transparent px-3 text-base outline-none"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  className="flex h-12 w-12 items-center justify-center text-muted-foreground"
                  aria-label={showPassword ? "隱藏密碼" : "顯示密碼"}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </span>
            </label>

            <Button type="submit" className="h-12 w-full" disabled={busy}>
              <LogIn className="h-4 w-4" />
              {busy ? "登入中…" : "登入訪員工作台"}
            </Button>

            {message ? (
              <p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">{message}</p>
            ) : null}

            <div className="flex gap-2 rounded-md border bg-background p-3 text-xs leading-5 text-muted-foreground">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>
                要隱藏上方網址列，請先用 Safari 開啟本頁，再點「分享」→「加入主畫面」，之後從主畫面圖示啟動。一般 Safari 分頁或 LINE
                內建瀏覽器無法隱藏網址列。
              </p>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
