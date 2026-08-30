import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/api/authorization";
import { parseCsvRows } from "@/lib/domain/imports";
import { gasClient, isGasConfigured } from "@/lib/gas-client";
import { getSystemStatus } from "@/lib/system/env";
import { createAdminClient } from "@/lib/supabase/admin";

type WorkspaceRow = {
  id: string;
  unit_id: string;
};

type ExistingCaseRow = {
  case_code: string;
};

type ElderCaseInsertRow = {
  unit_id: string;
  workspace_id: string;
  case_code: string;
  name: string;
  id_number: string | null;
  birth_date: string | null;
  phone: string | null;
  mobile_phone: string | null;
  address: string | null;
  district: string | null;
  village: string | null;
  risk_level: string | null;
  status: string;
  household_city: string | null;
  household_district: string | null;
  household_village: string | null;
  household_address: string | null;
  residence_city: string | null;
  residence_district: string | null;
  residence_village: string | null;
  residence_address: string | null;
  residence_address_note: string | null;
  solitary_status: string | null;
  source_sheet_name: string | null;
  source_row_number: number;
  import_batch_code: string;
  raw_import_data: Record<string, unknown>;
};

type ImportSupabaseClient = {
  from(table: "workspaces"): {
    select(query: string): {
      eq(column: string, value: string): {
        order(column: string, options: { ascending: boolean }): {
          limit(count: number): {
            maybeSingle(): Promise<{ data: WorkspaceRow | null; error: unknown }>;
          };
        };
      };
    };
  };
  from(table: "elder_cases"): {
    select(query: string): {
      eq(column: string, value: string): {
        in(column: string, values: string[]): Promise<{ data: ExistingCaseRow[] | null; error: unknown }>;
      };
    };
    insert(rows: ElderCaseInsertRow[]): Promise<{ data: unknown; error: unknown }>;
  };
};

