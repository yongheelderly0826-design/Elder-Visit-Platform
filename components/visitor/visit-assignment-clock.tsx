"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

type VisitClockState = {
  checkedIn: boolean;
  completed: boolean;
  visitDate: string;
  visitStartTime: string;
  visitEndTime: string;
  open?: { attendanceId: string; checkinAt: string } | null;
  latest?: { attendanceId: string; checkinAt: string; checkoutAt: string } | null;
};

export function VisitAssignmentClock({
  assignmentId,
  visitorId,
  onTimesChange,
}: {
  assignmentId: string;
  visitorId?: string;
  onTimesChange?: (times: {
    visitDate: string;
    visitStartTime: string;
    visitEndTime: string;
  }) => void;
}) {
  const [state, setState] = useState<VisitClockState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [geoHint, setGeoHint] = useState<string>("");

  const applyTimes = useCallback(
    (payload: VisitClockState) => {
      setState(payload);
      onTimesChange?.({
        visitDate: payload.visitDate,
        visitStartTime: payload.visitStartTime,
        visitEndTime: payload.visitEndTime,
      });
    },
    [onTimesChange],
  );

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/visits/clock?assignmentId=${encodeURIComponent(assignmentId)}`,
    );
    const json = (await response.json()) as {
      data?: VisitClockState;
      error?: { message?: string };
    };
    if (!response.ok || !json.data) {
      setMessage(json.error?.message ?? "無法讀取訪查簽到狀態");
      return;
    }
    applyTimes(json.data);
    setMessage(null);
  }, [assignmentId, applyTimes]);

  useEffect(() => {
    void load();
  }, [load]);

  async function readGps(): Promise<{ lat?: string; lng?: string }> {
    if (!navigator.geolocation) {
      setGeoHint("此裝置不支援定位，仍可簽到退");
      return {};
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeoHint("已帶入目前定位");
          resolve({
            lat: String(pos.coords.latitude),
            lng: String(pos.coords.longitude),
          });
        },
        () => {
          setGeoHint("無法取得定位，仍可簽到退");
          resolve({});
        },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  }

  async function clock() {
    setBusy(true);
    setMessage(null);
    try {
      const gps = await readGps();
      const response = await fetch("/api/visits/clock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          visitorId: visitorId || undefined,
          ...gps,
        }),
      });
      const json = (await response.json()) as {
        data?: {
          action: string;
          visitDate: string;
          visitStartTime: string;
          visitEndTime: string;
          record?: { attendanceId: string; checkinAt: string; checkoutAt: string };
        };
        error?: { message?: string };
      };
      if (!response.ok || !json.data) {
        setMessage(json.error?.message ?? "簽到退失敗");
        return;
      }
      setMessage(json.data.action === "checkout" ? "到宅簽退成功" : "到宅簽到成功");
      await load();
    } catch {
      setMessage("網路異常，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  const label = state?.checkedIn ? "到宅簽退" : "到宅簽到";
  const done = Boolean(state?.completed && !state?.checkedIn);

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Clock3 className="h-4 w-4" />
            訪查簽到退（綁此派案）
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            與 12 組志工出勤分開：此處寫入派案到宅時間，並帶入關懷表訪查起迄。
          </p>
        </div>
        <Button type="button" onClick={() => void clock()} disabled={busy || done}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {done ? "本日已完成簽到退" : label}
        </Button>
      </div>

      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <p>
          日期：<span className="font-medium">{state?.visitDate || "—"}</span>
        </p>
        <p>
          簽到：<span className="font-medium">{state?.visitStartTime || "—"}</span>
        </p>
        <p>
          簽退：<span className="font-medium">{state?.visitEndTime || "—"}</span>
        </p>
      </div>

      <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" />
        {geoHint || "簽到退時會嘗試記錄 GPS"}
      </p>
      {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
    </section>
  );
}
