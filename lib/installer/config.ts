import type { ClientInstallConfig, CreateInstallerJobPayload } from "@/lib/installer/types";

export function buildClientConfig(payload: CreateInstallerJobPayload): ClientInstallConfig {
  const clientCode =
    payload.clientCode ||
    payload.clientId.split("-")[0]?.toUpperCase() ||
    "CL";
  const fiscalYear = String(payload.fiscalYear);

  return {
    clientId: payload.clientId,
    clientName: payload.clientName,
    clientCode,
    district: payload.district,
    fiscalYear,
    workspaceId: `WS-${clientCode}-${fiscalYear}`,
    encodePrefix: `${clientCode}-${fiscalYear}`,
    spreadsheetName: `${payload.district}_${fiscalYear}年_獨居長者訪查_主檔`,
    google: {
      accountEmail: payload.googleAccountEmail,
      gasProjectTitle: `${payload.district}訪查平台 GAS`,
    },
    access: {
      allowedEmails: payload.allowedEmails,
      ownerEmails: payload.ownerEmails?.length
        ? payload.ownerEmails
        : payload.allowedEmails,
    },
    vercel: {
      enabled: payload.enableVercel !== false,
      teamSlug: payload.vercelTeamSlug || "yongheelderly0826-design",
      projectName: payload.vercelProjectName || `elder-visit-${payload.clientId}`,
      productionUrl:
        payload.productionUrl ||
        `https://elder-visit-${payload.clientId}.vercel.app`,
    },
    github: {
      enabled: payload.enableGithub !== false,
      org: payload.githubOrg || "yongheelderly0826-design",
      templateRepo: "yongheelderly0826-design/Elder-Visit-Platform",
      repoName: payload.githubRepoName || `elder-visit-${payload.clientId}`,
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