export async function POST(request: NextRequest) {
  const forbidden = requireCapability(request, "cases.import");
  if (forbidden) return forbidden;

  const body = (await request.json()) as { csvText?: string; fileName?: string };
  const csvText = body.csvText?.trim() ?? "";

  if (!csvText) {
    return NextResponse.json({ error: { message: "未收到可寫入的 CSV 內容。" } }, { status: 400 });
  }

  const { columns, rows } = parseCsvRows(csvText);
  const normalizedRows = rows
    .map((row, index) => normalizeImportRow(row, index, body.fileName ?? "CSV"))
    .filter((row): row is NormalizedImportRow => row !== null);

  if (normalizedRows.length === 0) {
    return NextResponse.json({ error: { message: "沒有可寫入的有效資料。" } }, { status: 400 });
  }

  const duplicateCodes = findDuplicateCodes(normalizedRows.map((row) => row.caseCode));
  if (duplicateCodes.length > 0) {
    return NextResponse.json(
      {
        error: {
          message: `CSV 內有重複個案編碼：${duplicateCodes.slice(0, 8).join("、")}`,
        },
      },
      { status: 400 },
    );
  }

  if (getSystemStatus().dataMode === "gas_ready" && isGasConfigured()) {
    const gasRows = normalizedRows.map((row) => ({
      external_id: row.caseCode,
      case_type: mapCaseTypeLabel(row.caseType),
      name: row.name,
      id_number: row.nationalId,
      age: row.age ?? "",
      household_district: row.householdDistrict ?? "永和區",
      household_village: row.householdVillage ?? "",
      visit_district: row.visitDistrict ?? "永和區",
      visit_village: row.householdVillage ?? "",
      address: row.visitAddress,
      primary_phone: row.primaryPhone ?? "",
      secondary_phone: row.backupPhone ?? "",
      contact_note: row.contactNote ?? row.note ?? "",
      visit_status: "待訪",
      dispatch_priority: mapPriorityLabel(row.assignmentPriority),
      data_quality_tag: row.dataQualityFlag ?? "",
    }));

    const result = await gasClient.cases.import({ rows: gasRows });
    const batchCode = createImportBatchCode();

    return NextResponse.json({
      data: {
        batchCode,
        totalRows: rows.length,
        parsedRows: normalizedRows.length,
        insertedRows: result.imported,
        skippedRows: normalizedRows.length - result.imported,
        skippedCaseCodes: [],
        columns,
        mode: "gas",
      },
    });
  }

  const supabase = createAdminClient() as unknown as ImportSupabaseClient;
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, unit_id")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (workspaceError || !workspace) {
    return NextResponse.json(
      { error: { message: "找不到可寫入的工作空間，請先確認工作空間設定。" } },
      { status: 500 },
    );
  }

  const existingCodes = await getExistingCaseCodes(
    supabase,
    workspace.id,
    normalizedRows.map((row) => row.caseCode),
  );
  const skippedRows = normalizedRows.filter((row) => existingCodes.has(row.caseCode));
  const rowsToInsert = normalizedRows.filter((row) => !existingCodes.has(row.caseCode));
  const batchCode = createImportBatchCode();
  const insertRows = rowsToInsert.map((row) => toElderCaseInsertRow(row, workspace, batchCode));

  if (insertRows.length > 0) {
    const { error: insertError } = await supabase.from("elder_cases").insert(insertRows);
    if (insertError) {
      return NextResponse.json(
        {
          error: {
            message: "寫入 Supabase 失敗，請確認 0033 欄位 migration 已執行。",
            detail: String(insertError),
          },
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    data: {
      batchCode,
      totalRows: rows.length,
      parsedRows: normalizedRows.length,
      insertedRows: insertRows.length,
      skippedRows: skippedRows.length,
      skippedCaseCodes: skippedRows.slice(0, 20).map((row) => row.caseCode),
      columns,
      mode: "supabase",
    },
  });
}

function mapCaseTypeLabel(caseType: string) {
  if (caseType === "solitary_elder" || caseType === "獨老") return "獨老";
  if (caseType === "middle_elder" || caseType === "中老") return "中老";
  return caseType || "獨老";
}

function mapPriorityLabel(priority: string | null) {
  if (!priority) return "中";
  if (priority === "urgent" || priority === "緊急" || priority === "高") return "高";
  if (priority === "medium_high" || priority === "中高") return "中";
  if (priority === "low" || priority === "低") return "低";
  return priority;
}

type NormalizedImportRow = {
  rowNumber: number;
  sourceFile: string;
  caseCode: string;
  caseType: string;
  name: string;
  age: number | null;
  nationalId: string | null;
  householdDistrict: string | null;
  householdVillage: string | null;
  visitDistrict: string | null;
  visitAddress: string | null;
  primaryPhone: string | null;
  backupPhone: string | null;
  contactNote: string | null;
  visitStatus: string | null;
  assignmentPriority: string | null;
  note: string | null;
  dataQualityFlag: string | null;
  raw: Record<string, string>;
};

function normalizeImportRow(
  row: Record<string, string>,
  index: number,
  sourceFile: string,
): NormalizedImportRow | null {
  const caseCode = getCell(row, ["external_id", "測試編號", "個案編號", "個案編碼", "案號"]);
  const name = getCell(row, ["name", "姓名", "長者姓名"]);
  const visitAddress = getCell(row, ["visit_address", "訪視地址", "地址", "住址"]);
  const visitDistrict = getCell(row, ["visit_district", "訪視行政區", "district", "行政區", "區域"]);

  if (!caseCode || !name || !visitAddress || !visitDistrict) {
    return null;
  }

  return {
    rowNumber: index + 2,
    sourceFile,
    caseCode,
    caseType: getCell(row, ["case_type", "個案類型"]) ?? "",
    name,
    age: parseAge(getCell(row, ["age", "年齡"])),
    nationalId: getCell(row, ["id_number", "身分證號", "身分證字號", "身分證"]),
    householdDistrict: getCell(row, ["household_district", "戶籍行政區", "戶籍區", "district"]),
    householdVillage: getCell(row, ["village", "household_village", "戶籍里"]),
    visitDistrict,
    visitAddress,
    primaryPhone: getCell(row, ["primary_phone", "主要電話", "電話", "手機"]),
    backupPhone: getCell(row, ["secondary_phone", "備用電話"]),
    contactNote: getCell(row, ["contact_note", "聯絡人備註"]),
    visitStatus: getCell(row, ["visit_status", "訪視狀態"]),
    assignmentPriority: getCell(row, ["dispatch_priority", "派案優先級", "風險等級"]),
    note: getCell(row, ["remark", "備註"]),
    dataQualityFlag: getCell(row, ["data_quality_tag", "資料品質標記"]),
    raw: row,
  };
}

function toElderCaseInsertRow(
  row: NormalizedImportRow,
  workspace: WorkspaceRow,
  batchCode: string,
): ElderCaseInsertRow {
  return {
    unit_id: workspace.unit_id,
    workspace_id: workspace.id,
    case_code: row.caseCode,
    name: row.name,
    id_number: row.nationalId,
    birth_date: deriveBirthDate(row.age),
    phone: row.primaryPhone,
    mobile_phone: row.backupPhone,
    address: row.visitAddress,
    district: row.visitDistrict,
    village: row.householdVillage,
    risk_level: mapPriorityToRiskLevel(row.assignmentPriority),
    status: mapVisitStatus(row.visitStatus),
    household_city: "新北市",
    household_district: row.householdDistrict,
    household_village: row.householdVillage,
    household_address: null,
    residence_city: inferCity(row.visitAddress),
    residence_district: row.visitDistrict,
    residence_village: row.householdVillage,
    residence_address: row.visitAddress,
    residence_address_note: row.contactNote,
    solitary_status: mapSolitaryStatus(row.caseType, row.note),
    source_sheet_name: row.sourceFile,
    source_row_number: row.rowNumber,
    import_batch_code: batchCode,
    raw_import_data: {
      ...row.raw,
      source_file: row.sourceFile,
      source_row_number: row.rowNumber,
      imported_case_type: row.caseType,
      imported_age: row.age,
      imported_visit_status: row.visitStatus,
      imported_assignment_priority: row.assignmentPriority,
      imported_data_quality_flag: row.dataQualityFlag,
      birth_date_basis: row.age ? "age_year_estimate" : null,
    },
  };
}

async function getExistingCaseCodes(
  supabase: ImportSupabaseClient,
  workspaceId: string,
  caseCodes: string[],
) {
  const existingCodes = new Set<string>();
  const chunkSize = 100;

  for (let index = 0; index < caseCodes.length; index += chunkSize) {
    const chunk = caseCodes.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from("elder_cases")
      .select("case_code")
      .eq("workspace_id", workspaceId)
      .in("case_code", chunk);

    if (error) {
      throw error;
    }

    data?.forEach((row) => existingCodes.add(row.case_code));
  }

  return existingCodes;
}

function getCell(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const exactValue = row[key];
    if (exactValue?.trim()) return exactValue.trim();

    const matchingKey = Object.keys(row).find((candidate) => candidate.trim() === key);
    const matchingValue = matchingKey ? row[matchingKey] : "";
    if (matchingValue?.trim()) return matchingValue.trim();
  }

  return null;
}

