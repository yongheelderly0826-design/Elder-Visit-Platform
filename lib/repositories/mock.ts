import {
  activityItems,
  dashboardMetrics,
  getCase,
  getCurrentWorkspace,
  getUnit,
  visitSchedules,
  workspaces,
} from "@/lib/domain/mock-data";
import type { AppRepository } from "@/lib/repositories/types";

export const mockRepository: AppRepository = {
  async getCurrentWorkspace() {
    return getCurrentWorkspace();
  },
  async getWorkspaces() {
    return workspaces.map((workspace) => ({
      ...workspace,
      unit: getUnit(workspace.unitId),
    }));
  },
  async getDashboardMetrics() {
    return dashboardMetrics;
  },
  async getActivityItems() {
    return activityItems;
  },
  async getVisitorTasks() {
    return visitSchedules.flatMap((schedule) => {
      const elderCase = getCase(schedule.caseId);

      if (!elderCase) {
        return [];
      }

      return [{ schedule, elderCase }];
    });
  },
  async getVisitTask(scheduleId: string) {
    const tasks = await this.getVisitorTasks();
    return tasks.find((task) => task.schedule.id === scheduleId) ?? null;
  },
  async getCaseRegistry() {
    const { getCaseRegistry } = await import("@/lib/domain/cases");
    return getCaseRegistry();
  },
  async getCaseRegistrySummary() {
    const { getCaseRegistrySummary } = await import("@/lib/domain/cases");
    return getCaseRegistrySummary();
  },
  async getAssignmentDashboard() {
    const { getAssignmentRecommendations, visitors } = await import("@/lib/domain/assignments");
    const { elderCases } = await import("@/lib/domain/mock-data");
    return {
      visitors,
      recommendations: getAssignmentRecommendations(),
      cases: elderCases,
    };
  },
  async confirmAssignment(recommendationId: string, _visitorId?: string) {
    const { confirmAssignment } = await import("@/lib/domain/assignments");
    return confirmAssignment(recommendationId);
  },
  async getPaymentBatchPreview() {
    const { createPaymentBatchPreview, paymentFeeRules } = await import("@/lib/domain/payments");
    return {
      batch: createPaymentBatchPreview(),
      feeRule: paymentFeeRules,
    };
  },
  async createPaymentBatch() {
    const { createPaymentBatch, paymentFeeRules } = await import("@/lib/domain/payments");
    return {
      batch: createPaymentBatch(),
      feeRule: paymentFeeRules,
    };
  },
};
