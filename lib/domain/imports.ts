export type ImportPreview = {
  columns: string[];
  rows: Array<Record<string, string>>;
  suggestedMappings: Array<{
    sourceColumn: string;
    targetField: string;
    confidence: number;
  }>;
  validation: {
    totalRows: number;
    validRows: number;
    rowsWithWarnings: number;
    warnings: string[];
  };
};

/** 名冊匯入內建範例（含必填欄，可通過檢核；案號以 DEMO- 開頭避免撞正式案號） */
export const SAMPLE_ELDER_CASE_IMPORT_CSV = `測試編號,個案類型,姓名,年齡,戶籍里,訪視行政區,訪視地址,主要電話,備用電話,派案優先級
DEMO-YH-001,獨老,王美玉,82,豫溪里,永和區,新北市永和區豫溪街 12 號,0912-111-001,02-2928-1001,高
DEMO-YH-002,獨老,李國雄,79,竹林里,永和區,新北市永和區竹林路 88 號,0912-111-002,02-2928-1002,中
DEMO-YH-003,中老,陳秀琴,68,安樂里,永和區,新北市永和區安樂路 45 號,0912-111-003,,低`;

export const SAMPLE_ELDER_CASE_IMPORT_FILENAME = "elder-case-import-sample.csv";

const targetHints = [
  { targetField: "case_code", labels: ["測試編號", "個案編號", "個案編碼", "編碼", "案號", "case_code"] },
  { targetField: "case_type", labels: ["個案類型"] },
  { targetField: "service_unit", labels: ["服務單位", "service_unit"] },
  { targetField: "name", labels: ["姓名", "長者姓名", "name"] },
  { targetField: "gender", labels: ["性別", "gender"] },
  { targetField: "national_id", labels: ["身分證", "身分證字號", "id"] },
  { targetField: "birth_date", labels: ["出生", "生日", "出生年月日", "birth"] },
  { targetField: "age", labels: ["年齡", "age"] },
  { targetField: "phone", labels: ["主要電話", "電話", "手機", "phone"] },
  { targetField: "mobile_phone", labels: ["備用電話"] },
  { targetField: "line_id_status", labels: ["Line ID", "line"] },
  { targetField: "line_id_note", labels: ["Line ID 內容", "line_note"] },
  { targetField: "emergency_contact_name", labels: ["緊急聯絡人姓名"] },
  { targetField: "emergency_contact_relationship", labels: ["緊急聯絡人關係"] },
  { targetField: "emergency_contact_phone", labels: ["緊急聯絡人電話"] },
  { targetField: "household_city", labels: ["戶籍縣市"] },
  { targetField: "household_district", labels: ["戶籍行政區", "戶籍區"] },
  { targetField: "household_village", labels: ["戶籍里"] },
  { targetField: "household_address", labels: ["戶籍地址"] },
  { targetField: "address", labels: ["訪視地址", "地址", "住址", "address"] },
  { targetField: "contact_note", labels: ["聯絡人備註"] },
  { targetField: "residence_address_note", labels: ["居住說明"] },
  { targetField: "residence_city", labels: ["居住城市"] },
  { targetField: "residence_district", labels: ["訪視行政區", "居住區"] },
  { targetField: "residence_village", labels: ["居住里"] },
  { targetField: "residence_address", labels: ["居住詳細地址", "居住地址"] },
  { targetField: "district", labels: ["訪視行政區", "行政區", "區域", "district"] },
  { targetField: "village", labels: ["里", "村里", "里別", "village"] },
  { targetField: "risk_level", labels: ["風險", "風險等級", "risk"] },
  { targetField: "assignment_priority", labels: ["派案優先級"] },
  { targetField: "solitary_status", labels: ["獨居資格"] },
  { targetField: "status", labels: ["訪視狀態"] },
  { targetField: "note", labels: ["備註"] },
  { targetField: "data_quality_flag", labels: ["資料品質標記"] },
  { targetField: "import_visit_result", labels: ["訪視結果"] },
  { targetField: "import_visitor_name", labels: ["訪員姓名"] },
];

