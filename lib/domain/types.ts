export type WorkspaceStatus = "draft" | "active" | "soft_deleted" | "archived";

export type BlueprintBindingStatus = "locked" | "upgradable" | "migrated" | "legacy";

export type Capability =
  | "dashboard.read"
  | "kpi.read"
  | "workspace.manage"
  | "workspace.update"
  | "workspace.soft_delete"
  | "permissions.manage"
  | "users.manage"
  | "users.create"
  | "users.update"
  | "users.delete"
  | "users.review"
  | "cases.read"
  | "cases.create"
  | "cases.update"
  | "cases.delete"
  | "cases.import"
  | "assignment.manage"
  | "assignment.create"
  | "assignment.update"
  | "assignment.delete"
  | "assignment.confirm"
  | "visits.read"
  | "visits.submit"
  | "visits.update"
  | "visits.delete"
  | "audit.run"
  | "audit.approve"
  | "audit.reject"
  | "payments.calculate"
  | "payments.lock"
  | "payments.unlock"
  | "exports.create"
  | "exports.delete"
  | "forms.manage"
  | "consent.manage"
  | "engines.manage"
  | "notifications.manage"
  | "notifications.send"
  | "pricing.manage"
  | "sponsors.manage"
  | "sponsors.create"
  | "sponsors.update"
  | "sponsors.delete"
  | "system.read"
  | "onboarding.publish"
  | "attendance.clock"
  | "attendance.manage";

export type Account = {
  id: string;
  email: string;
  fullName: string;
  status: "active" | "disabled";
};

export type Unit = {
  id: string;
  unitName: string;
  unitType: "government" | "ngo" | "temple" | "foundation" | "company";
  city: string;
  district: string;
};

export type PlatformBlueprint = {
  id: string;
  name: string;
  type: "elder_visit" | "temple_governance" | "volunteer_governance" | "esg_sponsorship";
  version: string;
  firstMarketFit: boolean;
  description: string;
};

export type BlueprintMigrationImpact = {
  key: string;
  label: string;
  impactType: "added" | "changed" | "deprecated";
  severity: "low" | "medium" | "high";
  detail: string;
};

export type BlueprintMigrationPreview = {
  workspaceId: string;
  blueprintId: string;
  fromVersion: string;
  toVersion: string;
  status: "preview_only" | "blocked" | "ready";
  canAutoApply: boolean;
  summary: string;
  impacts: BlueprintMigrationImpact[];
  requiredApprovals: string[];
};

export type AIRecommendationConfidence = {
  confidenceScore: number;
  reasoningSummary: string;
  matchedSignals: string[];
};

export type PlanLimitUsage = {
  key: "max_users" | "max_workspaces" | "max_cases" | "max_exports" | "max_forms" | "max_notifications";
  label: string;
  limit: number;
  used: number;
};

export type Workspace = {
  id: string;
  unitId: string;
  name: string;
  type: PlatformBlueprint["type"];
  status: WorkspaceStatus;
  blueprint: PlatformBlueprint;
  bindingStatus: BlueprintBindingStatus;
  responsiblePerson: string;
  roleName: string;
  capabilities: Capability[];
  planName: string;
  planLimits: PlanLimitUsage[];
};

export type WorkspaceRoleKey =
  | "workspace_owner"
  | "workspace_manager"
  | "supervisor"
  | "visitor"
  | "auditor"
  | "viewer";

export type WorkspaceRole = {
  key: WorkspaceRoleKey;
  label: string;
  description: string;
  capabilities: Capability[];
};

export type WorkspaceMember = {
  id: string;
  accountId: string;
  fullName: string;
  email: string;
  roleKey: WorkspaceRoleKey;
  status: "active" | "invited" | "disabled";
};

export type DemoLoginAccount = {
  email: string;
  password: string;
  fullName: string;
  roleKey: WorkspaceRoleKey;
  landingPath: string;
};

