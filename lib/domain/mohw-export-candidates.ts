export type MohwExportCandidate = {
  caseId: string;
  encodedId: string;
  externalId: string;
  name: string;
  district: string;
  village: string;
  careformId: string;
  careformStatus: string;
  visitResult: string;
  submittedAt: string;
  auditedAt: string;
  auditDecision: string;
  exportReady: boolean;
  validationOk: boolean;
  errorCount: number;
  errorLines: string[];
};
