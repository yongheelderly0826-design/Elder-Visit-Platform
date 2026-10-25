"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MapPinned, Plus, RefreshCw, Search } from "lucide-react";
import { PageIntro } from "@/components/ui/page-intro";
import { Button } from "@/components/ui/button";
import {
  VILLAGE_ADMIN_KIND_LABELS,
  VILLAGE_ORG_OPTIONS,
  type VillageAdminRow,
} from "@/lib/domain/village-admins";

type VisitorOption = {
  visitorId: string;
  name: string;
  email: string;
  status: string;
};

type Payload = {
  rows: VillageAdminRow[];
  visitors: VisitorOption[];
  villages: string[];
  uncoveredVillages: string[];
  summary: {
    total: number;
    active: number;
    person: number;
    org: number;
    skip: number;
    matched: number;
    uncovered: number;
  };
};

type Draft = {
  assignmentRowId: string;
  villageName: string;
  villageCode: string;
  adminKind: VillageAdminRow["adminKind"];
  adminDisplayName: string;
  adminAccountKey: string;
  matchedVisitorId: string;
  notes: string;
  status: string;
};

const emptyDraft = (): Draft => ({
  assignmentRowId: "",
  villageName: "",
  villageCode: "",
  adminKind: "person",
  adminDisplayName: "",
  adminAccountKey: "",
  matchedVisitorId: "",
  notes: "",
  status: "active",
});