export type UserRegistrationStatus =
  | "draft"
  | "email_verified"
  | "pending_workspace_review"
  | "pending_supervisor_review"
  | "pending_social_bureau_review"
  | "approved"
  | "rejected";

export type VisitorRegistrationWorkerGroup = "civil_affairs" | "social_affairs";

export type VisitorRegistrationReviewStatus = "not_sent" | "pending" | "approved" | "rejected";

export type VisitorAuthInviteStatus = "not_sent" | "sent" | "activated" | "failed";

export type VisitorProfileCompletionStatus = "incomplete" | "submitted" | "verified" | "returned";

export type VisitorRemittanceReviewStatus = "pending" | "approved" | "rejected";

export type VisitorRegistrationProfile = {
  rootUnitName: string;
  departmentName: string;
  departmentOther: string | null;
  jobTitle: string;
  jobTitleOther: string | null;
  displayName: string;
  gender: "男" | "女" | "其他";
  nationalId: string;
  workerGroup: VisitorRegistrationWorkerGroup;
  officialEmail: string;
  phone: string;
  trainingCompleted: boolean;
  trainingCompletedAt: string | null;
  visitorCertificateNo: string | null;
  headshotOriginalUrl: string | null;
  headshotProcessedUrl: string | null;
  socialBureauReviewStatus: VisitorRegistrationReviewStatus;
  socialBureauReviewedAt: string | null;
  socialBureauReviewNote: string | null;
  registrationCode: string | null;
  authInviteStatus: VisitorAuthInviteStatus;
  authInvitedAt: string | null;
  authInviteSentCount: number;
  authActivatedAt: string | null;
  profileCompletionStatus: VisitorProfileCompletionStatus;
  profileSubmittedAt: string | null;
  profileReviewedAt: string | null;
  profileReturnReason: string | null;
  visitorCode: string | null;
  qrCodePayload: string | null;
  bankAccountLast5: string | null;
  bankName: string | null;
  bankCode: string | null;
  bankBranchName: string | null;
  bankAccountName: string | null;
  passbookCoverUrl: string | null;
  passbookUploadedAt: string | null;
  remittanceReviewStatus: VisitorRemittanceReviewStatus;
  remittanceReady: boolean;
  note: string | null;
};

export type UserRegistrationRequest = {
  id: string;
  email: string;
  fullName: string;
  requestedUnitName: string;
  requestedWorkspaceId: string | null;
  requestedWorkspaceName: string;
  requestedRoleKey: WorkspaceRoleKey;
  status: UserRegistrationStatus;
  submittedAt: string;
  reviewNote: string | null;
  visitorRegistrationProfile?: VisitorRegistrationProfile;
};

export type VisitorRegistrationSubmission = Omit<
  VisitorRegistrationProfile,
  | "displayName"
  | "socialBureauReviewStatus"
  | "socialBureauReviewedAt"
  | "socialBureauReviewNote"
  | "registrationCode"
  | "authInviteStatus"
  | "authInvitedAt"
  | "authInviteSentCount"
  | "authActivatedAt"
  | "profileCompletionStatus"
  | "profileSubmittedAt"
  | "profileReviewedAt"
  | "profileReturnReason"
  | "visitorCode"
  | "qrCodePayload"
  | "bankAccountLast5"
  | "bankName"
  | "bankCode"
  | "bankBranchName"
  | "bankAccountName"
  | "passbookCoverUrl"
  | "passbookUploadedAt"
  | "remittanceReviewStatus"
  | "remittanceReady"
> & {
  fullName: string;
  email: string;
  requestedWorkspaceId: string | null;
  requestedWorkspaceName: string;
};

export type UserRegistrationDecision = {
  requestId: string;
  decision: "approve" | "reject";
  roleKey: WorkspaceRoleKey;
  workspaceId: string;
  note: string;
};

export type UserRegistrationDecisionResult = {
  requestId: string;
  status: UserRegistrationStatus;
  message: string;
  nextStep: string;
  source?: "supabase";
};

