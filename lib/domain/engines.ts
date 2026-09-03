import { MOHW_LIFE_CARE_COLUMNS } from "@/lib/domain/mohw-life-care-form";
import type {
  ExportTemplateSummary,
  FormTemplateSummary,
  KpiTemplateSummary,
  WorkflowSummary,
} from "@/lib/domain/types";

export const formTemplates: FormTemplateSummary[] = [
  {
    id: "form_elder_visit_v1",
    name: "獨居長者訪查表",
    version: "1.0.0",
    entityType: "visit_record",
    active: true,
    fields: [
      { key: "visit_result", label: "訪查結果", type: "select", required: true },
      { key: "health_status", label: "健康狀況", type: "select", required: true },
      { key: "living_status", label: "生活支持", type: "select", required: true },
      { key: "signature", label: "同意簽名", type: "signature", required: true },
      { key: "gps", label: "定位", type: "gps", required: false },
      { key: "photo", label: "照片", type: "photo", required: false },
    ],
  },
  {
    id: "form_incident_v1",
    name: "異常通報表",
    version: "1.0.0",
    entityType: "incident_report",
    active: true,
    fields: [
      { key: "incident_type", label: "異常類型", type: "select", required: true },
      { key: "description", label: "說明", type: "text", required: true },
      { key: "photo", label: "照片", type: "photo", required: false },
    ],
  },
];

export const workflowTemplates: WorkflowSummary[] = [
  {
    id: "workflow_visit_v1",
    name: "訪查流程",
    entityType: "visit_record",
    active: true,
    steps: ["assigned", "in_progress", "submitted", "auditing", "approved", "payment_ready"],
    transitions: [
      { from: "assigned", to: "in_progress", allowedRoles: ["visitor"] },
      { from: "in_progress", to: "submitted", allowedRoles: ["visitor"] },
      { from: "submitted", to: "auditing", allowedRoles: ["supervisor", "workspace_manager"] },
      { from: "auditing", to: "approved", allowedRoles: ["supervisor"] },
    ],
  },
  {
    id: "workflow_payment_v1",
    name: "核銷流程",
    entityType: "payment_record",
    active: true,
    steps: ["draft", "calculated", "audited", "locked", "exported"],
    transitions: [
      { from: "draft", to: "calculated", allowedRoles: ["workspace_manager"] },
      { from: "calculated", to: "audited", allowedRoles: ["supervisor"] },
      { from: "audited", to: "locked", allowedRoles: ["workspace_manager"] },
    ],
  },
];

export const exportTemplates: ExportTemplateSummary[] = [
  {
    id: "export_visit_result_v1",
    name: "訪查成果 CSV",
    exportType: "csv",
    entityType: "visit_record",
    columns: [
      { key: "case_code", label: "案號", sourcePath: "elder_cases.case_code" },
      { key: "name", label: "姓名", sourcePath: "elder_cases.name" },
      { key: "visit_result", label: "訪查結果", sourcePath: "visit_records.visit_result" },
      { key: "audit_result", label: "稽核結果", sourcePath: "audit_records.audit_result" },
    ],
  },
  {
    id: "export_care_visit_checked_docx_v1",
    name: "已填關懷表 DOCX 對照",
    exportType: "docx",
    entityType: "visit_record",
    columns: [
      { key: "case_code", label: "案號", sourcePath: "elder_cases.case_code" },
      { key: "name", label: "姓名", sourcePath: "elder_cases.name" },
      { key: "visit_time", label: "訪查時間", sourcePath: "visit_records.visit_date" },
      { key: "visit_result", label: "訪查結果", sourcePath: "visit_records.visit_result" },
      { key: "health_self_rating", label: "健康狀況自評", sourcePath: "visit_form_answers.health_self_rating" },
      { key: "living_status", label: "居住狀況", sourcePath: "visit_form_answers.living_status" },
      { key: "special_color_result", label: "特殊題項結果", sourcePath: "visit_form_answers.special_color_result" },
    ],
  },
  {
    id: "export_central_system_excel_v1",
    name: "社會局中央系統匯入 Excel（102 欄）",
    exportType: "xlsx",
    entityType: "visit_record",
    columns: MOHW_LIFE_CARE_COLUMNS.map((column) => ({
      key: column.key,
      label: column.header,
      sourcePath: `mohw_life_care.${column.key}`,
    })),
  },
  {
    id: "export_payment_v1",
    name: "核銷報表 XLSX",
    exportType: "xlsx",
    entityType: "payment_record",
    columns: [
      { key: "case_code", label: "案號", sourcePath: "elder_cases.case_code" },
      { key: "visit_fee", label: "訪查費", sourcePath: "payment_records.visit_fee" },
      { key: "total_fee", label: "總金額", sourcePath: "payment_records.total_fee" },
    ],
  },
];

export const kpiTemplates: KpiTemplateSummary[] = [
  {
    id: "kpi_elder_visit_v1",
    name: "獨居長者訪查 KPI",
    items: [
      { key: "completion_rate", label: "訪查完成率", targetValue: 85, currentValue: 62, unit: "%" },
      { key: "refusal_rate", label: "拒訪率", targetValue: 8, currentValue: 4, unit: "%" },
      { key: "audit_accuracy", label: "核銷準確率", targetValue: 98, currentValue: 93, unit: "%" },
      { key: "follow_up_hours", label: "高風險追蹤時效", targetValue: 24, currentValue: 18, unit: "小時" },
    ],
  },
];
