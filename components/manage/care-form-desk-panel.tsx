"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPen, Plus, Search, UserRound } from "lucide-react";
import { PageIntro } from "@/components/ui/page-intro";
import { Button } from "@/components/ui/button";
import type { DeskCaseOption, DeskVisitorOption } from "@/lib/domain/manager-care-form-desk";

type OptionsPayload = {
  cases: DeskCaseOption[];
  visitors: DeskVisitorOption[];
};

export function CareFormDeskPanel({
  presetCaseId,
}: {
  presetCaseId?: string;
}) {
  const router = useRouter();
  const [options, setOptions] = useState<OptionsPayload | null>(null);
  const [query, setQuery] = useState("");
  const [caseId, setCaseId] = useState(presetCaseId ?? "");
  const [visitorId, setVisitorId] = useState("");
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [visitStartTime, setVisitStartTime] = useState("09:00");
  const [visitEndTime, setVisitEndTime] = useState("10:00");
  const [creating, setCreating] = useState(false);
  const [newCase, setNewCase] = useState({
    name: "",
    idNumber: "",
    gender: "女",
    birthDate: "",
    village: "",
    address: "",
    phone: "",
    mobile: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/manager/care-forms/options");
      const json = (await response.json()) as { data?: OptionsPayload; error?: { message?: string } };
      if (!response.ok) {
        setMessage(json.error?.message ?? "無法載入個案與訪員");
        return;
      }
      setOptions(json.data ?? { cases: [], visitors: [] });
    })();
  }, []);

  const filteredCases = useMemo(() => {
    const rows = options?.cases ?? [];
    const needle = query.trim();
    if (!needle) return rows.slice(0, 40);
    return rows
      .filter((item) =>
        [item.name, item.caseCode, item.village, item.address].some((value) =>
          value.includes(needle),
        ),
      )
      .slice(0, 40);
  }, [options?.cases, query]);

  const selectedCase = options?.cases.find((item) => item.id === caseId);

  async function startDesk() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/manager/care-forms/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          caseId: creating ? undefined : caseId || undefined,
          newCase: creating ? newCase : undefined,
          visitorId,
          visitDate,
          visitStartTime,
          visitEndTime,
        }),
      });
      const json = (await response.json()) as {
        data?: { assignmentId?: string };
        error?: { message?: string };
      };
      if (!response.ok || !json.data?.assignmentId) {
        setMessage(json.error?.message ?? "無法開始代填");
        return;
      }
      const params = new URLSearchParams();
      if (visitStartTime) params.set("start", visitStartTime);
      if (visitEndTime) params.set("end", visitEndTime);
      if (visitDate) params.set("date", visitDate);
      router.push(`/manager/care-forms/${json.data.assignmentId}?${params.toString()}`);
    } catch {
      setMessage("目前無法連線，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <PageIntro
        icon={ClipboardPen}
        eyebrow="承辦後台"
        title="關懷表建檔"
        description="紙本訪視可由承辦代填。沒有個案可自己建檔，再指定訪員；送出後掛到該訪員紀錄，通過稽核才能匯出。"
      />

      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">1. 選擇或新增個案</h2>
          <Button type="button" variant="outline" onClick={() => setCreating((current) => !current)}>
            <Plus className="h-4 w-4" />
            {creating ? "改選現有個案" : "沒有這筆？自己新增"}
          </Button>
        </div>

        {creating ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="姓名 *">
              <input
                className="h-11 w-full rounded-md border px-3 text-sm"
                value={newCase.name}
                onChange={(event) => setNewCase((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <Field label="身分證">
              <input
                className="h-11 w-full rounded-md border px-3 text-sm"
                value={newCase.idNumber}
                onChange={(event) => setNewCase((current) => ({ ...current, idNumber: event.target.value }))}
              />
            </Field>
            <Field label="性別">
              <select
                className="h-11 w-full rounded-md border px-3 text-sm"
                value={newCase.gender}
                onChange={(event) => setNewCase((current) => ({ ...current, gender: event.target.value }))}
              >
                <option>女</option>
                <option>男</option>
                <option>其他</option>
              </select>
            </Field>
            <Field label="出生年月日（民國 yyy/MM/dd 或西元）">
              <input
                className="h-11 w-full rounded-md border px-3 text-sm"
                value={newCase.birthDate}
                onChange={(event) => setNewCase((current) => ({ ...current, birthDate: event.target.value }))}
              />
            </Field>
            <Field label="村里">
              <input
                className="h-11 w-full rounded-md border px-3 text-sm"
                value={newCase.village}
                onChange={(event) => setNewCase((current) => ({ ...current, village: event.target.value }))}
              />
            </Field>
            <Field label="地址">
              <input
                className="h-11 w-full rounded-md border px-3 text-sm"
                value={newCase.address}
                onChange={(event) => setNewCase((current) => ({ ...current, address: event.target.value }))}
              />
            </Field>
            <Field label="電話（無電話 0000000000）">
              <input
                className="h-11 w-full rounded-md border px-3 text-sm"
                value={newCase.phone}
                onChange={(event) => setNewCase((current) => ({ ...current, phone: event.target.value }))}
              />
            </Field>
            <Field label="手機（不願提供 9999999999）">
              <input
                className="h-11 w-full rounded-md border px-3 text-sm"
                value={newCase.mobile}
                onChange={(event) => setNewCase((current) => ({ ...current, mobile: event.target.value }))}
              />
            </Field>
          </div>
        ) : (
          <>
            <label className="mt-4 flex h-11 items-center gap-2 rounded-md border bg-background px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="搜尋姓名、編碼、里別"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="mt-3 grid max-h-80 gap-2 overflow-auto">
              {filteredCases.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`rounded-md border p-3 text-left ${
                    caseId === item.id ? "border-primary bg-primary/5" : "bg-background"
                  }`}
                  onClick={() => setCaseId(item.id)}
                >
                  <p className="font-semibold">{item.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.caseCode} · {item.village} · {item.visitStatus}
                  </p>
                </button>
              ))}
              {filteredCases.length === 0 ? (
                <p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">
                  找不到個案。可改按「自己新增」。
                </p>
              ) : null}
            </div>
            {selectedCase ? (
              <p className="mt-3 text-sm text-muted-foreground">
                已選：{selectedCase.name}（{selectedCase.caseCode}）
              </p>
            ) : null}
          </>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="font-semibold">2. 指定訪員與訪視時間</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="指定訪員 *">
            <select
              className="h-11 w-full rounded-md border px-3 text-sm"
              value={visitorId}
              onChange={(event) => setVisitorId(event.target.value)}
            >
              <option value="">請選擇訪員</option>
              {(options?.visitors ?? []).map((visitor) => (
                <option key={visitor.id} value={visitor.id}>
                  {visitor.name}
                  {visitor.badgeNo ? ` · ${visitor.badgeNo}` : ""}
                  {visitor.status ? `（${visitor.status}）` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="訪視日期 *">
            <input
              type="date"
              className="h-11 w-full rounded-md border px-3 text-sm"
              value={visitDate}
              onChange={(event) => setVisitDate(event.target.value)}
            />
          </Field>
          <Field label="開始時間">
            <input
              type="time"
              className="h-11 w-full rounded-md border px-3 text-sm"
              value={visitStartTime}
              onChange={(event) => setVisitStartTime(event.target.value)}
            />
          </Field>
          <Field label="結束時間">
            <input
              type="time"
              className="h-11 w-full rounded-md border px-3 text-sm"
              value={visitEndTime}
              onChange={(event) => setVisitEndTime(event.target.value)}
            />
          </Field>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          來源固定為「公所代填・紙本」。送出後訪員只能看、不能改。
        </p>
        <Button
          className="mt-4 h-11"
          disabled={busy || !visitorId || (!creating && !caseId) || (creating && !newCase.name.trim())}
          onClick={() => void startDesk()}
        >
          <UserRound className="h-4 w-4" />
          {busy ? "準備中…" : "下一步：填關懷表"}
        </Button>
        {message ? <p className="mt-3 rounded-md bg-secondary p-3 text-sm text-muted-foreground">{message}</p> : null}
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