export type UserRegistrationBatchDecision = {
  requestIds: string[];
  decision: "approve";
  workspaceId: string;
  note: string;
};

export type UserRegistrationBatchDecisionResult = {
  total: number;
  approved: number;
  skipped: number;
  failed: number;
  results: UserRegistrationDecisionResult[];
  message: string;
  nextStep: string;
  source?: "supabase";
};

export type VisitorInvitationResult = {
  requestId: string;
  email: string;
  status: VisitorAuthInviteStatus;
  message: string;
  nextStep: string;
};

export type VisitorRegistrationSubmissionResult = {
  request: UserRegistrationRequest;
  message: string;
  nextStep: string;
  source: "supabase";
  warning: string | null;
};

export type WorkspaceModuleKey =
  | "case_import"
  | "assignment"
  | "visit_form"
  | "consent"
  | "audit"
  | "payment"
  | "export"
  | "kpi"
  | "notification";

export type WorkspaceSettings = {
  workspaceId: string;
  workspaceLogo: string;
  workspaceThemeColor: string;
  enabledModules: WorkspaceModuleKey[];
  sponsorSettings: SponsorExposureSettings;
  legalOwnerName: string;
  responsiblePerson: string;
  insuranceInfo: string;
  serviceDisclaimer: string;
  logRetentionMonths: number;
  archiveAfterMonths: number;
  restoreDeadlineDays: number;
};

export type SponsorExposureSettings = {
  enabled: boolean;
  primarySponsorId: string;
  exposureLevel: "subtle" | "standard" | "featured";
  placements: {
    adminHeader: boolean;
    dashboardImpact: boolean;
    publicReportCover: boolean;
    visitorComplete: boolean;
  };
  disclosureText: string;
};

export type DashboardMetric = {
  key: string;
  label: string;
  value: string;
  detail: string;
};

export type ActivityItem = {
  author: string;
  content: string;
  tone: "default" | "system" | "warning";
};

export type ElderCase = {
  id: string;
  caseCode: string;
  name: string;
  age: number;
  gender: string | null;
  phone: string;
  mobilePhone: string | null;
  address: string;
  district: string;
  village: string;
  serviceUnit: string | null;
  lineIdStatus: string | null;
  lineIdNote: string | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  householdCity: string | null;
  householdDistrict: string | null;
  householdVillage: string | null;
  householdAddress: string | null;
  residenceCity: string | null;
  residenceDistrict: string | null;
  residenceVillage: string | null;
  residenceAddress: string | null;
  residenceAddressNote: string | null;
  solitaryStatus: string | null;
  sourceSheetName: string | null;
  sourceRowNumber: number | null;
  importBatchCode: string | null;
  importVisitResult: string | null;
  importVisitorName: string | null;
  requiredVisitorTypes: VisitorWorkerType[];
  coVisitRequired: boolean;
  riskLevel: "low" | "medium" | "high";
  status: "pending" | "assigned" | "visited" | "auditing" | "closed";
};

export type CaseStatusDecision = {
  caseId: string;
  status: ElderCase["status"];
  note: string;
};

export type CaseStatusResult = {
  caseId: string;
  status: ElderCase["status"];
  updatedAt: string;
  message: string;
  activityLog: {
    entityType: "elder_case";
    action: "case_status_update";
  };
};

export type VisitSchedule = {
  id: string;
  workspaceId: string;
  caseId: string;
  visitorId: string;
  coVisitorId: string | null;
  visitDate: string;
  visitAttempt: number;
  status: "pending" | "in_progress" | "submitted" | "needs_follow_up";
  assignmentReason: string;
  requiredFormTemplateIds: string[];
};

export type VisitorWorkerType = "social_affairs" | "civil_affairs" | "general";

