import { exportTemplates } from "@/lib/domain/engines";
import {
  evaluateExportConsent,
  redactExportCell,
} from "@/lib/domain/consent";
import { buildMohwLifeCareExportRow } from "@/lib/domain/mohw-life-care-export";
import { mohwLifeCareSampleAnswers } from "@/lib/domain/mohw-life-care-ui";
import type { ConsentScope } from "@/lib/domain/types";

const mockRows: Record<string, string>[] = [
  buildMohwLifeCareExportRow({
    mohwAnswers: mohwLifeCareSampleAnswers,
    visitMeta: {
      visitDate: "2026-05-22",
      visitStartTime: "09:30",
      visitEndTime: "10:30",
      visitStatus: "已完成",
      notes: "首訪",
      consentPersonalData: true,
      consentHealthDb: true,
      consentSignature: true,
    },
    caseRegistry: {
      name: "吳秀枝",
      nationalId: "F123456789",
      birthDate: "1942-03-18",
      householdCity: "新北市",
      householdDistrict: "板橋區",
      householdVillage: "文化里",
      householdAddress: "文化路一段 100 號",
      livingCity: "新北市",
      livingDistrict: "板橋區",
      livingVillage: "文化里",
      livingAddress: "文化路一段 100 號",
    },
  }).keyed,
  buildMohwLifeCareExportRow({
    visitMeta: {
      visitDate: "2026-05-23",
      visitStartTime: "14:00",
      visitStatus: "查無此人",
      notes: "未遇三次",
    },
    caseRegistry: {
      name: "陳水木",
      nationalId: "B234567890",
      birthDate: "1948-11-03",
      householdCity: "新北市",
      householdDistrict: "永和區",
      householdVillage: "保平里",
      householdAddress: "保平路 20 號",
    },
  }).keyed,
];

export function getExportTemplate(templateId: string) {
  return exportTemplates.find((template) => template.id === templateId) ?? exportTemplates[0];
}

export function createExportPreview(
  templateId: string,
  purpose: ConsentScope = "government_report",
) {
  const template = getExportTemplate(templateId);
  const governance = evaluateExportConsent(template, purpose);
  const headers = template.columns.map((column) => column.label);
  const keys = template.columns.map((column) => column.key);
  const rows = mockRows.map((row) =>
    keys.map((key) => redactExportCell(key, row[key] ?? "", governance)),
  );

  return {
    template,
    governance,
    headers,
    rows,
  };
}

export function createCsvExport(
  templateId: string,
  purpose: ConsentScope = "government_report",
) {
  const preview = createExportPreview(templateId, purpose);
  const lines = [
    preview.headers.join(","),
    ...preview.rows.map((row) => row.map(escapeCsvCell).join(",")),
  ];

  return {
    filename: `${preview.template.id}.csv`,
    content: lines.join("\n"),
    governance: preview.governance,
  };
}

function escapeCsvCell(cell: string) {
  if (cell.includes(",") || cell.includes("\"") || cell.includes("\n")) {
    return `"${cell.replaceAll("\"", "\"\"")}"`;
  }

  return cell;
}
