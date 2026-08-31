import type { ClientInstallConfig, CreateInstallerJobPayload } from "@/lib/installer/types";
import { suggestClientFromDistrict } from "@/lib/installer/suggest-client";

export function buildClientConfig(payload: CreateInstallerJobPayload): ClientInstallConfig {
  const suggested = suggestClientFromDistrict(
    payload.district,
    payload.fiscalYear || "115",
  );
  const clientId = payload.clientId || suggested.clientId;
  const clientCode = payload.clientCode || suggested.clientCode;
  const fiscalYear = suggested.fiscalYear;
  const district = suggested.district;
  const clientName = payload.clientName || suggested.clientName;
  const email = payload.googleAccountEmail;
  const allowed = payload.allowedEmails?.filter(Boolean).length
    ? payload.allowedEmails.filter(Boolean)
    : email
      ? [email]
      : [];

  return {
    clientId,
    clientName,
    clientCode,
    district,
    fiscalYear,
    workspaceId: `WS-${clientCode}-${fiscalYear}`,
    encodePrefix: `${clientCode}-${fiscalYear}`,
    spreadsheetName: `${district}_${fiscalYear}年_獨居長者訪查_主檔`,
    google: {
      accountEmail: email,
      gasProjectTitle: `${district}訪查平台 GAS`,
    },
    access: {
      allowedEmails: allowed,
      ownerEmails: payload.ownerEmails?.length ? payload.ownerEmails : allowed,
    },
    vercel: {
      enabled: payload.enableVercel !== false,
      teamSlug: payload.vercelTeamSlug || "yongheelderly0826-design",
      projectName: payload.vercelProjectName || `elder-visit-${clientId}`,
      productionUrl:
        payload.productionUrl || `https://elder-visit-${clientId}.vercel.app`,
    },
    github: {
      enabled: payload.enableGithub !== false,
      org: payload.githubOrg || "yongheelderly0826-design",
      templateRepo: "yongheelderly0826-design/Elder-Visit-Platform",
      repoName: payload.githubRepoName || `elder-visit-${clientId}`,
      private: true,
    },
    handoff: {
      contactName: payload.contactName,
      contactEmail: payload.contactEmail || payload.googleAccountEmail,
      contractRef: payload.contractRef,
      supportUntil: payload.supportUntil,
    },
  };
}