export type VisitorProfile = {
  id: string;
  fullName: string;
  workerType: VisitorWorkerType;
  districtCoverage: string[];
  villageCoverage: string[];
  activeTaskCount: number;
  maxDailyTasks: number;
  trainedModules: WorkspaceModuleKey[];
  visitorCertificateNo: string | null;
  certificateStatus: "valid" | "missing" | "expired";
  trainingDate: string | null;
  bankAccountLast5: string | null;
  remittanceReady: boolean;
  status: "available" | "busy" | "inactive";
};

export type AssignmentRecommendation = {
  id: string;
  caseId: string;
  scheduleId: string;
  visitorId: string;
  score: number;
  status: "recommended" | "confirmed" | "manual_review";
  reasons: string[];
  warnings: string[];
};

export type AssignmentDecisionResult = {
  recommendationId: string;
  status: "confirmed" | "manual_review";
  assignedAt: string | null;
  message: string;
  activityLog: {
    entityType: "visit_schedule";
    action: "assignment_confirm" | "assignment_review";
  };
};

export type VisitQuestion = {
  key: string;
  label: string;
  type: "select" | "textarea" | "boolean";
  required: boolean;
  options?: string[];
};

export type VisitSubmission = {
  scheduleId: string;
  visitResult: string;
  healthStatus: string;
  livingStatus: string;
  consentSigned: boolean;
  consentScope: string[];
  signatureDataUrl: string;
  gpsLat: number | null;
  gpsLng: number | null;
  photoNames: string[];
  notes: string;
};

export type ConsentScope =
  | "internal_use"
  | "government_report"
  | "anonymous_kpi"
  | "research_use"
  | "sponsor_reporting";

export type ConsentRecord = {
  id: string;
  caseCode: string;
  elderName: string;
  signed: boolean;
  scopes: ConsentScope[];
  signedDate: string | null;
  expiryDate: string | null;
  revoked: boolean;
  revokedAt: string | null;
  source: "visit_form" | "paper_import" | "guardian_upload";
};

export type ConsentGovernanceResult = {
  purpose: ConsentScope;
  purposeLabel: string;
  allowsPersonalData: boolean;
  warnings: string[];
  redactedColumns: string[];
};

export type LogTier = "active" | "warm_archive" | "cold_archive" | "delete_queue";

export type LogRetentionPolicy = {
  entityType: string;
  label: string;
  tier: LogTier;
  retentionMonths: number;
  archiveAfterMonths: number;
  estimatedRows: number;
  containsPersonalData: boolean;
};

export type AuditCheck = {
  key: string;
  label: string;
  severity: "warning" | "blocking";
  passed: boolean;
  message: string;
};

export type AuditQueueItem = {
  id: string;
  visitRecordId: string;
  scheduleId: string;
  caseCode: string;
  elderName: string;
  submittedAt: string;
  auditState: "ready" | "blocked" | "approved" | "rejected";
  checks: AuditCheck[];
  careformId?: string;
  assignmentId?: string;
  encodedId?: string;
  caseId?: string;
  village?: string;
  visitResult?: string;
  careformStatus?: string;
  completionPct?: number;
  errorLines?: string[];
  exportReady?: boolean;
};

export type AuditDecision = {
  auditId: string;
  decision: "approve" | "reject" | "request_changes";
  supervisorNote: string;
  overrideWarnings: boolean;
};

export type AuditDecisionResult = {
  auditId: string;
  auditState: AuditQueueItem["auditState"];
  nextStep: string;
  decisionLog: {
    entityType: "audit_record";
    action: AuditDecision["decision"];
    createdAt: string;
  };
  payment?: PaymentCalculation;
};

export type PaymentCalculation = {
  visitFee: number;
  dataFee: number;
  auditFee: number;
  otherFee: number;
  totalFee: number;
  status: "draft" | "locked" | "blocked";
  calculationDetail: string[];
};

export type PaymentLockResult = {
  paymentId: string;
  status: "locked" | "blocked";
  lockedAt: string | null;
  message: string;
  exportReady: boolean;
};