export function parseCsvPreview(csvText: string): ImportPreview {
  const { columns, rows } = parseCsvRows(csvText);

  return {
    columns,
    rows: rows.slice(0, 10),
    suggestedMappings: suggestMappings(columns),
    validation: validateImportRows(columns, rows),
  };
}

export function parseCsvRows(csvText: string) {
  const records = parseCsvRecords(csvText).filter((record) =>
    record.some((cell) => cell.trim().length > 0),
  );
  const [header = [], ...dataRows] = records;
  const columns = header.map((column, index) =>
    (index === 0 ? column.replace(/^\uFEFF/, "") : column).trim(),
  );
  const rows = dataRows.map((values) =>
    Object.fromEntries(columns.map((column, index) => [column, (values[index] ?? "").trim()])),
  );

  return { columns, rows };
}

export function createImportPreviewFromRows(rows: Array<Record<string, string>>): ImportPreview {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const previewRows = rows.slice(0, 10);

  return {
    columns,
    rows: previewRows,
    suggestedMappings: suggestMappings(columns),
    validation: validateImportRows(columns, rows),
  };
}

function validateImportRows(columns: string[], rows: Array<Record<string, string>>) {
  const mappings = suggestMappings(columns);
  const nameColumn = mappings.find((mapping) => mapping.targetField === "name")?.sourceColumn;
  const addressColumn = mappings.find((mapping) => mapping.targetField === "address")?.sourceColumn;
  const districtColumn =
    mappings.find((mapping) => mapping.targetField === "district")?.sourceColumn ??
    mappings.find((mapping) => mapping.targetField === "residence_district")?.sourceColumn;
  const caseCodeColumn = mappings.find((mapping) => mapping.targetField === "case_code")?.sourceColumn;
  const warnings: string[] = [];
  const seenCaseCodes = new Set<string>();
  let rowsWithWarnings = 0;

  rows.forEach((row, index) => {
    const rowWarnings: string[] = [];
    if (!nameColumn || !row[nameColumn]) rowWarnings.push("姓名");
    if (!addressColumn || !row[addressColumn]) rowWarnings.push("地址");
    if (!districtColumn || !row[districtColumn]) rowWarnings.push("行政區");
    if (!caseCodeColumn || !row[caseCodeColumn]) {
      rowWarnings.push("個案編碼");
    } else if (seenCaseCodes.has(row[caseCodeColumn])) {
      rowWarnings.push("個案編碼重複");
    } else {
      seenCaseCodes.add(row[caseCodeColumn]);
    }
    if (rowWarnings.length > 0) {
      rowsWithWarnings += 1;
      if (warnings.length < 8) {
        warnings.push(`第 ${index + 1} 筆缺少：${rowWarnings.join("、")}`);
      }
    }
  });

  return {
    totalRows: rows.length,
    validRows: rows.length - rowsWithWarnings,
    rowsWithWarnings,
    warnings,
  };
}

function suggestMappings(columns: string[]) {
  return columns.map((column) => {
    const normalized = normalizeLabel(column);
    const exactMatch = targetHints.find((hint) =>
      hint.labels.some((label) => normalizeLabel(label) === normalized),
    );
    const partialMatch =
      exactMatch ??
      targetHints.find((hint) =>
        hint.labels.some((label) => normalized.includes(normalizeLabel(label))),
      );

    return {
      sourceColumn: column,
      targetField: partialMatch?.targetField ?? "custom_field",
      confidence: exactMatch ? 98 : partialMatch ? 90 : 45,
    };
  });
}

function normalizeLabel(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function parseCsvRecords(text: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      record.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || record.length > 0) {
    record.push(cell);
    records.push(record);
  }

  return records;
}
