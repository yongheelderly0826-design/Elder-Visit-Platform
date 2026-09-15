import { evaluateHighCare, type HighCareStatus } from "@/lib/domain/high-care-rules";
import { mohwLifeCareSampleAnswers } from "@/lib/domain/mohw-life-care-ui";

export type HighCareRecord = {
  high_care_id: string;
  case_id: string;
  careform_id: string;
  assignment_id: string;
  encoded_id: string;
  elder_name: string;
  colors: string;
  primary_color: string;
  trigger_keys: string;
  trigger_labels: string;
  trigger_values: string;
  opened_at: string;
  status: HighCareStatus;
  owner: string;
  note: string;
  last_visit_triggered: boolean;
  updated_at: string;
};

const demoEval = evaluateHighCare(mohwLifeCareSampleAnswers);

export const highCareDemoRecords: HighCareRecord[] = [
  {
    high_care_id: "HC-DEMO-001",
    case_id: "NTPC-115-TEST-001",
    careform_id: "CF-DEMO-001",
    assignment_id: "schedule_ntpc_demo",
    encoded_id: "YH-115-DEMO-001",
    elder_name: String(mohwLifeCareSampleAnswers.name ?? "吳秀枝"),
    colors: demoEval.colors.join(";"),
    primary_color: demoEval.primaryColor ?? "綠",
    trigger_keys: demoEval.triggers.map((item) => item.key).join(";"),
    trigger_labels: demoEval.triggers.map((item) => `${item.color}:${item.label}`).join("；"),
    trigger_values: demoEval.triggers.map((item) => item.value).join("；"),
    opened_at: "2026-05-22T10:40:00+08:00",
    status: "追蹤中",
    owner: "",
    note: "示範：紙本色塊自動列入",
    last_visit_triggered: true,
    updated_at: "2026-05-22T10:40:00+08:00",
  },
  {
    high_care_id: "HC-DEMO-002",
    case_id: "CASE-YH-ORANGE",
    careform_id: "CF-DEMO-002",
    assignment_id: "schedule_orange",
    encoded_id: "YH-115-ORANGE",
    elder_name: "林阿添",
    colors: "橘",
    primary_color: "橘",
    trigger_keys: "mental_status",
    trigger_labels: "橘:訪談中提到自殺意念",
    trigger_values: "在訪談過程中，長者有提到自殺意念",
    opened_at: "2026-06-03T09:10:00+08:00",
    status: "已轉介",
    owner: "督導王",
    note: "已轉心理健康資源",
    last_visit_triggered: true,
    updated_at: "2026-06-04T14:00:00+08:00",
  },
];

export function summarizeHighCareRecords(rows: HighCareRecord[]) {
  return {
    total: rows.length,
    橘: rows.filter((row) => row.colors.includes("橘")).length,
    黃: rows.filter((row) => row.colors.includes("黃")).length,
    綠: rows.filter((row) => row.colors.includes("綠")).length,
    追蹤中: rows.filter((row) => row.status === "追蹤中").length,
    已轉介: rows.filter((row) => row.status === "已轉介").length,
    已結案: rows.filter((row) => row.status === "已結案").length,
  };
}
