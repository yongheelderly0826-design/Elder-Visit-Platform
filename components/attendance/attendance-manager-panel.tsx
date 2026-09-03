"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Printer, QrCode, RefreshCw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageIntro } from "@/components/ui/page-intro";
import {
  currentAttendancePeriod,
  taipeiTime,
  VOLUNTEER_GROUPS,
  type AttendanceRecord,
  type VolunteerWorker,
} from "@/lib/domain/volunteer-attendance";

type SiteItem = {
  id: string;
  name: string;
  groupId: string;
  kind: "field" | "office";
  clockUrl: string;
  qrUrl: string;
};

type ListResponse = {
  data?: { mode?: string; period?: string; items?: AttendanceRecord[] };
  error?: { message?: string };
};

type VolunteerResponse = {
  data?: { items?: VolunteerWorker[] };
  error?: { message?: string };
};

export function AttendanceManagerPanel() {
  const [period, setPeriod] = useState(currentAttendancePeriod());
  const [items, setItems] = useState<AttendanceRecord[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerWorker[]>([]);
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [mode, setMode] = useState("demo");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", idNumber: "", phone: "", groupId: "meal" });

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [listRes, volunteerRes, siteRes] = await Promise.all([
        fetch(`/api/attendance/list?period=${encodeURIComponent(period)}`),
        fetch("/api/attendance/volunteers"),
        fetch("/api/attendance/sites"),
      ]);
      const listJson = (await listRes.json()) as ListResponse;
      const volunteerJson = (await volunteerRes.json()) as VolunteerResponse;
      const siteJson = (await siteRes.json()) as { data?: { sites?: SiteItem[] } };
      if (!listRes.ok) {
        setMessage(listJson.error?.message ?? "讀取出勤失敗");
        setItems([]);
      } else {
        setItems(listJson.data?.items ?? []);
        setMode(listJson.data?.mode ?? "demo");
      }
      setVolunteers(volunteerJson.data?.items ?? []);
      setSites(siteJson.data?.sites ?? []);
    } catch {
      setMessage("讀取出勤資料失敗");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCount = useMemo(
    () => items.filter((row) => row.checkinAt && !row.checkoutAt).length,
    [items],
  );

  async function createVolunteer(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const response = await fetch("/api/attendance/volunteers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setMessage(json.error?.message ?? "新增志工失敗");
      return;
    }
    setForm({ name: "", idNumber: "", phone: "", groupId: form.groupId });
    await load();
  }

  return (
    <div className="grid gap-4">
      <PageIntro
        icon={QrCode}
        eyebrow="12 組志工出勤"
        title="掃 QR / 刷證簽到，月底匯出 Excel"
        description="外勤組用手機登入後掃集合點 QR；公所內勤用電腦刷身分證條碼。每月可下載出勤表，再匯入既有系統。"
        aside={
          <div className="grid gap-2 text-sm">
            <Link href="/office/kiosk" className="rounded-md border bg-background px-3 py-2">
              開啟刷證櫃台
            </Link>
            <Link href="/volunteer/clock" className="rounded-md border bg-background px-3 py-2">
              開啟外勤簽到頁
            </Link>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="本月筆數" value={String(items.length)} />
        <Stat label="尚未簽退" value={String(openCount)} />
        <Stat label="資料來源" value={mode === "gas" ? "Google 試算表" : "示範資料"} />
      </section>

      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="grid gap-1 text-sm">
            結算月份
            <input
              type="month"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="h-10 rounded-md border bg-background px-3"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              重新整理
            </Button>
            <a href={`/api/attendance/export?period=${encodeURIComponent(period)}`}>
              <Button type="button">
                <Download className="h-4 w-4" />
                下載 Excel
              </Button>
            </a>
          </div>
        </div>
        {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-3 font-medium">日期</th>
                <th className="py-2 pr-3 font-medium">組別</th>
                <th className="py-2 pr-3 font-medium">姓名</th>
                <th className="py-2 pr-3 font-medium">簽到</th>
                <th className="py-2 pr-3 font-medium">簽退</th>
                <th className="py-2 pr-3 font-medium">時數</th>
                <th className="py-2 pr-3 font-medium">方式</th>
                <th className="py-2 font-medium">地點</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td className="py-6 text-muted-foreground" colSpan={8}>
                    這個月還沒有出勤紀錄。
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.attendanceId} className="border-b">
                    <td className="py-2 pr-3">{row.sessionDate}</td>
                    <td className="py-2 pr-3">{row.groupName}</td>
                    <td className="py-2 pr-3">{row.workerName}</td>
                    <td className="py-2 pr-3">{taipeiTime(row.checkinAt)}</td>
                    <td className="py-2 pr-3">{row.checkoutAt ? taipeiTime(row.checkoutAt) : "—"}</td>
                    <td className="py-2 pr-3">{row.hours || "—"}</td>
                    <td className="py-2 pr-3">{row.channelLabel}</td>
                    <td className="py-2">{row.siteName}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-base font-semibold">志工名冊（身分 + 組別）</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          外勤登入會對到這份名冊。12 組名稱可之後依公所正式編組再改。
        </p>
        <form className="mt-4 grid gap-2 sm:grid-cols-5" onSubmit={(event) => void createVolunteer(event)}>
          <input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            className="h-10 rounded-md border bg-background px-3 text-sm"
            placeholder="姓名"
            required
          />
          <input
            value={form.idNumber}
            onChange={(event) =>
              setForm((current) => ({ ...current, idNumber: event.target.value.toUpperCase() }))
            }
            className="h-10 rounded-md border bg-background px-3 font-mono text-sm"
            placeholder="身分證"
            required
          />
          <input
            value={form.phone}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
            className="h-10 rounded-md border bg-background px-3 text-sm"
            placeholder="電話"
            required
          />
          <select
            value={form.groupId}
            onChange={(event) => setForm((current) => ({ ...current, groupId: event.target.value }))}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            {VOLUNTEER_GROUPS.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <Button type="submit">
            <UserPlus className="h-4 w-4" />
            新增
          </Button>
        </form>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {volunteers.slice(0, 12).map((volunteer) => (
            <div key={volunteer.visitorId} className="rounded-md border bg-background px-3 py-2 text-sm">
              <p className="font-medium">{volunteer.name}</p>
              <p className="text-muted-foreground">{volunteer.groupName || "未分組"}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 print:border-0 print:p-0">
        <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
          <div>
            <h2 className="text-base font-semibold">集合點 QR 海報</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              列印後貼在各組集合處。志工用手機相機掃描即可打開簽到頁。
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            列印海報
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sites.map((site) => (
            <article key={site.id} className="break-inside-avoid rounded-lg border bg-background p-4 text-center">
              <p className="text-sm text-muted-foreground">{site.kind === "office" ? "公所" : "外勤"}</p>
              <h3 className="mt-1 text-lg font-semibold">{site.name}</h3>
              <img src={site.qrUrl} alt={`${site.name} QR`} className="mx-auto mt-3 h-40 w-40" />
              <p className="mt-2 font-mono text-xs">{site.id}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
