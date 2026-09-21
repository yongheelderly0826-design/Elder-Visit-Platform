import { revalidateTag, unstable_cache } from "next/cache";

export const GAS_READ_CACHE_SECONDS = 20;

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
) {
  return unstable_cache(loader, key, {
    revalidate: GAS_READ_CACHE_SECONDS,
    tags,
  })();
}
