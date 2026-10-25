"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  GAS_BADGE_PRINT_TRAY_KEY,
  resolveGasBadgeVisitorIds,
  uniqueVisitorIds,
  type GasBadgePrintVisitor,
} from "@/lib/domain/gas-physical-badge-print";

const EMPTY_TRAY: string[] = [];
const trayListeners = new Set<() => void>();
let traySnapshot: string[] = EMPTY_TRAY;
let trayLoaded = false;

export function useGasBadgePrintTray(
  catalog: GasBadgePrintVisitor[],
  initialVisitorIds?: string[],
) {
  const incomingIds = useMemo(
    () => resolveGasBadgeVisitorIds(catalog, initialVisitorIds ?? []),
    [catalog, initialVisitorIds],
  );
  const incomingKey = incomingIds.join("\u0000");
  const subscribe = useCallback(
    (listener: () => void) => {
      loadStoredTray();
      const merged = uniqueVisitorIds([...traySnapshot, ...incomingIds]);
      if (!sameIds(merged, traySnapshot)) writeStoredTray(merged);
      trayListeners.add(listener);
      return () => trayListeners.delete(listener);
    },
    // incomingKey deliberately represents the stable content of incomingIds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [incomingKey],
  );
  const storedIds = useSyncExternalStore(subscribe, getTraySnapshot, getServerTraySnapshot);
  const stagedIds = useMemo(
    () => resolveGasBadgeVisitorIds(catalog, storedIds),
    [catalog, storedIds],
  );

  const visitors = useMemo(
    () =>
      stagedIds
        .map((id) => catalog.find((item) => item.visitorId === id))
        .filter((item): item is GasBadgePrintVisitor => Boolean(item)),
    [catalog, stagedIds],
  );

  function stageVisitor(visitorId: string) {
    const next = uniqueVisitorIds([...stagedIds, visitorId]);
    writeStoredTray(next);
  }

  function unstageVisitor(visitorId: string) {
    writeStoredTray(stagedIds.filter((id) => id !== visitorId));
  }

  function clearTray() {
    writeStoredTray([]);
  }

  return {
    visitors,
    stagedIds,
    stageVisitor,
    unstageVisitor,
    clearTray,
  };
}

function getTraySnapshot() {
  loadStoredTray();
  return traySnapshot;
}

function getServerTraySnapshot() {
  return EMPTY_TRAY;
}

function loadStoredTray() {
  if (trayLoaded || typeof window === "undefined") return;
  trayLoaded = true;
  try {
    const raw = window.sessionStorage.getItem(GAS_BADGE_PRINT_TRAY_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    traySnapshot = uniqueVisitorIds(
      Array.isArray(parsed) ? parsed.map((item) => String(item)) : [],
    );
  } catch {
    traySnapshot = EMPTY_TRAY;
  }
}

function writeStoredTray(ids: string[]) {
  const next = uniqueVisitorIds(ids);
  trayLoaded = true;
  traySnapshot = next.length > 0 ? next : EMPTY_TRAY;
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(GAS_BADGE_PRINT_TRAY_KEY, JSON.stringify(traySnapshot));
  }
  trayListeners.forEach((listener) => listener());
}

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
