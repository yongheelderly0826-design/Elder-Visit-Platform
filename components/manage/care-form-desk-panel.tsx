"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPen, Plus, Search, UserRound } from "lucide-react";
import { PageIntro } from "@/components/ui/page-intro";
import { Button } from "@/components/ui/button";
import {
  DESK_BATCH_SLOT_MINUTES,
  DESK_BATCH_TRAVEL_GAP_MINUTES,
  addMinutesToTime,
  buildDeskCareFormPath,
  buildStaggeredVisitWindows,
  DESK_BATCH_STATUS_RETRY_MS,
  clearDeskBatchState,
  deskStaleAssignmentClearedMessage,
  findNextReadyDeskBatchItem,
  isAssignmentNotFoundError,
  isDeskBatchFresh,
  readDeskBatchState,
  writeDeskBatchState,
  type DeskBatchQueueItem,
  type DeskBatchState,
  type DeskVisitWindow,
} from "@/lib/domain/desk-care-batch";
import {
  compareDeskCasesByVillageSeq,
  formatDeskCasePaperLabel,
  type DeskCaseOption,
  type DeskVisitorOption,
} from "@/lib/domain/manager-care-form-desk";
import {
  formatYongheVillageSelectLabel,
  sortYongheVillagesByCode,
  type DeskIdentityOption,
  type DeskScope,
} from "@/lib/domain/village-admins";
import type { VisitorRegistrationWorkerGroup } from "@/lib/domain/types";

type OptionsPayload = {
  cases: DeskCaseOption[];
  visitors: DeskVisitorOption[];
  scope?: DeskScope;
  allowedVillages?: string[] | null;
  identityOptions?: DeskIdentityOption[];
  /** 里名 → 六碼里編碼（Excel「里別 編碼」＋里責任分配合併） */
  villageCodeByName?: Record<string, string>;
};

type TimeDraft = {
  assignmentId: string;
  caseId: string;
  caseName: string;
  caseCode: string;
  village?: string;
  villageSeq?: number | null;
  villageCode?: string;
  visitDate: string;
  visitStartTime: string;
  visitEndTime: string;
};

