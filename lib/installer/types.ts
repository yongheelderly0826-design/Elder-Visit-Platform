export type InstallerJobStatus =
  | "queued"
  | "running"
  | "waiting_gas"
  | "completed"
  | "failed";

export type InstallerJobPhase =
  | "preflight"
  | "github"
  | "gas"
  | "gas_webapp"
  | "env"
  | "vercel"
  | "handoff"
  | "complete";

export type ClientInstallConfig = {
  clientId: string;
  clientName: string;
  clientCode?: string;
  district: string;
  fiscalYear: string;
  workspaceId?: string;
  encodePrefix?: string;
  spreadsheetName?: string;
  google?: {
    accountEmail?: string;
    gasProjectTitle?: string;
  };
  access?: {
    allowedEmails?: string[];
    ownerEmails?: string[];
  };
  vercel?: {
    enabled?: boolean;
    teamSlug?: string;
    projectName?: string;
    productionUrl?: string;
  };
  github?: {
    enabled?: boolean;
    org?: string;
    templateRepo?: string;
    repoName?: string;
    private?: boolean;
    description?: string;
  };
  handoff?: {
    contactName?: string;
    contactEmail?: string;
    contractRef?: string;
    supportUntil?: string;
  };
};

export type InstallerJob = {
  id: string;
  status: InstallerJobStatus;
  phase: InstallerJobPhase;
  message?: string;
  config: ClientInstallConfig;
  github?: {
    htmlUrl?: string;
    fullName?: string;
    cloneUrl?: string;
    private?: boolean;
    reused?: boolean;
  } | null;
  bootstrap?: Record<string, unknown>;
  gasWebAppUrl?: string;
  result?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CreateInstallerJobPayload = {
  clientId: string;
  clientName: string;
  clientCode?: string;
  district: string;
  fiscalYear: string;
  googleAccountEmail: string;
  allowedEmails: string[];
  ownerEmails?: string[];
  vercelTeamSlug?: string;
  vercelProjectName?: string;
  productionUrl?: string;
  githubOrg?: string;
  githubRepoName?: string;
  enableGithub?: boolean;
  enableVercel?: boolean;
  contactEmail?: string;
  contactName?: string;
  contractRef?: string;
  supportUntil?: string;
  gasWebAppUrl?: string;
};
