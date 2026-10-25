"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPen, Plus, Search, UserRound } from "lucide-react";
import { PageIntro } from "@/components/ui/page-intro";
import { Button } from "@/components/ui/button";
import type { DeskCaseOption, DeskVisitorOption } from "@/lib/domain/manager-care-form-desk";
import type { DeskIdentityOption, DeskScope } from "@/lib/domain/village-admins";

type OptionsPayload = {
  cases: DeskCaseOption[];
  visitors: DeskVisitorOption[];
  scope?: DeskScope;
  allowedVillages?: string[] | null;
  identityOptions?: DeskIdentityOption[];
};

export function CareFormDeskPanel({
  presetCaseId,
  entry = "manager",
}: {
  presetCaseId?: string;
  entry?: "manager" | "desk";
}) {
  const router = useRouter();
  const [options, setOptions] = useState<OptionsPayload | null>(null);
  const [identityKey, setIdentityKey] = useState("");
  const [villageFilter, setVillageFilter] = useState("");
  const [query, setQuery] = useState("");
  const [visitorQuery, setVisitorQuery] = useState("");
  const [caseId, setCaseId] = useState(presetCaseId ?? "");
  const [visitorId, setVisitorId] = useState("");
  const [creatingVisitor, setCreatingVisitor] = useState(false);
  const [newVisitor, setNewVisitor] = useState({ name: "", phone: "", email: "", idNumber: "" });
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
  const [casesLoading, setCasesLoading] = useState(false);
  const [villageCases, setVillageCases] = useState<DeskCaseOption[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);
  const [visitorsLoading, setVisitorsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setMetaLoading(true);
      try {
        // 1) 身份／里別：只打里責任表，盡快可選
        const response = await fetch("/api/manager/care-forms/options?part=identities");
        const json = (await response.json()) as {
          data?: OptionsPayload;
          error?: { message?: string };
        };
        if (cancelled) return;
        if (!response.ok) {
          setMessage(json.error?.message ?? "無法載入身份");
          return;
        }
        const payload = json.data ?? { cases: [], visitors: [] };
        setOptions(payload);
        setMetaLoading(false);

        const identities = payload.identityOptions ?? [];
        if (identities.length === 1) {
          setIdentityKey(identities[0].key);
          if (identities[0].villages.length === 1) {
            setVillageFilter(identities[0].villages[0]);
            setNewCase((current) => ({ ...current, village: identities[0].villages[0] }));
          }
        } else if (payload.scope?.mode === "all") {
          setIdentityKey("all");
        }

        // 2) 訪查員背景載入（不擋身份下拉）
        setVisitorsLoading(true);
        void fetch("/api/manager/care-forms/options?part=visitors")
          .then(async (visitorRes) => {
            const visitorJson = (await visitorRes.json()) as {
              data?: { visitors?: DeskVisitorOption[] };
            };
            if (cancelled || !visitorRes.ok) return;
            setOptions((current) =>
              current
                ? { ...current, visitors: visitorJson.data?.visitors ?? [] }
                : {
                    cases: [],
                    visitors: visitorJson.data?.visitors ?? [],
                  },
            );
          })
          .catch(() => {
            /* 訪查員稍後再試即可 */
          })
          .finally(() => {
            if (!cancelled) setVisitorsLoading(false);
          });

        if (presetCaseId) {
          const presetRes = await fetch(
            `/api/manager/care-forms/options?caseId=${encodeURIComponent(presetCaseId)}`,
          );
          const presetJson = (await presetRes.json()) as {
            data?: { village?: string; cases?: DeskCaseOption[] };
          };
          if (cancelled) return;
          const village = String(presetJson.data?.village ?? "");
          const cases = presetJson.data?.cases ?? [];
          if (village) {
            setVillageFilter(village);
            setVillageCases(cases);
            setCaseId(presetCaseId);
            setNewCase((current) => ({ ...current, village }));
            const match = identities.find(
              (item) => item.key !== "all" && item.villages.includes(village),
            );
            if (match) setIdentityKey(match.key);
            else if (payload.scope?.mode === "all") setIdentityKey("all");
          }
        }
      } catch {
        if (!cancelled) setMessage("目前無法連線，請稍後再試。");
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [presetCaseId]);

  useEffect(() => {
    if (!villageFilter) {
      setVillageCases([]);
      setCasesLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setCasesLoading(true);
      try {
        const response = await fetch(
          `/api/manager/care-forms/options?village=${encodeURIComponent(villageFilter)}`,
        );
        const json = (await response.json()) as {
          data?: { cases?: DeskCaseOption[] };
          error?: { message?: string };
        };
        if (cancelled) return;
        if (!response.ok) {
          setMessage(json.error?.message ?? "無法載入該里個案");
          setVillageCases([]);
          return;
        }
        setVillageCases(json.data?.cases ?? []);
      } catch {
        if (!cancelled) {
          setMessage("目前無法連線，請稍後再試。");
          setVillageCases([]);
        }
      } finally {
        if (!cancelled) setCasesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [villageFilter]);

  const identityOptions = options?.identityOptions ?? [];
  const selectedIdentity = identityOptions.find((item) => item.key === identityKey) ?? null;
  const villageOptions = selectedIdentity?.villages ?? [];

  const filteredCases = useMemo(() => {
    if (!villageFilter) return [];
    const rows = villageCases.filter((item) => item.village === villageFilter);
    const needle = query.trim();
    if (!needle) return rows.slice(0, 60);
    return rows
      .filter((item) =>
        [item.name, item.caseCode, item.village, item.address].some((value) => value.includes(needle)),
      )
      .slice(0, 60);
  }, [villageCases, query, villageFilter]);

  const filteredVisitors = useMemo(() => {
    const rows = options?.visitors ?? [];
    const needle = visitorQuery.trim();
    if (!needle) return rows.slice(0, 30);
    return rows
      .filter((item) => [item.name, item.badgeNo, item.status].some((value) => value.includes(needle)))
      .slice(0, 30);
  }, [options?.visitors, visitorQuery]);

  const selectedCase = villageCases.find((item) => item.id === caseId);
  const selectedVisitor = options?.visitors.find((item) => item.id === visitorId);
  const scope = options?.scope;
  const scopeBlocked = Boolean(options) && scope?.mode === "none";
  const canBrowseCases = Boolean(identityKey && villageFilter);

  function onIdentityChange(nextKey: string) {
    setIdentityKey(nextKey);
    setVillageFilter("");
    setCaseId("");
    setQuery("");
    const next = identityOptions.find((item) => item.key === nextKey);
    if (next?.villages.length === 1) {
      setVillageFilter(next.villages[0]);
      setNewCase((current) => ({ ...current, village: next.villages[0] }));
    } else {
      setNewCase((current) => ({ ...current, village: "" }));
    }
  }

  function onVillageChange(nextVillage: string) {
    setVillageFilter(nextVillage);
    setCaseId("");
    setQuery("");
    setNewCase((current) => ({ ...current, village: nextVillage }));
  }

  async function createVisitor() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/manager/care-forms/visitors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(newVisitor),
      });
      const json = (await response.json()) as {
        data?: DeskVisitorOption;
        error?: { message?: string };
      };
      if (!response.ok || !json.data?.id) {
        setMessage(json.error?.message ?? "無法新增訪查員");
        return;
      }
      setOptions((current) =>
        current
          ? { ...current, visitors: [json.data!, ...current.visitors] }
          : { cases: [], visitors: [json.data!] },
      );
      setVisitorId(json.data.id);
      setCreatingVisitor(false);
      setVisitorQuery(json.data.name);
      setMessage(`已新增訪查員「${json.data.name}」，可繼續填關懷表。`);
    } catch {
      setMessage("目前無法連線，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

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
        eyebrow={entry === "desk" ? "里責填表入口" : "承辦後台"}
        title="關懷表建檔"
        description="一張紙本＝一次訪視。先選身份與里別，再找個案與訪查員 KEY；未遇請陸續 KEY 滿三張才算完整。送出後掛到該訪查員紀錄，通過稽核才能匯出。"
      />

      {scopeBlocked && identityOptions.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          尚未對到負責里。請確認訪查員名冊姓名／Email，或請總承辦到「里責任分配」設定。
        </div>
      ) : null}
      {scopeBlocked && identityOptions.length > 0 ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          目前登入未對到個人負責里；已改以承辦視角列出里責任身份，可直接代 KEY。
        </div>
      ) : null}

      <section className="rounded-lg border bg-card p-4">
        <h2 className="font-semibold">1. 選擇身份與里別</h2>
        <p className="mt-1 text-sm text-muted-foreground">先點身份，再選該身份負責的里，個案清單會變短比較好找。</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="身份 *">
            <select
              className="h-11 w-full rounded-md border px-3 text-sm"
              value={identityKey}
              disabled={scopeBlocked || metaLoading || identityOptions.length === 0}
              onChange={(event) => onIdentityChange(event.target.value)}
            >
              <option value="">
                {metaLoading
                  ? "載入中…"
                  : identityOptions.length
                    ? "請選擇身份"
                    : scopeBlocked
                      ? "登入身分尚未對到負責里"
                      : "尚無可選身份（請重新整理）"}
              </option>
              {identityOptions.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                  {item.kind === "org" ? "（組織）" : ""}
                  {item.kind === "person" ? "（個人）" : ""}
                  {` · ${item.villages.length} 里`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="里別 *">
            <select
              className="h-11 w-full rounded-md border px-3 text-sm"
              value={villageFilter}
              disabled={!selectedIdentity}
              onChange={(event) => onVillageChange(event.target.value)}
            >
              <option value="">{selectedIdentity ? "請選擇里別" : "先選身份"}</option>
              {villageOptions.map((village) => (
                <option key={village} value={village}>
                  {village}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {selectedIdentity && villageFilter ? (
          <p className="mt-3 text-sm text-muted-foreground">
            目前：{selectedIdentity.label} · {villageFilter}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">2. 選擇或新增個案</h2>
          <Button
            type="button"
            variant="outline"
            disabled={!canBrowseCases}
            onClick={() => setCreating((current) => !current)}
          >
            <Plus className="h-4 w-4" />
            {creating ? "改選現有個案" : "沒有這筆？自己新增"}
          </Button>
        </div>

        {!canBrowseCases ? (
          <p className="mt-4 rounded-md bg-secondary p-3 text-sm text-muted-foreground">
            請先完成上方「身份」與「里別」。
          </p>
        ) : creating ? (
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
                className="h-11 w-full rounded-md border bg-muted px-3 text-sm"
                value={newCase.village || villageFilter}
                readOnly
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
                placeholder={`${villageFilter}：搜尋姓名、編碼`}
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
              {casesLoading ? (
                <p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">
                  正在載入 {villageFilter} 個案…
                </p>
              ) : filteredCases.length === 0 ? (
                <p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">
                  {villageFilter} 找不到個案。可改按「自己新增」，或確認個案已匯入。
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">3. 勾選實際填表訪查員與訪視時間</h2>
          <Button
            type="button"
            variant="outline"
            onClick={() => setCreatingVisitor((current) => !current)}
          >
            <Plus className="h-4 w-4" />
            {creatingVisitor ? "改搜現有訪查員" : "新增訪查員"}
          </Button>
        </div>

        {creatingVisitor ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="訪查員姓名 *">
              <input
                className="h-11 w-full rounded-md border px-3 text-sm"
                value={newVisitor.name}
                onChange={(event) => setNewVisitor((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <Field label="手機 *">
              <input
                className="h-11 w-full rounded-md border px-3 text-sm"
                value={newVisitor.phone}
                onChange={(event) => setNewVisitor((current) => ({ ...current, phone: event.target.value }))}
              />
            </Field>
            <Field label="Email（可後補）">
              <input
                className="h-11 w-full rounded-md border px-3 text-sm"
                value={newVisitor.email}
                onChange={(event) => setNewVisitor((current) => ({ ...current, email: event.target.value }))}
              />
            </Field>
            <Field label="身分證（可後補）">
              <input
                className="h-11 w-full rounded-md border px-3 text-sm"
                value={newVisitor.idNumber}
                onChange={(event) =>
                  setNewVisitor((current) => ({ ...current, idNumber: event.target.value }))
                }
              />
            </Field>
            <div className="sm:col-span-2">
              <Button
                type="button"
                disabled={busy || !newVisitor.name.trim() || !newVisitor.phone.trim()}
                onClick={() => void createVisitor()}
              >
                {busy ? "新增中…" : "建立訪查員並選用"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <label className="mt-4 flex h-11 items-center gap-2 rounded-md border bg-background px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="搜尋訪查員姓名或編碼"
                value={visitorQuery}
                onChange={(event) => setVisitorQuery(event.target.value)}
              />
            </label>
            <div className="mt-3 grid max-h-56 gap-2 overflow-auto">
              {filteredVisitors.map((visitor) => (
                <button
                  key={visitor.id}
                  type="button"
                  className={`rounded-md border p-3 text-left ${
                    visitorId === visitor.id ? "border-primary bg-primary/5" : "bg-background"
                  }`}
                  onClick={() => setVisitorId(visitor.id)}
                >
                  <p className="font-semibold">{visitor.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {visitor.badgeNo || visitor.id}
                    {visitor.status ? ` · ${visitor.status}` : ""}
                  </p>
                </button>
              ))}
              {visitorsLoading ? (
                <p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">
                  訪查員清單載入中…
                </p>
              ) : filteredVisitors.length === 0 ? (
                <p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">
                  找不到訪查員。可按「新增訪查員」建立後再填。
                </p>
              ) : null}
            </div>
            {selectedVisitor ? (
              <p className="mt-3 text-sm text-muted-foreground">已選訪查員：{selectedVisitor.name}</p>
            ) : null}
          </>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
          來源固定為「公所代填・紙本」。每按一次「下一步」＝新開一筆訪視（可換訪查員）。送出後訪查員端只能看、不能改。
        </p>
        <Button
          className="mt-4 h-11"
          disabled={
            busy ||
            scopeBlocked ||
            !canBrowseCases ||
            !visitorId ||
            (!creating && !caseId) ||
            (creating && !newCase.name.trim())
          }
          onClick={() => void startDesk()}
        >
          <UserRound className="h-4 w-4" />
          {busy ? "準備中…" : "下一步：填關懷表"}
        </Button>
        {message ? (
          <p className="mt-3 rounded-md bg-secondary p-3 text-sm text-muted-foreground">{message}</p>
        ) : null}
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
