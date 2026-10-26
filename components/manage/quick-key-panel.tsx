"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPen, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageIntro } from "@/components/ui/page-intro";

import { formatYongheVillageCode } from "@/lib/domain/village-admins";
import type { DeskVisitorOption } from "@/lib/domain/manager-care-form-desk";
import type { VisitorRegistrationWorkerGroup } from "@/lib/domain/types";

type QuickPendingItem = {
  caseId: string;
  caseCode: string;
  caseName: string;
  village: string;
  villageSeq: number | null;
  villageCode: string;
  address: string;
  visitStatus: string;
  activeAssignmentId: string | null;
  activeVisitorId: string | null;
  activeVisitorName: string | null;
  blockedByOther: boolean;
  canContinue: boolean;
};

type Props = {
  mode: "desk" | "visitor";
  /** 訪員登入時鎖定 */
  lockedVisitor?: { id: string; name: string } | null;
  returnPath: string;
};

export function QuickKeyPanel({ mode, lockedVisitor = null, returnPath }: Props) {
  const router = useRouter();
  const [villageCodeInput, setVillageCodeInput] = useState("");
  const [loadedCode, setLoadedCode] = useState("");
  const [villageNames, setVillageNames] = useState<string[]>([]);
  const [items, setItems] = useState<QuickPendingItem[]>([]);
  const [visitors, setVisitors] = useState<DeskVisitorOption[]>([]);
  const [visitorQuery, setVisitorQuery] = useState("");
  const [selectedVisitorId, setSelectedVisitorId] = useState(lockedVisitor?.id ?? "");
  const [selectedVisitorName, setSelectedVisitorName] = useState(lockedVisitor?.name ?? "");
  const [creating, setCreating] = useState(false);
  const [newVisitor, setNewVisitor] = useState({
    name: "",
    phone: "",
    workerGroup: "civil_affairs" as VisitorRegistrationWorkerGroup,
  });
  const [busy, setBusy] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const visitorLocked = mode === "visitor" && Boolean(lockedVisitor?.id);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const code = formatYongheVillageCode(
      new URLSearchParams(window.location.search).get("villageCode"),
    );
    if (/^\d{6}$/.test(code)) setVillageCodeInput(code);
  }, []);

  useEffect(() => {
    if (!/^\d{6}$/.test(formatYongheVillageCode(villageCodeInput))) return;
    if (!selectedVisitorId) return;
    if (loadedCode) return;
    void loadPending();
    // 僅在帶入里編碼／鎖定訪員後自動載入一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [villageCodeInput, selectedVisitorId]);

  useEffect(() => {
    if (mode !== "desk") return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/manager/care-forms/options?part=visitors");
        const json = (await response.json()) as {
          data?: { visitors?: DeskVisitorOption[] };
        };
        if (cancelled || !response.ok) return;
        setVisitors(json.data?.visitors ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (!lockedVisitor?.id) return;
    setSelectedVisitorId(lockedVisitor.id);
    setSelectedVisitorName(lockedVisitor.name);
  }, [lockedVisitor]);

  const filteredVisitors = useMemo(() => {
    const needle = visitorQuery.trim();
    const rows = !needle
      ? visitors
      : visitors.filter((item) =>
          [item.name, item.badgeNo, item.phone].some((value) => value.includes(needle)),
        );
    return rows.slice(0, 30);
  }, [visitorQuery, visitors]);

  const loadPending = useCallback(async () => {
    const code = formatYongheVillageCode(villageCodeInput);
    if (!/^\d{6}$/.test(code)) {
      setMessage("請輸入六碼里編碼（例如 040051）。");
      return;
    }
    if (!selectedVisitorId && mode === "desk") {
      setMessage("請先選擇或新增訪查員。");
      return;
    }
    if (mode === "visitor" && !selectedVisitorId) {
      setMessage("找不到訪查員身分，請重新登入。");
      return;
    }

    setListBusy(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({
        villageCode: code,
        visitorId: selectedVisitorId,
      });
      const response = await fetch(`/api/manager/care-forms/quick-pending?${params}`);
      const json = (await response.json()) as {
        data?: {
          villageCode: string;
          villageNames: string[];
          items: QuickPendingItem[];
        };
        error?: { message?: string };
      };
      if (!response.ok) {
        setMessage(json.error?.message ?? "無法載入待訪名單");
        return;
      }
      setLoadedCode(json.data?.villageCode ?? code);
      setVillageNames(json.data?.villageNames ?? []);
      setItems(json.data?.items ?? []);
      if (!(json.data?.items ?? []).length) {
        setMessage("此里目前沒有待訪個案（或皆已完成／不訪）。");
      }
    } catch {
      setMessage("目前無法連線，請稍後再試。");
    } finally {
      setListBusy(false);
    }
  }, [mode, selectedVisitorId, villageCodeInput]);

  async function createVisitor() {
    const name = newVisitor.name.trim();
    const phone = newVisitor.phone.trim();
    if (!name || !phone) {
      setMessage("現場建檔請填姓名與手機。");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/manager/care-forms/visitors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          workerGroup: newVisitor.workerGroup,
        }),
      });
      const json = (await response.json()) as {
        data?: DeskVisitorOption;
        error?: { message?: string };
      };
      if (!response.ok || !json.data?.id) {
        setMessage(json.error?.message ?? "無法新增訪查員");
        return;
      }
      setVisitors((current) => [json.data!, ...current]);
      setSelectedVisitorId(json.data.id);
      setSelectedVisitorName(json.data.name);
      setCreating(false);
      setNewVisitor({ name: "", phone: "", workerGroup: "civil_affairs" });
      setMessage(`已現場建檔「${json.data.name}」，可載入待訪名單後確認 KEY。`);
    } catch {
      setMessage("目前無法連線，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCase(item: QuickPendingItem) {
    if (!selectedVisitorId) {
      setMessage("請先指定訪查員。");
      return;
    }
    if (item.blockedByOther) {
      setMessage(
        `「${item.caseName}」已有進行中派案（${item.activeVisitorName || item.activeVisitorId}），無法確認。`,
      );
      return;
    }

    setConfirmingId(item.caseId);
    setBusy(true);
    setMessage(null);
    try {
      let assignmentId = item.canContinue ? item.activeAssignmentId : null;

      if (!assignmentId) {
        if (mode === "visitor") {
          const response = await fetch("/api/visitor/quick-confirm", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              caseId: item.caseId,
              caseName: item.caseName,
              caseCode: item.caseCode,
            }),
          });
          const json = (await response.json()) as {
            data?: { assignmentId?: string };
            error?: { message?: string };
          };
          if (!response.ok || !json.data?.assignmentId) {
            setMessage(json.error?.message ?? "無法確認派案");
            return;
          }
          assignmentId = json.data.assignmentId;
        } else {
          const today = new Date().toISOString().slice(0, 10);
          const response = await fetch("/api/manager/care-forms/prepare", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              visitorId: selectedVisitorId,
              visitorName: selectedVisitorName,
              visitDate: today,
              source: "field_self",
              cases: [
                {
                  caseId: item.caseId,
                  caseName: item.caseName,
                  caseCode: item.caseCode,
                },
              ],
            }),
          });
          const json = (await response.json()) as {
            data?: { assignmentId?: string };
            error?: { message?: string };
          };
          if (!response.ok || !json.data?.assignmentId) {
            setMessage(json.error?.message ?? "無法確認派案");
            return;
          }
          assignmentId = json.data.assignmentId;
        }
      }

      const params = new URLSearchParams();
      params.set("return", returnPath);
      params.set("villageCode", loadedCode || formatYongheVillageCode(villageCodeInput));
      if (mode === "visitor") {
        router.push(`/visitor/visits/${assignmentId}?${params.toString()}`);
      } else {
        const today = new Date().toISOString().slice(0, 10);
        params.set("date", today);
        router.push(`/manager/care-forms/${assignmentId}?${params.toString()}`);
      }
    } catch {
      setMessage("目前無法連線，請稍後再試。");
    } finally {
      setBusy(false);
      setConfirmingId(null);
    }
  }

  return (
    <div className="grid gap-4">
      <PageIntro
        icon={ClipboardPen}
        title="快速 KEY（待訪名單）"
        description={
          mode === "visitor"
            ? "輸入里編碼載入待訪名單，點「確認」進關懷表；送出後請再回到此頁載入名單繼續下一案。"
            : "輸入里編碼與訪查員（可現場建檔），載入待訪名單後逐案確認 KEY。來源標記為訪員自領・實訪。"
        }
      />

      <section className="rounded-lg border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            里編碼（六碼）
            <input
              className="h-11 rounded-md border px-3 text-sm"
              inputMode="numeric"
              placeholder="例如 040051"
              value={villageCodeInput}
              onChange={(event) => setVillageCodeInput(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>

          <div className="grid gap-1 text-sm font-medium">
            訪查員
            {visitorLocked ? (
              <p className="flex h-11 items-center rounded-md border bg-secondary/50 px-3 text-sm">
                {selectedVisitorName || selectedVisitorId}（登入本人）
              </p>
            ) : (
              <p className="text-xs font-normal text-muted-foreground">
                {selectedVisitorId
                  ? `已選：${selectedVisitorName || selectedVisitorId}`
                  : "請搜尋選擇或現場建檔"}
              </p>
            )}
          </div>
        </div>

        {mode === "desk" && !visitorLocked ? (
          <div className="mt-3 grid gap-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={creating ? "outline" : "secondary"}
                onClick={() => setCreating((value) => !value)}
              >
                {creating ? (
                  <>
                    <Search className="h-4 w-4" />
                    改搜現有訪查員
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    現場建檔訪查員
                  </>
                )}
              </Button>
            </div>

            {creating ? (
              <div className="grid gap-2 rounded-md border border-dashed p-3 sm:grid-cols-3">
                <input
                  className="h-10 rounded-md border px-3 text-sm"
                  placeholder="姓名 *"
                  value={newVisitor.name}
                  onChange={(event) =>
                    setNewVisitor((current) => ({ ...current, name: event.target.value }))
                  }
                />
                <input
                  className="h-10 rounded-md border px-3 text-sm"
                  placeholder="手機 *"
                  value={newVisitor.phone}
                  onChange={(event) =>
                    setNewVisitor((current) => ({ ...current, phone: event.target.value }))
                  }
                />
                <select
                  className="h-10 rounded-md border px-3 text-sm"
                  value={newVisitor.workerGroup}
                  onChange={(event) =>
                    setNewVisitor((current) => ({
                      ...current,
                      workerGroup: event.target.value as VisitorRegistrationWorkerGroup,
                    }))
                  }
                >
                  <option value="civil_affairs">民政</option>
                  <option value="social_affairs">社政</option>
                </select>
                <Button type="button" disabled={busy} onClick={() => void createVisitor()}>
                  建立並選用
                </Button>
              </div>
            ) : (
              <div className="grid gap-2">
                <input
                  className="h-10 rounded-md border px-3 text-sm"
                  placeholder="搜尋訪查員姓名／證號"
                  value={visitorQuery}
                  onChange={(event) => setVisitorQuery(event.target.value)}
                />
                <div className="max-h-40 overflow-auto rounded-md border">
                  {filteredVisitors.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-b-0 ${
                        selectedVisitorId === item.id ? "bg-primary/10" : "hover:bg-secondary/60"
                      }`}
                      onClick={() => {
                        setSelectedVisitorId(item.id);
                        setSelectedVisitorName(item.name);
                      }}
                    >
                      <span className="font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground">{item.badgeNo || item.status}</span>
                    </button>
                  ))}
                  {!filteredVisitors.length ? (
                    <p className="p-3 text-sm text-muted-foreground">沒有符合的訪查員，可改現場建檔。</p>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-4">
          <Button type="button" disabled={listBusy || busy} onClick={() => void loadPending()}>
            {listBusy ? "載入中…" : "載入待訪名單"}
          </Button>
        </div>
      </section>

      {loadedCode ? (
        <section className="rounded-lg border border-primary/30 bg-card p-4">
          <h2 className="font-semibold">待訪名單</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            里編碼 {loadedCode}
            {villageNames.length ? `（${villageNames.join("、")}）` : ""}
            {" · "}
            訪查員 {selectedVisitorName || selectedVisitorId}
            {" · "}
            共 {items.length} 筆（依里編號）
          </p>

          <div className="mt-4 grid gap-2">
            {items.map((item) => {
              const seqLabel = item.villageSeq != null ? `#${item.villageSeq}` : "";
              return (
                <div
                  key={item.caseId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {seqLabel ? `${seqLabel} ` : ""}
                      {item.caseName}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.caseCode}
                      {item.address ? ` · ${item.address}` : ""}
                      {item.blockedByOther
                        ? ` · 進行中：${item.activeVisitorName || item.activeVisitorId}`
                        : item.canContinue
                          ? " · 可繼續 KEY"
                          : ` · ${item.visitStatus || "待訪"}`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    disabled={busy || item.blockedByOther}
                    variant={item.blockedByOther ? "outline" : "default"}
                    onClick={() => void confirmCase(item)}
                  >
                    <ClipboardPen className="h-4 w-4" />
                    {confirmingId === item.caseId
                      ? "準備中…"
                      : item.blockedByOther
                        ? "他人進行中"
                        : item.canContinue
                          ? "繼續 KEY"
                          : "確認"}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {message ? (
        <p
          className={
            message.includes("無法") || message.includes("請") || message.includes("進行中")
              ? "rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
              : "rounded-md bg-secondary p-3 text-sm text-muted-foreground"
          }
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
