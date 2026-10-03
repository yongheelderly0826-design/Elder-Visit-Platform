import { revalidateTag, unstable_cache } from "next/cache";

/** Default TTL for heavier manager bundles (exports / assignment dashboard). */
export const GAS_READ_CACHE_SECONDS = 20;

/**
 * Shorter TTL for visitor-facing / inbox-style reads.
 * Note: the "約 3 秒" in daily-visit docs is the *after-write snapshot rebuild*
 * delay in GAS, not this HTTP read-cache TTL — but 3s is a valid fresher option here.
 */
export const GAS_READ_CACHE_SECONDS_FAST = 3;

export const GAS_READ_TAGS = {
  dailyVisits: "gas-daily-visits",
  visitorTasks: "gas-visitor-tasks",
  managerExports: "gas-manager-exports",
  auditQueue: "gas-audit-queue",
  assignmentDashboard: "gas-assignment-dashboard",
  highCare: "gas-high-care",
} as const;

export function invalidateGasReadCaches() {
  revalidateTag(GAS_READ_TAGS.dailyVisits);
  revalidateTag(GAS_READ_TAGS.visitorTasks);
  revalidateTag(GAS_READ_TAGS.managerExports);
  revalidateTag(GAS_READ_TAGS.auditQueue);
  revalidateTag(GAS_READ_TAGS.assignmentDashboard);
  revalidateTag(GAS_READ_TAGS.highCare);
}

export function cachedRead<T>(
  key: string[],
  tags: string[],
  loader: () => Promise<T>,
  revalidateSeconds: number = GAS_READ_CACHE_SECONDS,
) {
  return unstable_cache(loader, key, {
    revalidate: revalidateSeconds,
    tags,
  })();
}
