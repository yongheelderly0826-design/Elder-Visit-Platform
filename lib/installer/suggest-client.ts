import catalog from "@/lib/installer/district-catalog.json";

type DistrictEntry = { slug: string; code: string };

const DISTRICT_CATALOG = catalog as Record<string, DistrictEntry>;

export function normalizeDistrict(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.endsWith("區")) return trimmed;
  return `${trimmed}區`;
}

export function suggestClientFromDistrict(districtRaw: string, fiscalYear = "115") {
  const district = normalizeDistrict(districtRaw);
  const hit = DISTRICT_CATALOG[district];
  const slug = hit?.slug || "client";
  const code = hit?.code || slug.slice(0, 2).toUpperCase();
  const year = String(fiscalYear || "115");

  return {
    district,
    fiscalYear: year,
    clientId: `${slug}-${year}`,
    clientCode: code,
    clientName: `新北市${district}公所`,
    workspaceId: `WS-${code}-${year}`,
    encodePrefix: `${code}-${year}`,
    spreadsheetName: `${district}_${year}年_獨居長者訪查_主檔`,
  };
}
