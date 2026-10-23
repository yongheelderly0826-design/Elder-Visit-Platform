import { GasBadgePrintSheet } from "@/components/badges/gas-badge-print-sheet";
import type { GasBadgePrintMode } from "@/lib/domain/gas-physical-badge-print";

export default async function GasPhysicalBadgePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ visitorIds?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const visitorIds = (params.visitorIds ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const mode = parseMode(params.mode);

  return (
    <main>
      <GasBadgePrintSheet
        initialVisitorIds={visitorIds.length > 0 ? visitorIds : undefined}
        initialMode={mode}
      />
    </main>
  );
}

function parseMode(value?: string): GasBadgePrintMode {
  if (value === "front" || value === "back" || value === "duplex" || value === "check") {
    return value;
  }
  return "duplex";
}
