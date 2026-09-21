import { revalidateTag, unstable_cache } from "next/cache";

export const GAS_READ_CACHE_SECONDS = 20;

export const GAS_READ_TAGS = {
  dailyVisits: "gas-daily-visits",
  visitorTasks: "gas-visitor-tasks",
  managerExports: "gas-manager-exports",
} as const;

export function invalidateGasReadCaches() {
  revalidateTag(GAS_READ_TAGS.dailyVisits);
  revalidateTag(GAS_READ_TAGS.visitorTasks);
  revalidateTag(GAS_READ_TAGS.managerExports);
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
