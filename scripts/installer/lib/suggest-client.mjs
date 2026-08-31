import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./paths.mjs";

const catalog = JSON.parse(
  fs.readFileSync(path.join(ROOT, "lib/installer/district-catalog.json"), "utf8"),
);

export function normalizeDistrict(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (trimmed.endsWith("區")) return trimmed;
  return `${trimmed}區`;
}

export function slugifyDistrict(district) {
  const hit = catalog[district];
  if (hit) return hit;
  const ascii = district.replace(/區$/, "").replace(/[^\w]/g, "").toLowerCase();
  return {
    slug: ascii || "client",
    code: (ascii || "CL").slice(0, 2).toUpperCase(),
  };
}

export function suggestClientFromDistrict({ district, fiscalYear, email, clientName }) {
  const dist = normalizeDistrict(district);
  const year = String(fiscalYear || "115");
  const { slug, code } = slugifyDistrict(dist);
  const clientId = `${slug}-${year}`;
  const mail = String(email || "").trim().toLowerCase();

  return {
    clientId,
    clientName: clientName || `新北市${dist}公所`,
    clientCode: code,
    district: dist,
    fiscalYear: year,
    workspaceId: `WS-${code}-${year}`,
    encodePrefix: `${code}-${year}`,
    spreadsheetName: `${dist}_${year}年_獨居長者訪查_主檔`,
    google: {
      accountEmail: mail,
      gasProjectTitle: `${dist}訪查平台 GAS`,
    },
    access: {
      allowedEmails: mail ? [mail] : [],
      ownerEmails: mail ? [mail] : [],
    },
    vercel: {
      enabled: true,
      teamSlug: "yongheelderly0826-design",
      projectName: `elder-visit-${clientId}`,
      productionUrl: `https://elder-visit-${clientId}.vercel.app`,
    },
    github: {
      enabled: true,
      org: "yongheelderly0826-design",
      templateRepo: "yongheelderly0826-design/Elder-Visit-Platform",
      repoName: `elder-visit-${clientId}`,
      private: true,
    },
    handoff: {
      contactEmail: mail,
    },
  };
}