export function CareFormDeskPanel({
  presetCaseId,
  entry = "manager",
}: {
  presetCaseId?: string;
  entry?: "manager" | "desk";
}) {
  const router = useRouter();
  const returnPath = entry === "desk" ? "/desk/care-forms" : "/manager/care-forms";
  const [options, setOptions] = useState<OptionsPayload | null>(null);
  const [identityKey, setIdentityKey] = useState("");
  const [villageFilter, setVillageFilter] = useState("");
  const [query, setQuery] = useState("");
  const [civilQuery, setCivilQuery] = useState("");
  const [socialQuery, setSocialQuery] = useState("");
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>(
    presetCaseId ? [presetCaseId] : [],
  );
  const [civilVisitorIds, setCivilVisitorIds] = useState<string[]>([]);
  const [socialVisitorIds, setSocialVisitorIds] = useState<string[]>([]);
  const [primaryVisitorId, setPrimaryVisitorId] = useState("");
  const [creatingVisitor, setCreatingVisitor] = useState(false);
  const [newVisitor, setNewVisitor] = useState({
    name: "",
    phone: "",
    email: "",
    idNumber: "",
    workerGroup: "civil_affairs" as VisitorRegistrationWorkerGroup,
  });
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
  const [batch, setBatch] = useState<DeskBatchState | null>(null);
  const [timeDraft, setTimeDraft] = useState<TimeDraft | null>(null);
  const [conflictAlert, setConflictAlert] = useState<string | null>(null);
  /** After auto-clear of dead ASGs: show CTA to re-prepare */
  const [showPrepareAgainCta, setShowPrepareAgainCta] = useState(false);
  const [batchTimeDraft, setBatchTimeDraft] = useState({
    visitDate: "",
    visitStartTime: "09:00",
    visitEndTime: addMinutesToTime("09:00", DESK_BATCH_SLOT_MINUTES) || "09:10",
  });

  async function checkAssignmentsExist(
    assignmentIds: string[],
  ): Promise<{ exists: boolean; missing: string[] } | null> {
    const ids = [...new Set(assignmentIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
    if (!ids.length) return null;
    try {
      const response = await fetch(
        `/api/manager/care-forms/assignment-status?assignmentIds=${encodeURIComponent(ids.join(","))}`,
      );
      const json = (await response.json()) as {
        data?: { exists?: boolean; missing?: string[]; uncertain?: boolean };
      };
      if (!response.ok) return null;
      if (json.data?.uncertain) return null;
      return {
        exists: Boolean(json.data?.exists),
        missing: Array.isArray(json.data?.missing) ? json.data!.missing! : [],
      };
    } catch {
      return null;
    }
  }

  /** Fresh queues get one extra client-side wait before we trust a missing result. */
  async function checkAssignmentsExistForBatch(
    state: DeskBatchState,
  ): Promise<{ exists: boolean; missing: string[] } | null> {
    const ids = state.items.map((item) => item.assignmentId);
    const first = await checkAssignmentsExist(ids);
    if (!first || first.exists || !isDeskBatchFresh(state)) return first;
    await new Promise((resolve) => setTimeout(resolve, DESK_BATCH_STATUS_RETRY_MS));
    return checkAssignmentsExist(ids);
  }

  async function assignmentStillExists(
    assignmentId: string,
    batchState?: DeskBatchState | null,
  ): Promise<boolean | null> {
    const result = batchState
      ? await checkAssignmentsExistForBatch({
          ...batchState,
          items: batchState.items.filter((item) => item.assignmentId === assignmentId),
        })
      : await checkAssignmentsExist([assignmentId]);
    if (!result) return null;
    return result.exists;
  }

  function showTimeConflict(message: string) {
    setConflictAlert(message);
    setMessage(message);
  }

  function isTimeConflictError(error?: { code?: string; message?: string }) {
    if (!error) return false;
    if (error.code === "TIME_CONFLICT") return true;
    return String(error.message ?? "").includes("衝突");
  }

  useEffect(() => {
    const saved = readDeskBatchState();
    if (!saved?.items?.length) return;

    setBatch(saved);
    setIdentityKey(saved.identityKey);
    setVillageFilter(saved.village);
    setPrimaryVisitorId(saved.primaryVisitorId);
    // 還原勾選需等 visitors 載入後再分欄；先記主填
    setMessage(`已恢復待 KEY 清單（${saved.items.length} 案）。可整批套用時間後進表。`);
    const firstTimed = saved.items.find((item) => item.visitDate && item.visitStartTime);
    setBatchTimeDraft({
      visitDate: firstTimed?.visitDate || new Date().toISOString().slice(0, 10),
      visitStartTime: firstTimed?.visitStartTime || "09:00",
      visitEndTime:
        firstTimed?.visitEndTime ||
        addMinutesToTime("09:00", DESK_BATCH_SLOT_MINUTES) ||
        "09:10",
    });

    let cancelled = false;
    void (async () => {
      // 剛 prepare 的佇列：Sheets 讀取可能落後，先跳過 mount 清除，避免誤清品牌新 ASG。
      if (isDeskBatchFresh(saved)) return;
      const status = await checkAssignmentsExistForBatch(saved);
      if (cancelled || !status || status.exists) return;
      // ANY missing ASG → wipe stale queue so steps 1–3 unlock immediately
      // Re-read: user may have prepared a fresh queue while this probe was in flight.
      const latest = readDeskBatchState();
      if (!latest?.items?.length) return;
      if (isDeskBatchFresh(latest)) return;
      const latestIds = latest.items.map((item) => item.assignmentId).join(",");
      const probedIds = saved.items.map((item) => item.assignmentId).join(",");
      if (latestIds !== probedIds) return;
      clearDeskBatchState();
      setBatch(null);
      setTimeDraft(null);
      setShowPrepareAgainCta(true);
      setMessage(deskStaleAssignmentClearedMessage(status.missing[0]));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setMetaLoading(true);
      try {
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
        if (!readDeskBatchState()) {
          if (identities.length === 1) {
            setIdentityKey(identities[0].key);
            if (identities[0].villages.length === 1) {
              setVillageFilter(identities[0].villages[0]);
              setNewCase((current) => ({ ...current, village: identities[0].villages[0] }));
            }
          } else if (payload.scope?.mode === "all") {
            setIdentityKey("all");
          }
        }

        setVisitorsLoading(true);
        void fetch("/api/manager/care-forms/options?part=visitors")
          .then(async (visitorRes) => {
            const visitorJson = (await visitorRes.json()) as {
              data?: { visitors?: DeskVisitorOption[] };
            };
            if (cancelled || !visitorRes.ok) return;
            const visitors = visitorJson.data?.visitors ?? [];
            setOptions((current) =>
              current
                ? { ...current, visitors }
                : { cases: [], visitors },
            );
            const saved = readDeskBatchState();
            if (saved) {
              const civil: string[] = [];
              const social: string[] = [];
              const team = [saved.primaryVisitorId, ...saved.companionVisitorIds];
              for (const id of team) {
                const visitor = visitors.find((item) => item.id === id);
                if (!visitor) continue;
                if (visitor.workerGroup === "social_affairs") social.push(id);
                else civil.push(id);
              }
              setCivilVisitorIds(civil);
              setSocialVisitorIds(social);
              setPrimaryVisitorId(saved.primaryVisitorId);
            }
          })
          .catch(() => {
            /* 訪查員稍後再試即可 */
          })
          .finally(() => {
            if (!cancelled) setVisitorsLoading(false);
          });

        if (presetCaseId && !readDeskBatchState()) {
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
            setSelectedCaseIds([presetCaseId]);
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
  const villageOptions = useMemo(
    () =>
      sortYongheVillagesByCode(
        selectedIdentity?.villages ?? [],
        options?.villageCodeByName,
      ),
    [selectedIdentity?.villages, options?.villageCodeByName],
  );
  const allVisitors = options?.visitors ?? [];

  // 未分類只放民政欄，避免同一人出現兩欄造成點選混亂
  const civilVisitors = useMemo(
    () =>
      filterVisitors(
        allVisitors.filter(
          (item) => item.workerGroup === "civil_affairs" || item.workerGroup === "unknown",
        ),
        civilQuery,
      ),
    [allVisitors, civilQuery],
  );
  const socialVisitors = useMemo(
    () =>
      filterVisitors(
        allVisitors.filter((item) => item.workerGroup === "social_affairs"),
        socialQuery,
      ),
    [allVisitors, socialQuery],
  );

  const filteredCases = useMemo(() => {
    if (!villageFilter) return [];
    const rows = villageCases
      .filter((item) => item.village === villageFilter)
      .slice()
      .sort(compareDeskCasesByVillageSeq);
    const needle = query.trim();
    if (!needle) return rows.slice(0, 400);
    return rows
      .filter((item) =>
        [
          item.name,
          item.caseCode,
          item.village,
          item.address,
          item.villageSeq != null ? String(item.villageSeq) : "",
          item.externalId,
        ].some((value) => value.includes(needle)),
      )
      .slice(0, 400);
  }, [villageCases, query, villageFilter]);

  const selectedVisitorIds = useMemo(
    () => [...new Set([...civilVisitorIds, ...socialVisitorIds])],
    [civilVisitorIds, socialVisitorIds],
  );
  const companionVisitorIds = selectedVisitorIds.filter((id) => id !== primaryVisitorId);
  const visitorNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const visitor of allVisitors) map[visitor.id] = visitor.name;
    return map;
  }, [allVisitors]);

  const scope = options?.scope;
  const scopeBlocked = Boolean(options) && scope?.mode === "none";
  const canBrowseCases = Boolean(identityKey && villageFilter);
  const visitorStepOk =
    selectedVisitorIds.length > 0 &&
    Boolean(primaryVisitorId) &&
    selectedVisitorIds.includes(primaryVisitorId) &&
    (civilVisitorIds.length > 0 || socialVisitorIds.length > 0);

  function onIdentityChange(nextKey: string) {
    setIdentityKey(nextKey);
    setVillageFilter("");
    setSelectedCaseIds([]);
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
    setSelectedCaseIds([]);
    setQuery("");
    setNewCase((current) => ({ ...current, village: nextVillage }));
  }

  function toggleVisitor(group: "civil" | "social", visitorId: string) {
    const otherIds = group === "civil" ? socialVisitorIds : civilVisitorIds;
    if (group === "civil") {
      setCivilVisitorIds((current) => {
        const next = current.includes(visitorId)
          ? current.filter((id) => id !== visitorId)
          : [...current, visitorId];
        const stillSelected = next.includes(visitorId) || otherIds.includes(visitorId);
        if (!stillSelected) {
          setPrimaryVisitorId((primary) => (primary === visitorId ? "" : primary));
        }
        return next;
      });
      return;
    }
    setSocialVisitorIds((current) => {
      const next = current.includes(visitorId)
        ? current.filter((id) => id !== visitorId)
        : [...current, visitorId];
      const stillSelected = next.includes(visitorId) || otherIds.includes(visitorId);
      if (!stillSelected) {
        setPrimaryVisitorId((primary) => (primary === visitorId ? "" : primary));
      }
      return next;
    });
  }

  function toggleCase(caseId: string) {
    setSelectedCaseIds((current) =>
      current.includes(caseId) ? current.filter((id) => id !== caseId) : [...current, caseId],
    );
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
      const created = json.data;
      setOptions((current) =>
        current
          ? { ...current, visitors: [created, ...current.visitors] }
          : { cases: [], visitors: [created] },
      );
      if (created.workerGroup === "social_affairs") {
        setSocialVisitorIds((current) => [...new Set([...current, created.id])]);
      } else {
        setCivilVisitorIds((current) => [...new Set([...current, created.id])]);
      }
      if (!primaryVisitorId) setPrimaryVisitorId(created.id);
      setCreatingVisitor(false);
      setMessage(`已新增訪查員「${created.name}」，已勾入${created.workerGroup === "social_affairs" ? "社政" : "民政"}。`);
    } catch {
      setMessage("目前無法連線，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  async function prepareBatch() {
    if (!visitorStepOk) {
      setMessage("請先勾選民政或社政訪查員，並手動指定一位主填表人。");
      return;
    }
    if (!creating && selectedCaseIds.length === 0) {
      setMessage("請至少勾選一位個案。");
      return;
    }
    if (creating && !newCase.name.trim()) {
      setMessage("新增個案請填姓名。");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const selectedCases = villageCases.filter((item) => selectedCaseIds.includes(item.id));
      setMessage(
        creating
          ? "正在建立個案並準備派案…"
          : `正在準備 ${selectedCases.length || selectedCaseIds.length} 筆派案，請稍候…`,
      );
      const response = await fetch("/api/manager/care-forms/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cases: creating
            ? undefined
            : selectedCases.map((item) => ({
                caseId: item.id,
                caseName: item.name,
                caseCode: item.caseCode,
              })),
          caseIds: creating ? undefined : selectedCaseIds,
          newCase: creating ? newCase : undefined,
          visitorId: primaryVisitorId,
          visitorName: visitorNameById[primaryVisitorId] || "",
          companionVisitorIds,
          companionNames: Object.fromEntries(
            companionVisitorIds.map((id) => [id, visitorNameById[id] || ""]),
          ),
        }),
      });
      const json = (await response.json()) as {
        data?: {
          items?: Array<{
            caseId: string;
            caseName: string;
            caseCode: string;
            assignmentId: string;
          }>;
        };
        error?: { message?: string };
      };
      if (!response.ok || !json.data?.items?.length) {
        setMessage(json.error?.message ?? "無法準備派案");
        return;
      }

      const next: DeskBatchState = {
        version: 1,
        returnPath,
        identityKey,
        village: villageFilter,
        primaryVisitorId,
        companionVisitorIds,
        visitorNames: visitorNameById,
        items: json.data.items.map((item) => {
          const src = selectedCases.find((caseItem) => caseItem.id === item.caseId);
          return {
            caseId: item.caseId,
            caseName: item.caseName,
            caseCode: item.caseCode,
            assignmentId: item.assignmentId,
            status: "ready" as const,
            village: src?.village || villageFilter,
            villageSeq: src?.villageSeq ?? null,
            villageCode: src?.villageCode || "",
          };
        }),
        updatedAt: new Date().toISOString(),
      };
      writeDeskBatchState(next);
      setBatch(next);
      setShowPrepareAgainCta(false);
      setBatchTimeDraft({
        visitDate: new Date().toISOString().slice(0, 10),
        visitStartTime: "09:00",
        visitEndTime: addMinutesToTime("09:00", DESK_BATCH_SLOT_MINUTES) || "09:10",
      });
      setCreating(false);
      setMessage(
        `已準備 ${next.items.length} 筆派案。請填第 1 筆時間後「套用整批時段」，將立刻開始連續 KEY。`,
      );
    } catch {
      setMessage("目前無法連線，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  const staggerPreview = useMemo(() => {
    if (!batch?.items.length) return null;
    return buildStaggeredVisitWindows({
      visitDate: batchTimeDraft.visitDate,
      firstStart: batchTimeDraft.visitStartTime,
      firstEnd: batchTimeDraft.visitEndTime,
      count: batch.items.length,
      travelGapMinutes: DESK_BATCH_TRAVEL_GAP_MINUTES,
    });
  }, [batch, batchTimeDraft]);

  function openTimeConfirm(item: DeskBatchQueueItem) {
    const today = new Date().toISOString().slice(0, 10);
    const defaultEnd = addMinutesToTime("09:00", DESK_BATCH_SLOT_MINUTES) || "09:10";
    setTimeDraft({
      assignmentId: item.assignmentId,
      caseId: item.caseId,
      caseName: item.caseName,
      caseCode: item.caseCode,
      village: item.village || batch?.village,
      villageSeq: item.villageSeq ?? null,
      villageCode: item.villageCode || "",
      visitDate: item.visitDate || batchTimeDraft.visitDate || today,
      visitStartTime: item.visitStartTime || batchTimeDraft.visitStartTime || "09:00",
      visitEndTime: item.visitEndTime || batchTimeDraft.visitEndTime || defaultEnd,
    });
    setMessage(null);
  }

  async function enterFormWithTime(item: DeskBatchQueueItem) {
    if (!item.visitDate || !item.visitStartTime || !item.visitEndTime) {
      openTimeConfirm(item);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const exists = await assignmentStillExists(item.assignmentId, batch);
      if (exists === false) {
        recoverStaleAssignmentQueue(item.assignmentId);
        return;
      }
      router.push(
        buildDeskCareFormPath(item.assignmentId, {
          visitDate: item.visitDate,
          visitStartTime: item.visitStartTime,
          visitEndTime: item.visitEndTime,
          returnPath,
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function applyBatchTimes() {
    if (!batch) return;
    const built = buildStaggeredVisitWindows({
      visitDate: batchTimeDraft.visitDate,
      firstStart: batchTimeDraft.visitStartTime,
      firstEnd: batchTimeDraft.visitEndTime,
      count: batch.items.length,
      travelGapMinutes: DESK_BATCH_TRAVEL_GAP_MINUTES,
    });
    if (!built.ok) {
      setMessage(built.message);
      return;
    }

    setBusy(true);
    setMessage(null);
    setShowPrepareAgainCta(false);
    try {
      // Fail fast before confirm-time-batch so dead ASGs never leave UI locked mid-apply.
      // Fresh batches retry once so Sheets lag after prepare does not wipe the new queue.
      const preflight = await checkAssignmentsExistForBatch(batch);
      if (preflight && !preflight.exists) {
        recoverStaleAssignmentQueue(preflight.missing[0]);
        return;
      }

      const response = await fetch("/api/manager/care-forms/confirm-time-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          primaryVisitorId: batch.primaryVisitorId,
          companionVisitorIds: batch.companionVisitorIds,
          items: batch.items.map((item, index) => ({
            assignmentId: item.assignmentId,
            caseId: item.caseId,
            caseLabel: formatDeskCasePaperLabel({
              villageCode: item.villageCode,
              village: item.village || batch.village,
              villageSeq: item.villageSeq,
              name: item.caseName,
              caseCode: item.caseCode,
            }).full,
            visitDate: built.slots[index].visitDate,
            visitStartTime: built.slots[index].visitStartTime,
            visitEndTime: built.slots[index].visitEndTime,
          })),
        }),
      });
      const json = (await response.json()) as {
        error?: { code?: string; message?: string; assignmentId?: string };
      };
      if (!response.ok) {
        const failMessage = json.error?.message ?? "整批時段無法套用";
        if (isAssignmentNotFoundError(json.error)) {
          recoverStaleAssignmentQueue(json.error?.assignmentId);
          return;
        }
        if (isTimeConflictError(json.error)) showTimeConflict(failMessage);
        else setMessage(failMessage);
        return;
      }

      // Only persist preview slots after Sheets confirm succeeds
      const nextItems = batch.items.map((item, index) => ({
        ...item,
        visitDate: built.slots[index].visitDate,
        visitStartTime: built.slots[index].visitStartTime,
        visitEndTime: built.slots[index].visitEndTime,
      }));
      const nextBatch = { ...batch, items: nextItems, updatedAt: new Date().toISOString() };
      writeDeskBatchState(nextBatch);
      setBatch(nextBatch);
      const firstReady = findNextReadyDeskBatchItem(nextBatch);
      if (firstReady?.visitDate && firstReady.visitStartTime && firstReady.visitEndTime) {
        setMessage("已套用並開始連續 KEY");
        router.push(
          buildDeskCareFormPath(firstReady.assignmentId, {
            visitDate: firstReady.visitDate,
            visitStartTime: firstReady.visitStartTime,
            visitEndTime: firstReady.visitEndTime,
            returnPath,
          }),
        );
        return;
      }
      setMessage(
        `已套用整批時段（每案 ${built.durationMinutes} 分、移動間隔 ${built.travelGapMinutes} 分）。請進表 KEY。`,
      );
    } catch {
      setMessage("目前無法連線，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  /** 單筆時段稽核儲存（不進表；整批套用才會立刻進第一案）。 */
  async function confirmTimeOnly() {
    if (!timeDraft || !batch) return;
    setBusy(true);
    setMessage(null);
    try {
      const siblingWindows: DeskVisitWindow[] = batch.items
        .filter(
          (item) =>
            item.assignmentId !== timeDraft.assignmentId &&
            item.visitDate &&
            item.visitStartTime &&
            item.visitEndTime,
        )
        .map((item) => ({
          assignmentId: item.assignmentId,
          caseId: item.caseId,
          label: formatDeskCasePaperLabel({
            villageCode: item.villageCode,
            village: item.village || batch.village,
            villageSeq: item.villageSeq,
            name: item.caseName,
            caseCode: item.caseCode,
          }).full,
          visitDate: item.visitDate!,
          start: item.visitStartTime!,
          end: item.visitEndTime!,
          visitorIds: [batch.primaryVisitorId, ...batch.companionVisitorIds],
        }));

      const response = await fetch("/api/manager/care-forms/confirm-time", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assignmentId: timeDraft.assignmentId,
          caseId: timeDraft.caseId,
          caseLabel: formatDeskCasePaperLabel({
            villageCode: timeDraft.villageCode,
            village: timeDraft.village || batch.village,
            villageSeq: timeDraft.villageSeq,
            name: timeDraft.caseName,
            caseCode: timeDraft.caseCode,
          }).full,
          primaryVisitorId: batch.primaryVisitorId,
          companionVisitorIds: batch.companionVisitorIds,
          visitDate: timeDraft.visitDate,
          visitStartTime: timeDraft.visitStartTime,
          visitEndTime: timeDraft.visitEndTime,
          siblingWindows,
        }),
      });
      const json = (await response.json()) as {
        error?: { code?: string; message?: string; assignmentId?: string };
      };
      if (!response.ok) {
        const failMessage = json.error?.message ?? "時段無法確認";
        if (isAssignmentNotFoundError(json.error)) {
          recoverStaleAssignmentQueue(json.error?.assignmentId || timeDraft.assignmentId);
          return;
        }
        if (isTimeConflictError(json.error)) showTimeConflict(failMessage);
        else setMessage(failMessage);
        return;
      }

      const nextItems = batch.items.map((item) =>
        item.assignmentId === timeDraft.assignmentId
          ? {
              ...item,
              visitDate: timeDraft.visitDate,
              visitStartTime: timeDraft.visitStartTime,
              visitEndTime: timeDraft.visitEndTime,
            }
          : item,
      );
      const nextBatch = { ...batch, items: nextItems, updatedAt: new Date().toISOString() };
      writeDeskBatchState(nextBatch);
      setBatch(nextBatch);
      setTimeDraft(null);
      setMessage("已更新本筆時段，可按「進表 KEY」。");
    } catch {
      setMessage("目前無法連線，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  function markKeyedAndStay(assignmentId: string) {
    if (!batch) return;
    const next = {
      ...batch,
      items: batch.items.map((item) =>
        item.assignmentId === assignmentId ? { ...item, status: "keyed" as const } : item,
      ),
      updatedAt: new Date().toISOString(),
    };
    writeDeskBatchState(next);
    setBatch(next);
  }

  function clearBatch(opts?: { message?: string; showPrepareCta?: boolean }) {
    clearDeskBatchState();
    setBatch(null);
    setTimeDraft(null);
    setShowPrepareAgainCta(Boolean(opts?.showPrepareCta));
    setMessage(opts?.message ?? "已清空待 KEY 清單。訪查組仍保留，可再勾個案準備。");
  }

  /** Sheets 已無該派案列 → 整批 sessionStorage 佇列視為過期，解鎖步驟 1–3 */
  function recoverStaleAssignmentQueue(assignmentId?: string) {
    clearDeskBatchState();
    setBatch(null);
    setTimeDraft(null);
    setShowPrepareAgainCta(true);
    setMessage(deskStaleAssignmentClearedMessage(assignmentId));
  }

  function scrollToCaseSection() {
    document.getElementById("desk-case-section")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  // 從表單返回：done= 標記已 KEY；batchDone=1 顯示連續 KEY 完成提示
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const doneId = params.get("done");
    const batchDone = params.get("batchDone");
    if (doneId) markKeyedAndStay(doneId);
    if (batchDone === "1") {
      setMessage("本批待 KEY 已全部送出。");
    }
    if (!doneId && batchDone !== "1") return;
    params.delete("done");
    params.delete("batchDone");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState({}, "", next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const teamSummary = selectedVisitorIds
    .map((id) => {
      const name = visitorNameById[id] || id;
      return id === primaryVisitorId ? `${name}（主填）` : name;
    })
    .join("、");

  return (
    <div className="grid gap-5">
      <PageIntro
        icon={ClipboardPen}
        eyebrow={entry === "desk" ? "里責填表入口" : "承辦後台"}
        title="關懷表建檔"
        description="先固定訪查組（民政／社政可複選，並指定主填表人），再一次勾多個案準備派案；整批套用訪視時間（第 1 筆起迄，後案＝時長＋移動 5 分）後立刻進第一案連續 KEY。同組時段不可衝突。非未遇不必三次；未遇送出後會自動補 D-2 早／D-1 中兩張紙本。"
      />

      {batch ? (
        <div className="sticky top-2 z-40 rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-950">
                目前有待 KEY 清單（{batch.items.length} 案）— 上方步驟已暫鎖
              </p>
              <p className="mt-1 text-sm text-amber-900">
                請往下到「4. 待 KEY 清單」整批套用時間後進表；若要重選訪查員／個案，請先清空清單。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  document.getElementById("desk-batch-queue")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
              >
                跳到待 KEY 清單
              </Button>
              <Button type="button" onClick={() => clearBatch()}>
                清空清單（解鎖）
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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
        <p className="mt-1 text-sm text-muted-foreground">先點身份，再選該身份負責的里。</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="身份 *">
            <select
              className="h-11 w-full rounded-md border px-3 text-sm"
              value={identityKey}
              disabled={scopeBlocked || metaLoading || identityOptions.length === 0 || Boolean(batch)}
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
              disabled={!selectedIdentity || Boolean(batch)}
              onChange={(event) => onVillageChange(event.target.value)}
            >
              <option value="">{selectedIdentity ? "請選擇里別" : "先選身份"}</option>
              {villageOptions.map((village) => (
                <option key={village} value={village}>
                  {formatYongheVillageSelectLabel(
                    village,
                    options?.villageCodeByName?.[village],
                  )}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">2. 勾選實際填表訪查員</h2>
          <Button
            type="button"
            variant="outline"
            disabled={Boolean(batch)}
            onClick={() => setCreatingVisitor((current) => !current)}
          >
            <Plus className="h-4 w-4" />
            {creatingVisitor ? "改搜現有訪查員" : "新增訪查員"}
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          民政或社政至少勾一邊（可兩邊都勾）；每一邊可勾兩位以上。再手動指定一位主填表人。
        </p>

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
            <Field label="民政／社政 *">
              <select
                className="h-11 w-full rounded-md border px-3 text-sm"
                value={newVisitor.workerGroup}
                onChange={(event) =>
                  setNewVisitor((current) => ({
                    ...current,
                    workerGroup: event.target.value as VisitorRegistrationWorkerGroup,
                  }))
                }
              >
                <option value="civil_affairs">民政訪查人員</option>
                <option value="social_affairs">社政訪查人員</option>
              </select>
            </Field>
            <Field label="Email（可後補）">
              <input
                className="h-11 w-full rounded-md border px-3 text-sm"
                value={newVisitor.email}
                onChange={(event) => setNewVisitor((current) => ({ ...current, email: event.target.value }))}
              />
            </Field>
            <div className="sm:col-span-2">
              <Button
                type="button"
                disabled={busy || !newVisitor.name.trim() || !newVisitor.phone.trim()}
                onClick={() => void createVisitor()}
              >
                {busy ? "新增中…" : "建立訪查員並勾選"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <VisitorPickColumn
              title="民政（訪員）"
              query={civilQuery}
              onQueryChange={setCivilQuery}
              visitors={civilVisitors}
              selectedIds={civilVisitorIds}
              primaryVisitorId={primaryVisitorId}
              loading={visitorsLoading}
              disabled={Boolean(batch)}
              onToggle={(id) => toggleVisitor("civil", id)}
              onSetPrimary={setPrimaryVisitorId}
            />
            <VisitorPickColumn
              title="社政（訪員）"
              query={socialQuery}
              onQueryChange={setSocialQuery}
              visitors={socialVisitors}
              selectedIds={socialVisitorIds}
              primaryVisitorId={primaryVisitorId}
              loading={visitorsLoading}
              disabled={Boolean(batch)}
              onToggle={(id) => toggleVisitor("social", id)}
              onSetPrimary={setPrimaryVisitorId}
            />
          </div>
        )}

        {selectedVisitorIds.length > 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">本次訪查組：{teamSummary || "尚未勾選"}</p>
        ) : null}
        {!visitorStepOk && selectedVisitorIds.length > 0 ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            已勾選 {selectedVisitorIds.length} 人，請再按其中一位的「設為主填表人」才能繼續勾個案。
          </p>
        ) : null}
      </section>

      <section id="desk-case-section" className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">3. 勾選個案並準備派案</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              依紙本「里編號」排序；姓名前顯示 #里編號，方便對照 KEY。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!canBrowseCases || Boolean(batch)}
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
                placeholder={`${villageFilter}：搜尋姓名、編碼（可多選）`}
                value={query}
                disabled={Boolean(batch)}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="mt-3 grid max-h-80 grid-cols-1 gap-2 overflow-auto sm:grid-cols-2">
              {filteredCases.map((item) => {
                const checked = selectedCaseIds.includes(item.id);
                const paperLabel = formatDeskCasePaperLabel({
                  villageCode: item.villageCode,
                  village: item.village,
                  villageSeq: item.villageSeq,
                  name: item.name,
                  caseCode: item.caseCode,
                });
                return (
                  <label
                    key={item.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                      checked ? "border-primary bg-primary/5" : "bg-background"
                    } ${batch ? "pointer-events-none opacity-60" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={checked}
                      disabled={Boolean(batch)}
                      onChange={() => toggleCase(item.id)}
                    />
                    <span>
                      <span className="block font-semibold">{paperLabel.primary}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {paperLabel.secondary ? `${paperLabel.secondary} · ` : ""}
                        {item.visitStatus}
                      </span>
                    </span>
                  </label>
                );
              })}
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
            {selectedCaseIds.length > 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">已勾選 {selectedCaseIds.length} 位個案</p>
            ) : null}
          </>
        )}

        {!batch ? (
          <Button
            className="mt-4 h-11"
            disabled={
              busy ||
              scopeBlocked ||
              !canBrowseCases ||
              !visitorStepOk ||
              (!creating && selectedCaseIds.length === 0) ||
              (creating && !newCase.name.trim())
            }
            onClick={() => void prepareBatch()}
          >
            <UserRound className="h-4 w-4" />
            {busy ? "準備中…" : "一次準備派案（產生待 KEY 清單）"}
          </Button>
        ) : null}
      </section>

      {batch ? (
        <section id="desk-batch-queue" className="rounded-lg border border-primary/30 bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">4. 待 KEY 清單（整批時間後進表）</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                訪查組固定：
                {[batch.primaryVisitorId, ...batch.companionVisitorIds]
                  .map((id) => {
                    const name = batch.visitorNames[id] || id;
                    return id === batch.primaryVisitorId ? `${name}（主填）` : name;
                  })
                  .join("、")}
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => clearBatch()}>
              清空清單／更換訪查組
            </Button>
          </div>

          <div className="mt-4 rounded-md border border-dashed bg-secondary/40 p-3">
            <p className="text-sm font-medium">整批訪視時間</p>
            <p className="mt-1 text-xs text-muted-foreground">
              填第 1 筆日期與起迄；後案同日自動往後排（時長{" "}
              {DESK_BATCH_SLOT_MINUTES} 分＋移動間隔 {DESK_BATCH_TRAVEL_GAP_MINUTES}{" "}
              分）。例：09:00–09:10 → 09:15–09:25 → 09:30–09:40。套用成功後各案會寫入時段並立刻進第 1 案連續 KEY。
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="訪視日期 *">
                <input
                  type="date"
                  className="h-11 w-full rounded-md border px-3 text-sm"
                  value={batchTimeDraft.visitDate}
                  onChange={(event) =>
                    setBatchTimeDraft((current) => ({
                      ...current,
                      visitDate: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="第 1 筆開始 *">
                <input
                  type="time"
                  className="h-11 w-full rounded-md border px-3 text-sm"
                  value={batchTimeDraft.visitStartTime}
                  onChange={(event) => {
                    const visitStartTime = event.target.value;
                    const visitEndTime =
                      addMinutesToTime(visitStartTime, DESK_BATCH_SLOT_MINUTES) ||
                      batchTimeDraft.visitEndTime;
                    setBatchTimeDraft((current) => ({
                      ...current,
                      visitStartTime,
                      visitEndTime,
                    }));
                  }}
                />
              </Field>
              <Field label="第 1 筆結束 *">
                <input
                  type="time"
                  className="h-11 w-full rounded-md border px-3 text-sm"
                  value={batchTimeDraft.visitEndTime}
                  onChange={(event) =>
                    setBatchTimeDraft((current) => ({
                      ...current,
                      visitEndTime: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            {staggerPreview?.ok ? (
              <ul className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                {batch.items.map((item, index) => {
                  const slot = staggerPreview.slots[index];
                  const paperLabel = formatDeskCasePaperLabel({
                    villageCode: item.villageCode,
                    village: item.village || batch.village,
                    villageSeq: item.villageSeq,
                    name: item.caseName,
                    caseCode: item.caseCode,
                  });
                  return (
                    <li key={item.assignmentId}>
                      {index + 1}. {paperLabel.primary}：{slot.visitDate} {slot.visitStartTime}–
                      {slot.visitEndTime}
                    </li>
                  );
                })}
              </ul>
            ) : staggerPreview && !staggerPreview.ok ? (
              <p className="mt-3 text-sm text-destructive">{staggerPreview.message}</p>
            ) : null}
            <div className="mt-3">
              <Button
                type="button"
                disabled={busy || !staggerPreview?.ok}
                onClick={() => void applyBatchTimes()}
              >
                {busy ? "套用中…" : "套用整批時段"}
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            {batch.items.map((item) => {
              const hasTime = Boolean(item.visitDate && item.visitStartTime && item.visitEndTime);
              const paperLabel = formatDeskCasePaperLabel({
                villageCode: item.villageCode,
                village: item.village || batch.village,
                villageSeq: item.villageSeq,
                name: item.caseName,
                caseCode: item.caseCode,
              });
              return (
                <div
                  key={item.assignmentId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div>
                    <p className="font-semibold">{paperLabel.primary}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {paperLabel.secondary ? `${paperLabel.secondary} · ` : ""}
                      {hasTime
                        ? `${item.visitDate} ${item.visitStartTime}-${item.visitEndTime}`
                        : "尚未套用時間"}
                      {item.status === "keyed" ? " · 已 KEY" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {hasTime ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => openTimeConfirm(item)}
                      >
                        調整時間
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant={item.status === "keyed" ? "outline" : "default"}
                      disabled={busy}
                      onClick={() => enterFormWithTime(item)}
                    >
                      {item.status === "keyed" ? "再進表／查看" : hasTime ? "進表 KEY" : "先填時間"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {conflictAlert ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-3 sm:items-center"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="desk-time-conflict-title"
        >
          <section className="w-full max-w-md rounded-lg border border-destructive/40 bg-card p-4 shadow-lg">
            <h3 id="desk-time-conflict-title" className="text-lg font-semibold text-destructive">
              時段衝突，請修改時間
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              主填「
              {batch
                ? batch.visitorNames[batch.primaryVisitorId] || batch.primaryVisitorId
                : "訪查員"}
              」當日已有其他派案時段，與本次排程重疊，無法套用（核銷不可重複）。
            </p>
            <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm leading-relaxed">
              {conflictAlert}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              請把第 1 筆開始時間改到衝突時段之後，或先處理／調整舊派案時段後再套用。
            </p>
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={() => setConflictAlert(null)}>
                知道了，我去改時間
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      {timeDraft ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <section className="w-full max-w-md rounded-lg border bg-card p-4 shadow-lg">
            <h3 className="text-lg font-semibold">確認本筆訪視時間</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {
                formatDeskCasePaperLabel({
                  villageCode: timeDraft.villageCode,
                  village: timeDraft.village || batch?.village,
                  villageSeq: timeDraft.villageSeq,
                  name: timeDraft.caseName,
                  caseCode: timeDraft.caseCode,
                }).full
              }
              · 同組訪查員時段不可衝突（核銷稽核）
            </p>
            <div className="mt-4 grid gap-3">
              <Field label="訪視日期 *">
                <input
                  type="date"
                  className="h-11 w-full rounded-md border px-3 text-sm"
                  value={timeDraft.visitDate}
                  onChange={(event) =>
                    setTimeDraft((current) =>
                      current ? { ...current, visitDate: event.target.value } : current,
                    )
                  }
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="開始 *">
                  <input
                    type="time"
                    className="h-11 w-full rounded-md border px-3 text-sm"
                    value={timeDraft.visitStartTime}
                    onChange={(event) =>
                      setTimeDraft((current) =>
                        current ? { ...current, visitStartTime: event.target.value } : current,
                      )
                    }
                  />
                </Field>
                <Field label="結束 *">
                  <input
                    type="time"
                    className="h-11 w-full rounded-md border px-3 text-sm"
                    value={timeDraft.visitEndTime}
                    onChange={(event) =>
                      setTimeDraft((current) =>
                        current ? { ...current, visitEndTime: event.target.value } : current,
                      )
                    }
                  />
                </Field>
              </div>
            </div>
            {message ? <p className="mt-3 text-sm text-destructive">{message}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setTimeDraft(null)}>
                取消
              </Button>
              <Button type="button" disabled={busy} onClick={() => void confirmTimeOnly()}>
                {busy ? "檢查中…" : "通過稽核並儲存時段"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      {message && !timeDraft && !conflictAlert ? (
        <div
          className={
            message.includes("衝突")
              ? "rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
              : showPrepareAgainCta
                ? "rounded-md border border-sky-300 bg-sky-50 p-4 text-sm text-sky-950"
                : "rounded-md bg-secondary p-3 text-sm text-muted-foreground"
          }
        >
          <p>{message}</p>
          {showPrepareAgainCta && !batch ? (
            <Button type="button" className="mt-3 h-11" onClick={scrollToCaseSection}>
              重新準備派案（已解鎖）
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function filterVisitors(rows: DeskVisitorOption[], query: string) {
  const needle = query.trim();
  const filtered = !needle
    ? rows
    : rows.filter((item) =>
        [item.name, item.badgeNo, item.status].some((value) => value.includes(needle)),
      );
  return filtered.slice(0, 40);
}

function VisitorPickColumn({
  title,
  query,
  onQueryChange,
  visitors,
  selectedIds,
  primaryVisitorId,
  loading,
  disabled,
  onToggle,
  onSetPrimary,
}: {
  title: string;
  query: string;
  onQueryChange: (value: string) => void;
  visitors: DeskVisitorOption[];
  selectedIds: string[];
  primaryVisitorId: string;
  loading: boolean;
  disabled?: boolean;
  onToggle: (id: string) => void;
  onSetPrimary: (id: string) => void;
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-sm font-semibold">{title}</p>
      <label className="mt-2 flex h-10 items-center gap-2 rounded-md border bg-background px-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          placeholder="搜尋姓名或編碼"
          value={query}
          disabled={disabled}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>
      <div className="mt-2 grid max-h-56 gap-2 overflow-auto">
        {visitors.map((visitor) => {
          const checked = selectedIds.includes(visitor.id);
          const isPrimary = primaryVisitorId === visitor.id;
          return (
            <div
              key={visitor.id}
              className={`rounded-md border p-2 ${checked ? "border-primary bg-primary/5" : "bg-background"}`}
            >
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onToggle(visitor.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{visitor.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {visitor.badgeNo || visitor.id}
                    {visitor.status ? ` · ${visitor.status}` : ""}
                    {visitor.workerGroup === "unknown" ? " · 未分類" : ""}
                  </span>
                </span>
              </label>
              {checked ? (
                <button
                  type="button"
                  disabled={disabled}
                  className={`mt-2 w-full rounded-md border px-2 py-1 text-xs ${
                    isPrimary ? "border-primary bg-primary text-primary-foreground" : "bg-card"
                  }`}
                  onClick={() => onSetPrimary(visitor.id)}
                >
                  {isPrimary ? "主填表人（已指定）" : "設為主填表人"}
                </button>
              ) : null}
            </div>
          );
        })}
        {loading ? (
          <p className="text-sm text-muted-foreground">載入中…</p>
        ) : visitors.length === 0 ? (
          <p className="text-sm text-muted-foreground">此欄暫無訪查員</p>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">已勾 {selectedIds.length} 人</p>
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