function parseAge(value: string | null) {
  if (!value) return null;
  const age = Number.parseInt(value, 10);
  return Number.isFinite(age) ? age : null;
}

function deriveBirthDate(age: number | null) {
  if (!age || age < 1) return null;
  const currentYear = new Date().getFullYear();
  return `${currentYear - age}-01-01`;
}

function mapPriorityToRiskLevel(priority: string | null) {
  if (priority === "緊急" || priority === "高" || priority === "urgent") return "high";
  if (priority === "中高" || priority === "中" || priority === "medium_high") return "medium";
  if (priority === "一般" || priority === "低" || priority === "low") return "low";
  return priority ?? "medium";
}

function mapVisitStatus(status: string | null) {
  if (!status || status === "待派案" || status === "pending_dispatch") return "pending";
  if (status.includes("已派")) return "assigned";
  if (status.includes("完成")) return "completed";
  return "pending";
}

function mapSolitaryStatus(caseType: string, note: string | null) {
  if (caseType === "獨老" || caseType === "solitary_elder") {
    return note?.includes("獨居資格") ? "獨居資格待確認" : "獨居";
  }
  if (caseType === "中老" || caseType === "middle_elder") return "中老訪視候選";
  return caseType || null;
}

function inferCity(address: string | null) {
  if (!address) return "新北市";
  const match = address.match(/^(.*?[市縣])/);
  return match?.[1] ?? "新北市";
}

function findDuplicateCodes(caseCodes: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  caseCodes.forEach((caseCode) => {
    if (seen.has(caseCode)) {
      duplicates.add(caseCode);
    }
    seen.add(caseCode);
  });

  return Array.from(duplicates);
}

function createImportBatchCode() {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "");
  return `CASE-${timestamp}`;
}