export function VillageAdminsPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | VillageAdminRow["adminKind"]>("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setMessage(null);
    const response = await fetch("/api/manager/village-admins");
    const json = (await response.json()) as { data?: Payload; error?: { message?: string } };
    if (!response.ok) {
      setMessage(json.error?.message ?? "無法載入里責任分配");
      return;
    }
    setData(json.data ?? null);
  }

  useEffect(() => {
    void load();
  }, []);

  const visitorById = useMemo(() => {
    const map = new Map<string, VisitorOption>();
    for (const row of data?.visitors ?? []) map.set(row.visitorId, row);
    return map;
  }, [data?.visitors]);

  const filtered = useMemo(() => {
    const needle = query.trim();
    return (data?.rows ?? []).filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (kindFilter !== "all" && row.adminKind !== kindFilter) return false;
      if (!needle) return true;
      return [row.villageName, row.adminDisplayName, row.adminAccountKey, row.notes].some((value) =>
        value.includes(needle),
      );
    });
  }, [data?.rows, kindFilter, query, statusFilter]);

  function startCreate(villageName = "") {
    setDraft({ ...emptyDraft(), villageName });
    setEditing(true);
    setMessage(null);
  }

  function startEdit(row: VillageAdminRow) {
    setDraft({
      assignmentRowId: row.assignmentRowId,
      villageName: row.villageName,
      villageCode: row.villageCode,
      adminKind: row.adminKind,
      adminDisplayName: row.adminDisplayName,
      adminAccountKey: row.adminAccountKey,
      matchedVisitorId: row.matchedVisitorId,
      notes: row.notes,
      status: row.status || "active",
    });
    setEditing(true);
    setMessage(null);
  }

  async function saveDraft() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/manager/village-admins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setMessage(json.error?.message ?? "儲存失敗");
        return;
      }
      setEditing(false);
      setDraft(emptyDraft());
      setMessage("已儲存里責任分配。");
      await load();
    } catch {
      setMessage("目前無法連線，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(row: VillageAdminRow, status: "active" | "inactive") {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/manager/village-admins", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignmentRowId: row.assignmentRowId, status }),
      });
      const json = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setMessage(json.error?.message ?? "狀態更新失敗");
        return;
      }
      setMessage(status === "active" ? "已啟用。" : "已停用（不再進入填表過濾）。");
      await load();
    } catch {
      setMessage("目前無法連線，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  function onKindChange(kind: VillageAdminRow["adminKind"]) {
    setDraft((current) => {
      if (kind === "person") {
        return { ...current, adminKind: kind, adminAccountKey: current.adminDisplayName };
      }
      const org = VILLAGE_ORG_OPTIONS.find((item) => item.slug === current.adminAccountKey) ?? VILLAGE_ORG_OPTIONS[0];
      return {
        ...current,
        adminKind: kind === "skip" ? "skip" : "org",
        adminDisplayName: org.label,
        adminAccountKey: kind === "skip" ? VILLAGE_ORG_OPTIONS[3].slug : org.slug,
      };
    });
  }

  function onOrgSlugChange(slug: string) {
    const org = VILLAGE_ORG_OPTIONS.find((item) => item.slug === slug);
    if (!org) return;
    setDraft((current) => ({
      ...current,
      adminKind: slug.includes("urban-renewal") ? "skip" : "org",
      adminDisplayName: org.label,
      adminAccountKey: org.slug,
    }));
  }

  function onVisitorPick(visitorId: string) {
    const visitor = visitorById.get(visitorId);
    setDraft((current) => ({
      ...current,
      matchedVisitorId: visitorId,
      adminDisplayName: visitor?.name || current.adminDisplayName,
      adminAccountKey: visitor?.name || current.adminAccountKey,
      adminKind: "person",
    }));
  }

  const summary = data?.summary;

  return (
    <div className="grid gap-5">
      <PageIntro
        icon={MapPinned}
        eyebrow="里責設定"
        title="里責任分配"
        description="設定各里的個人／組織管理員。關懷表建檔會依此過濾；一里可多人，組織可用共用帳號。"
      />

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>共 {summary?.total ?? "—"} 列</span>
        <span>· 啟用 {summary?.active ?? "—"}</span>
        <span>· 個人 {summary?.person ?? "—"}</span>
        <span>· 組織 {summary?.org ?? "—"}</span>
        <span>· 不訪 {summary?.skip ?? "—"}</span>
        <span>· 已對訪查員 {summary?.matched ?? "—"}</span>
        <span>· 尚無啟用分配 {summary?.uncovered ?? "—"} 里</span>
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          重新整理
        </Button>
        <Button type="button" size="sm" onClick={() => startCreate()}>
          <Plus className="h-4 w-4" />
          新增分配
        </Button>
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href="/desk/care-forms">開啟關懷表建檔</Link>
        </Button>
      </div>

      {data?.uncoveredVillages?.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">尚無啟用分配的里（{data.uncoveredVillages.length}）</p>
          <p className="mt-1 text-amber-900/80">{data.uncoveredVillages.join("、")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.uncoveredVillages.slice(0, 8).map((village) => (
              <Button key={village} type="button" variant="outline" size="sm" onClick={() => startCreate(village)}>
                指派 {village}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {editing ? (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="font-semibold">{draft.assignmentRowId ? "編輯分配" : "新增分配"}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">里別 *</span>
              <select
                className="h-11 rounded-md border px-3"
                value={draft.villageName}
                onChange={(event) => setDraft((current) => ({ ...current, villageName: event.target.value }))}
              >
                <option value="">請選擇</option>
                {(data?.villages ?? []).map((village) => (
                  <option key={village} value={village}>
                    {village}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">類型 *</span>
              <select
                className="h-11 rounded-md border px-3"
                value={draft.adminKind}
                onChange={(event) => onKindChange(event.target.value as VillageAdminRow["adminKind"])}
              >
                <option value="person">個人</option>
                <option value="org">組織</option>
                <option value="skip">不訪（skip）</option>
              </select>
            </label>

            {draft.adminKind === "person" ? (
              <>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="font-medium">對到訪查員（可選）</span>
                  <select
                    className="h-11 rounded-md border px-3"
                    value={draft.matchedVisitorId}
                    onChange={(event) => onVisitorPick(event.target.value)}
                  >
                    <option value="">稍後再建／先用手填姓名</option>
                    {(data?.visitors ?? []).map((visitor) => (
                      <option key={visitor.visitorId} value={visitor.visitorId}>
                        {visitor.name}
                        {visitor.email ? ` · ${visitor.email}` : ""}
                        {visitor.status ? `（${visitor.status}）` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">顯示姓名 *</span>
                  <input
                    className="h-11 rounded-md border px-3"
                    value={draft.adminDisplayName}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        adminDisplayName: event.target.value,
                        adminAccountKey: event.target.value,
                      }))
                    }
                  />
                </label>
              </>
            ) : (
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="font-medium">組織 *</span>
                <select
                  className="h-11 rounded-md border px-3"
                  value={draft.adminAccountKey}
                  onChange={(event) => onOrgSlugChange(event.target.value)}
                >
                  {VILLAGE_ORG_OPTIONS.map((org) => (
                    <option key={org.slug} value={org.slug}>
                      {org.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="font-medium">備註</span>
              <input
                className="h-11 rounded-md border px-3"
                value={draft.notes}
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                placeholder="例如：未指定·暫管"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void saveDraft()}>
              {busy ? "儲存中…" : "儲存"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setDraft(emptyDraft());
              }}
            >
              取消
            </Button>
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-[12rem] flex-1 gap-1 text-sm">
            <span className="font-medium">搜尋</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="h-11 w-full rounded-md border py-2 pl-9 pr-3"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="里／姓名／組織"
              />
            </div>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">類型</span>
            <select
              className="h-11 rounded-md border px-3"
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)}
            >
              <option value="all">全部</option>
              <option value="person">個人</option>
              <option value="org">組織</option>
              <option value="skip">不訪</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">狀態</span>
            <select
              className="h-11 rounded-md border px-3"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            >
              <option value="active">啟用</option>
              <option value="inactive">停用</option>
              <option value="all">全部</option>
            </select>
          </label>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">里</th>
                <th className="px-2 py-2 font-medium">管理員</th>
                <th className="px-2 py-2 font-medium">類型</th>
                <th className="px-2 py-2 font-medium">訪查員對照</th>
                <th className="px-2 py-2 font-medium">狀態</th>
                <th className="px-2 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const visitor = row.matchedVisitorId ? visitorById.get(row.matchedVisitorId) : null;
                return (
                  <tr key={row.assignmentRowId} className="border-b last:border-0">
                    <td className="px-2 py-3 align-top">
                      <div className="font-medium">{row.villageName}</div>
                      {row.notes ? <div className="mt-1 text-xs text-muted-foreground">{row.notes}</div> : null}
                    </td>
                    <td className="px-2 py-3 align-top">
                      <div>{row.adminDisplayName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{row.adminAccountKey}</div>
                    </td>
                    <td className="px-2 py-3 align-top">{VILLAGE_ADMIN_KIND_LABELS[row.adminKind]}</td>
                    <td className="px-2 py-3 align-top">
                      {visitor ? (
                        <span>
                          {visitor.name}
                          {visitor.status ? `（${visitor.status}）` : ""}
                        </span>
                      ) : row.adminKind === "person" ? (
                        <span className="text-amber-800">尚未對到（可後建）</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-3 align-top">{row.status === "active" ? "啟用" : "停用"}</td>
                    <td className="px-2 py-3 align-top">
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => startEdit(row)}>
                          編輯
                        </Button>
                        {row.status === "active" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => void setStatus(row, "inactive")}
                          >
                            停用
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => void setStatus(row, "active")}
                          >
                            啟用
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length ? (
                <tr>
                  <td colSpan={6} className="px-2 py-8 text-center text-muted-foreground">
                    沒有符合的分配列。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {message ? <p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
