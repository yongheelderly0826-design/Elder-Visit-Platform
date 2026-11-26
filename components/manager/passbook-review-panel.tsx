"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Submission = {
  submission_id?: string;
  visitor_id?: string;
  name_snapshot?: string;
  id_masked?: string;
  account_name?: string;
  account_number?: string;
  bank_name?: string;
  bank_code?: string;
  using_others_account?: string | boolean;
  address_type?: string;
  address?: string;
  passbook_drive_url?: string;
  status?: string;
  submitted_at?: string;
};

function isUsingOthersAccount(value: string | boolean | undefined): boolean {
  if (value === true) return true;
  const text = String(value ?? "").trim();
  return text === "是" || text.toLowerCase() === "true" || text === "1";
}

export function PassbookReviewPanel() {
  const [items, setItems] = useState<Submission[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/manager/passbook-submissions?status=待審", {
        cache: "no-store",
      });
      const json = (await response.json()) as {
        data?: { items?: Submission[] };
        error?: { message?: string };
      };
      if (!response.ok) {
        setMessage(json.error?.message ?? "讀取失敗");
        setItems([]);
        return;
      }
      setItems(json.data?.items ?? []);
      setMessage(null);
    } catch {
      setMessage("讀取補件清單失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(submissionId: string, decision: "已確認" | "退回") {
    setBusyId(submissionId);
    setMessage(null);
    try {
      const response = await fetch("/api/manager/passbook-submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ submissionId, decision }),
      });
      const json = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setMessage(json.error?.message ?? "審核失敗");
        return;
      }
      setMessage(decision === "已確認" ? "已確認並回寫主檔帳號" : "已退回");
      await load();
    } catch {
      setMessage("審核失敗");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">存摺補件審核</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          僅承辦管理者可審核。確認後會回寫訪查員主檔匯款帳號；退回不覆寫主檔。TEMP／臨櫃不可使用此頁。
        </p>
      </div>

      {message && <p className="text-sm text-amber-800">{message}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">載入中…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">目前沒有待審補件。</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const id = String(item.submission_id ?? "");
            return (
              <li key={id} className="rounded-lg border bg-card p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium">
                      {item.name_snapshot}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({item.id_masked})
                      </span>
                    </p>
                    <p>
                      {item.bank_code} {item.bank_name}／戶名 {item.account_name}
                    </p>
                    <p className="text-xs text-stone-700">
                      帳戶歸屬：
                      {isUsingOthersAccount(item.using_others_account)
                        ? "委用他人帳戶"
                        : "本人台新／合庫帳戶"}
                    </p>
                    <p className="font-mono text-xs tracking-wide">
                      帳號 {item.account_number}
                    </p>
                    {(item.address_type || item.address) && (
                      <p className="text-xs leading-relaxed text-stone-700">
                        {item.address_type || "地址"}：{item.address || "—"}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {id} · {item.submitted_at}
                    </p>
                    {item.passbook_drive_url && (
                      <a
                        className="text-xs text-teal-700 underline"
                        href={String(item.passbook_drive_url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        開啟存摺照片
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busyId === id}
                      onClick={() => void review(id, "已確認")}
                    >
                      確認
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === id}
                      onClick={() => void review(id, "退回")}
                    >
                      退回
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