export type PaymentBatchItem = {
  id: string;
  caseCode: string;
  elderName: string;
  visitRecordId: string;
  lockedAt: string;
  visitFee: number;
  dataProcessingFee: number;
  totalFee: number;
  status: "locked" | "exported";
};

export type PaymentFeeRule = {
  visitFee: number;
  dataProcessingFee: number;
  totalPerCompletedVisit: number;
  currency: string;
  effectiveFrom: string;
  description: string;
};

export type PaymentBatch = {
  id: string;
  batchNo: string;
  status: "draft" | "ready_for_export" | "exported";
  itemCount: number;
  totalAmount: number;
  items: PaymentBatchItem[];
  warnings: string[];
  createdAt: string;
};

export type KpiStatus = "met" | "watch" | "missed";

export type KpiResultItem = {
  key: string;
  label: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  status: KpiStatus;
  gap: number;
  trend: "up" | "down" | "flat";
};

export type KpiReport = {
  id: string;
  name: string;
  periodLabel: string;
  generatedAt: string;
  items: KpiResultItem[];
  warnings: string[];
};

export type FormFieldType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "multi_select"
  | "boolean"
  | "file"
  | "signature"
  | "gps"
  | "photo";

export type FormFieldDefinition = {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
};

export type FormTemplateSummary = {
  id: string;
  name: string;
  version: string;
  entityType: string;
  fields: FormFieldDefinition[];
  active: boolean;
};

export type WorkflowSummary = {
  id: string;
  name: string;
  entityType: string;
  steps: string[];
  transitions: Array<{
    from: string;
    to: string;
    allowedRoles: string[];
  }>;
  active: boolean;
};

export type ExportTemplateSummary = {
  id: string;
  name: string;
  exportType: "csv" | "xlsx" | "pdf" | "docx";
  entityType: string;
  columns: Array<{
    key: string;
    label: string;
    sourcePath: string;
  }>;
};

export type KpiTemplateSummary = {
  id: string;
  name: string;
  items: Array<{
    key: string;
    label: string;
    targetValue: number;
    currentValue: number;
    unit: string;
  }>;
};

export type IncidentType = "urgent_health" | "safety_risk" | "contact_failed" | "data_issue";

export type IncidentReport = {
  id: string;
  caseCode: string;
  elderName: string;
  incidentType: IncidentType;
  severity: "low" | "medium" | "high";
  status: "open" | "notified" | "resolved";
  description: string;
};

export type IncidentDecision = {
  incidentId: string;
  action: "notify_supervisor" | "resolve";
  note: string;
};

export type IncidentDecisionResult = {
  incidentId: string;
  status: IncidentReport["status"];
  message: string;
  handledAt: string;
  notificationPreview: string | null;
};

export type NotificationTemplate = {
  id: string;
  name: string;
  channel: "in_app" | "email" | "sms" | "line_reserved";
  eventKey: string;
  bodyTemplate: string;
  active: boolean;
};

export type WorkgroupMessageAudience = "public" | "group" | "individual";

export type WorkgroupMessageChannel = "marquee" | "in_app" | "line" | "email";

export type WorkgroupMessageStatus = "draft" | "scheduled" | "published" | "archived";

export type WorkgroupMessage = {
  id: string;
  title: string;
  content: string;
  audience: WorkgroupMessageAudience;
  targetLabel: string;
  channels: WorkgroupMessageChannel[];
  priority: "normal" | "important" | "urgent";
  status: WorkgroupMessageStatus;
  senderName: string;
  publishedAt: string;
  expiresAt: string;
  relatedModule: "audit" | "assignments" | "visits" | "general";
  lineForwarding: boolean;
};

export type WorkgroupMessageRecipient = {
  id: string;
  messageId: string;
  recipientName: string;
  roleLabel: string;
  groupLabel: string;
  readAt: string | null;
  repliedAt: string | null;
};

export type WorkgroupMessageReply = {
  id: string;
  messageId: string;
  authorName: string;
  roleLabel: string;
  content: string;
  createdAt: string;
  source: "in_app" | "line";
};
