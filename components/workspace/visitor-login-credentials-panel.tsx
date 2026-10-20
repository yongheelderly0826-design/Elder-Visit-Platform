"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Mail, KeyRound, RefreshCw } from "lucide-react";
import { useCan } from "@/components/auth/permission-provider";
import { Button } from "@/components/ui/button";

type Candidate = {
  email: string;
  fullName: string;
  visitorId: string;
  status: string;
  requestId: string;
};

type DeliveryResult = {
  email: string;
  fullName: string;
  visitorId: string;
  password: string;
  loginUrl: string;
  emailed: boolean;
  error?: string;
};

function toCsv(results: DeliveryResult[]) {
  const esc = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [
    ["姓名", "Email", "密碼", "訪員編碼", "登入網址", "已寄信", "錯誤"].map(esc).join(","),
    ...results.map((row) =>
      [
        row.fullName,
        row.email,
        row.password,
        row.visitorId,
        row.loginUrl,
        row.emailed ? "是" : "否",
        row.error || "",
      ]
        .map(esc)
        .join(","),
    ),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function downloadCsv(results: DeliveryResult[], filename: string) {
  const blob = new Blob([toCsv(results)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function VisitorLoginCredentialsPanel() {
  const canManageUsers = useCan("users.manage");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"generate" | "email" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<DeliveryResult[]>([]);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    if (!canManageUsers) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/users/visitor-login-credentials", { cache: "no-store" });
      const json = (await response.json()) as {
        data?: { candidates: Candidate[] };
        error?: { message?: string };
      };
      if (!response.ok) {
        setMessage(json.error?.message ?? "無法載入訪員清單。");
        setCandidates([]);
        return;
      }
      setCandidates(json.data?.candidates ?? []);
    } catch {
      setMessage("無法載入訪員清單。");
    } finally {
      setLoading(false);
    }
  }, [canManageUsers]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (row) =>
        row.fullName.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q) ||
        row.visitorId.toLowerCase().includes(q),
    );
  }, [candidates, query]);

  function toggle(email: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  function toggleAllFiltered() {
    const emails = filtered.map((row) => row.email);
    const allSelected = emails.every((email) => selected.has(email));
    setSelected((current) => {
      const next = new Set(current);
      if (allSelected) emails.forEach((email) => next.delete(email));
      else emails.forEach((email) => next.add(email));
      return next;
    });
  }

  async function run(sendEmail: boolean) {
    const emails = [...selected];
    if (emails.length === 0) {
      setMessage("請先勾選至少一位訪員。");
      return;
    }
    const actionLabel = sendEmail ? "產生密碼並寄信" : "產生密碼";
    if (
      !window.confirm(
        sendEmail
          ? `將為 ${emails.length} 位訪員重新產生密碼、寫入系統，並寄出登入網址與密碼信件。\n\n寄出後舊密碼立即失效。確定繼續？`
          : `將為 ${emails.length} 位訪員重新產生密碼並寫入系統，供專人送達。\n\n舊密碼會立即失效。確定繼續？`,
      )
    ) {
      return;
    }

    setBusy(sendEmail ? "email" : "generate");
    setMessage(null);
    try {
      const response = await fetch("/api/users/visitor-login-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, sendEmail }),
      });
      const json = (await response.json()) as {
        data?: {
          results: DeliveryResult[];
          summary: { total: number; saved: number; emailed: number; failed: number };
          loginUrl: string;
        };
        error?: { message?: string };
      };
      if (!response.ok || !json.data) {
        setMessage(json.error?.message ?? `${actionLabel}失敗。`);
        return;
      }
      setResults(json.data.results);
      const { summary } = json.data;
      setMessage(
        `${actionLabel}完成：成功 ${summary.saved}／共 ${summary.total}` +
          (sendEmail ? `，已寄信 ${summary.emailed}` : "") +
          (summary.failed ? `，失敗 ${summary.failed}` : "") +
          "。請立即下載明文表交給專人；系統不保存明文密碼。",
      );
      downloadCsv(
        json.data.results.filter((row) => row.password),
        `訪員登入帳密_${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch {
      setMessage(`${actionLabel}失敗，請稍後再試。`);
    } finally {
      setBusy(null);
    }
  }

  if (!canManageUsers) {
    return (
      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-base font-semibold">訪員登入帳密</h2>
        <p className="mt-2 text-sm text-muted-foreground">目前角色沒有管理使用者權限。</p>
      </section>
    );
  }

  return (
    <section className="grid gap-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">訪員登入帳密寄送</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              可為已核准訪員產生密碼並寫入系統；選擇「寄出信件」時，系統會把登入網址與密碼寄到各訪員
              Email。明文密碼僅在當次結果與下載檔可見，不會長期存於資料庫。
            </p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading || Boolean(busy)}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            重新整理
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <input
            className="w-full rounded-md border bg-background px-3 py-2 text-sm lg:max-w-sm"
            placeholder="搜尋姓名／Email／訪員編碼"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={toggleAllFiltered} disabled={filtered.length === 0}>
              {filtered.every((row) => selected.has(row.email)) && filtered.length > 0
                ? "取消全選（目前清單）"
                : "全選目前清單"}
            </Button>
            <Button
              variant="outline"
              disabled={Boolean(busy) || selected.size === 0}
              onClick={() => void run(false)}
            >
              {busy === "generate" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              產生密碼（專人送達）
            </Button>
            <Button disabled={Boolean(busy) || selected.size === 0} onClick={() => void run(true)}>
              {busy === "email" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              產生並寄出信件
            </Button>
          </div>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          已核准可處理 {candidates.length} 人；目前勾選 {selected.size} 人。
        </p>
        {message && (
          <p className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">{message}</p>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="max-h-[28rem] overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">選</th>
                <th className="px-3 py-2 font-medium">姓名</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">訪員編碼</th>
                <th className="px-3 py-2 font-medium">狀態</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    載入中…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    沒有符合的訪員。
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.email} className="border-t">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(row.email)}
                        onChange={() => toggle(row.email)}
                        aria-label={`選擇 ${row.fullName || row.email}`}
                      />
                    </td>
                    <td className="px-3 py-2">{row.fullName || "—"}</td>
                    <td className="px-3 py-2">{row.email}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.visitorId}</td>
                    <td className="px-3 py-2">{row.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {results.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold">本次產生結果（含明文密碼）</h3>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(results.filter((row) => row.password), `訪員登入帳密_再下載.csv`)
              }
            >
              <Download className="h-4 w-4" />
              再下載 CSV
            </Button>
          </div>
          <div className="mt-3 max-h-64 overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-2 py-1">姓名</th>
                  <th className="px-2 py-1">Email</th>
                  <th className="px-2 py-1">密碼</th>
                  <th className="px-2 py-1">寄信</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr key={row.email} className="border-b border-dashed">
                    <td className="px-2 py-1">{row.fullName}</td>
                    <td className="px-2 py-1">{row.email}</td>
                    <td className="px-2 py-1 font-mono">{row.password || row.error || "—"}</td>
                    <td className="px-2 py-1">{row.error ? "失敗" : row.emailed ? "已寄" : "未寄"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
