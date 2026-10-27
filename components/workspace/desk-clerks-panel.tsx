"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardPen, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  DeskClerkCredential,
  DeskClerkRecord,
  DeskClerkStatsRow,
  DeskKeyLogRow,
} from "@/lib/domain/desk-clerks";

type OverviewResponse = {
  data?: {
    clerks: DeskClerkRecord[];
    stats: {
      items: DeskClerkStatsRow[];
      pieceTotal: number;
      keyTotal: number;
    };
  };
  error?: { message?: string };
};

export function DeskClerksPanel() {
  const [clerks, setClerks] = useState<DeskClerkRecord[]>([]);
  const [stats, setStats] = useState<DeskClerkStatsRow[]>([]);
  const [pieceTotal, setPieceTotal] = useState(0);
  const [keyTotal, setKeyTotal] = useState(0);
  const [validUntil, setValidUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [freshCredentials, setFreshCredentials] = useState<DeskClerkCredential[] | null>(null);
  const [selectedClerkId, setSelectedClerkId] = useState<string | null>(null);
  const [logs, setLogs] = useState<DeskKeyLogRow[]>([]);

  const load = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/manager/desk-clerks", { cache: "no-store" });
      const json = (await response.json()) as OverviewResponse;
      if (!response.ok || !json.data) {
        setMessage(json.error?.message ?? "無法讀取臨時登打帳號。");
        return;
      }
      setClerks(json.data.clerks);
      setStats(json.data.stats.items);
      setPieceTotal(json.data.stats.pieceTotal);
      setKeyTotal(json.data.stats.keyTotal);
    } catch {
      setMessage("目前無法連線，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createBatch() {
    if (
      !window.confirm(
        "將建立／重設 TEMP-01～TEMP-20（共 20 組通行碼）。舊通行碼會失效。確定繼續？",
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/manager/desk-clerks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create_batch",
          count: 20,
          validUntil: validUntil ? new Date(`${validUntil}T23:59:59+08:00`).toISOString() : null,
        }),
      });
      const json = (await response.json()) as {
        data?: { credentials?: DeskClerkCredential[]; warning?: string };
        error?: { message?: string };
      };
      if (!response.ok || !json.data?.credentials) {
        setMessage(json.error?.message ?? "批次建立失敗。");
        return;
      }
      setFreshCredentials(json.data.credentials);
      setMessage(json.data.warning ?? "已建立 20 組臨時帳號。");
      await load();
    } catch {
      setMessage("目前無法連線，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(clerkId: string, status: "active" | "disabled") {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/manager/desk-clerks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "set_status",
          clerkId,
          status,
          validUntil: validUntil ? new Date(`${validUntil}T23:59:59+08:00`).toISOString() : undefined,
        }),
      });
      const json = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setMessage(json.error?.message ?? "更新狀態失敗。");
        return;
      }
      await load();
    } catch {
      setMessage("目前無法連線，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  async function disableAll() {
    if (!window.confirm("確定停用全部臨時登打帳號？停用後無法再從 /yonghe 登入。")) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/manager/desk-clerks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "disable_all" }),
      });
      const json = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setMessage(json.error?.message ?? "全部停用失敗。");
        return;
      }
      setMessage("已停用全部臨時登打帳號。");
      await load();
    } catch {
      setMessage("目前無法連線，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  async function openLogs(clerkId: string) {
    setSelectedClerkId(clerkId);
    setBusy(true);
    try {
      const response = await fetch(
        `/api/manager/desk-clerks/logs?clerkId=${encodeURIComponent(clerkId)}`,
        { cache: "no-store" },
      );
      const json = (await response.json()) as {
        data?: { items?: DeskKeyLogRow[] };
        error?: { message?: string };
      };
      if (!response.ok) {
        setMessage(json.error?.message ?? "讀取明細失敗。");
        return;
      }
      setLogs(json.data?.items ?? []);
    } catch {
      setMessage("目前無法連線，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  function downloadCredentialsCsv() {
    if (!freshCredentials?.length) return;
    const header = ["clerk_id", "display_name", "passcode", "valid_until", "login_url"];
    const lines = [
      header.join(","),
      ...freshCredentials.map((row) =>
        [
          row.clerkId,
          row.displayName || "",
          row.passcode,
          row.validUntil || "",
          "https://elder-visit-platform-ruby.vercel.app/yonghe/desk",
        ]
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `desk-clerks-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadStatsCsv() {
    const header = [
      "clerk_id",
      "display_name",
      "status",
      "piece_count",
      "key_count",
      "last_keyed_at",
      "valid_until",
    ];
    const lines = [
      header.join(","),
      ...stats.map((row) =>
        [
          row.clerkId,
          row.displayName,
          row.status || "",
          row.pieceCount,
          row.keyCount,
          row.lastKeyedAt || "",
          row.validUntil || "",
        ]
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      ),
    ];
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `desk-clerk-pieces-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const statsById = new Map(stats.map((row) => [row.clerkId, row]));

  return (
    <section className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="font-semibold">臨時登打帳號</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              批次開 TEMP-01～TEMP-20，從 /yonghe/desk 登入只做關懷表建檔。計件：每送出 1 張＝1
              件；同一案「未遇」多張只算 1 件。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
              重新整理
            </Button>
            <Button type="button" variant="outline" disabled={busy || !stats.length} onClick={downloadStatsCsv}>
              <Download className="h-4 w-4" />
              匯出計件 CSV
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border bg-background p-3">
            <p className="text-xs text-muted-foreground">帳號數</p>
            <p className="mt-1 text-2xl font-semibold">{clerks.length}</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <p className="text-xs text-muted-foreground">計件總數</p>
            <p className="mt-1 text-2xl font-semibold">{pieceTotal}</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <p className="text-xs text-muted-foreground">送出張數（含未遇加張）</p>
            <p className="mt-1 text-2xl font-semibold">{keyTotal}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-md border border-dashed bg-secondary/40 p-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-sm font-medium">
            到期日（選填，當天 23:59 台北時間）
            <input
              type="date"
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
            />
          </label>
          <Button type="button" disabled={busy} onClick={() => void createBatch()}>
            <ClipboardPen className="h-4 w-4" />
            {busy ? "處理中…" : "批次開 20 帳"}
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void disableAll()}>
            全部停用
          </Button>
        </div>

        {message ? (
          <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">{message}</p>
        ) : null}

        {freshCredentials?.length ? (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-amber-950">
                通行碼僅顯示一次，請立即下載／列印後交給臨時人員。
              </p>
              <Button type="button" size="sm" variant="outline" onClick={downloadCredentialsCsv}>
                <Download className="h-4 w-4" />
                下載帳密 CSV
              </Button>
            </div>
            <ul className="mt-3 grid max-h-64 gap-1 overflow-auto text-sm sm:grid-cols-2">
              {freshCredentials.map((row) => (
                <li key={row.clerkId} className="rounded border bg-white px-2 py-1 font-mono text-xs">
                  {row.clerkId}　{row.passcode}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="font-semibold">帳號與計件</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">帳號</th>
                <th className="px-2 py-2 font-medium">顯示名</th>
                <th className="px-2 py-2 font-medium">狀態</th>
                <th className="px-2 py-2 font-medium">計件</th>
                <th className="px-2 py-2 font-medium">送出張數</th>
                <th className="px-2 py-2 font-medium">最後 KEY</th>
                <th className="px-2 py-2 font-medium">到期</th>
                <th className="px-2 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {(clerks.length ? clerks : stats.map((row) => ({
                clerkId: row.clerkId,
                displayName: row.displayName,
                status: (row.status === "active" ? "active" : "disabled") as "active" | "disabled",
                validFrom: null,
                validUntil: row.validUntil ?? null,
                createdAt: null,
                updatedAt: null,
                disabledAt: null,
                lastLoginAt: row.lastLoginAt ?? null,
              }))).map((clerk) => {
                const row = statsById.get(clerk.clerkId);
                return (
                  <tr key={clerk.clerkId} className="border-b last:border-0">
                    <td className="px-2 py-2 font-medium">{clerk.clerkId}</td>
                    <td className="px-2 py-2">{clerk.displayName || "—"}</td>
                    <td className="px-2 py-2">
                      {clerk.status === "active" ? (
                        <span className="text-emerald-700">啟用</span>
                      ) : (
                        <span className="text-muted-foreground">停用</span>
                      )}
                    </td>
                    <td className="px-2 py-2">{row?.pieceCount ?? 0}</td>
                    <td className="px-2 py-2">{row?.keyCount ?? 0}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {row?.lastKeyedAt ? row.lastKeyedAt.replace("T", " ").slice(0, 16) : "—"}
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {clerk.validUntil ? clerk.validUntil.slice(0, 10) : "—"}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void setStatus(
                              clerk.clerkId,
                              clerk.status === "active" ? "disabled" : "active",
                            )
                          }
                        >
                          {clerk.status === "active" ? "停用" : "啟用"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void openLogs(clerk.clerkId)}
                        >
                          明細
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!clerks.length && !stats.length ? (
                <tr>
                  <td colSpan={8} className="px-2 py-6 text-center text-muted-foreground">
                    尚無臨時帳號。請按「批次開 20 帳」。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {selectedClerkId ? (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">{selectedClerkId} 登打明細</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => setSelectedClerkId(null)}>
              關閉
            </Button>
          </div>
          <ul className="mt-3 max-h-80 space-y-2 overflow-auto text-sm">
            {logs.map((log) => (
              <li key={log.logId} className="rounded-md border px-3 py-2">
                <p className="font-medium">
                  {log.caseLabel || log.caseId || "—"}
                  {log.countsAsPiece ? (
                    <span className="ml-2 text-xs text-emerald-700">計 1 件</span>
                  ) : (
                    <span className="ml-2 text-xs text-muted-foreground">不計件（未遇加張）</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {log.keyedAt.replace("T", " ").slice(0, 19)} · {log.visitResult || "—"} ·{" "}
                  {log.careformId || "—"}
                </p>
              </li>
            ))}
            {!logs.length ? (
              <li className="text-muted-foreground">此帳號尚無登打紀錄。</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
