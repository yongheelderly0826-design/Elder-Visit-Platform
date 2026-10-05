export type ManagementWorkflowCountValues = {
  pendingAssignments: number;
  inProgressVisits: number;
  pendingFollowUp: number;
  pendingAudit: number;
  pendingExport: number;
};

export type ManagementWorkflowCounts = {
  pendingAssignments?: string;
  inProgressVisits?: string;
  pendingFollowUp?: string;
  pendingAudit?: string;
  pendingExport?: string;
};

export function formatWorkflowCounts(
  values: ManagementWorkflowCountValues,
): ManagementWorkflowCounts {
  return {
    pendingAssignments: `${values.pendingAssignments} 件`,
    inProgressVisits: `${values.inProgressVisits} 件`,
    pendingFollowUp: `${values.pendingFollowUp} 件`,
    pendingAudit: `${values.pendingAudit} 件`,
    pendingExport: `${values.pendingExport} 件已核准`,
  };
}
