import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MOHW_LIFE_CARE_COLUMNS,
  MOHW_LIFE_CARE_HEADERS,
  type MohwLifeCareAnswers,
} from "../lib/domain/mohw-life-care-form";
import { buildMohwLifeCareExportRow, formatMohwCell } from "../lib/domain/mohw-life-care-export";
import { validateMohwLifeCareRow } from "../lib/domain/mohw-life-care-validation";
import {
  MOHW_IMPORT_TEMPLATE_HEADERS,
  mohwHeadersMatchTemplate,
} from "../lib/domain/mohw-life-care-template";

type Gold = { headers: string[]; rows: string[][] };

const gold = JSON.parse(readFileSync("/tmp/mohw_gold_first4.json", "utf8")) as Gold;
const outDir = resolve(process.env.HOME || "", "Downloads/永和養老/outputs/紙本關懷表辨識");

function answersFromGold(row: string[]): MohwLifeCareAnswers {
  const answers: MohwLifeCareAnswers = {};
  for (let i = 0; i < MOHW_LIFE_CARE_COLUMNS.length; i += 1) {
    const col = MOHW_LIFE_CARE_COLUMNS[i];
    const value = row[i] ?? "";
    if (!value) continue;
    if (value.includes(";") && /複選|多選/.test(`${col.inputType}${col.allowedValues}`)) {
      answers[col.key] = value.split(";").map((part) => part.trim()).filter(Boolean);
    } else {
      answers[col.key] = value;
    }
  }
  return answers;
}

const headerDiffSchema: Array<{ i: number; schema: string; gold: string }> = [];
const headerDiffTemplate: Array<{ i: number; template: string; gold: string }> = [];
for (let i = 0; i < gold.headers.length; i += 1) {
  if (MOHW_LIFE_CARE_HEADERS[i] !== gold.headers[i]) {
    headerDiffSchema.push({ i: i + 1, schema: MOHW_LIFE_CARE_HEADERS[i], gold: gold.headers[i] });
  }
  if (MOHW_IMPORT_TEMPLATE_HEADERS[i] !== gold.headers[i]) {
    headerDiffTemplate.push({
      i: i + 1,
      template: MOHW_IMPORT_TEMPLATE_HEADERS[i],
      gold: gold.headers[i],
    });
  }
}

const people = gold.rows.map((row, index) => {
  const answers = answersFromGold(row);
  const exported = buildMohwLifeCareExportRow({ mohwAnswers: answers });
  const cellDiffs = [];
  for (let i = 0; i < gold.headers.length; i += 1) {
    const expected = String(row[i] ?? "");
    const actual = String(exported.values[i] ?? "");
    if (expected !== actual) {
      const col = MOHW_LIFE_CARE_COLUMNS[i];
      cellDiffs.push({
        col: i + 1,
        header: gold.headers[i],
        key: col.key,
        expected,
        actual,
        formatExpected: formatMohwCell(
          expected.includes(";") ? expected.split(";") : expected,
          col,
        ),
      });
    }
  }

  const validation = validateMohwLifeCareRow(answers, {
    registryIds: [String(answers.national_id || "")].filter(Boolean),
  });

  return {
    index: index + 1,
    name: row[5],
    nationalId: row[8],
    exportExactMatch: cellDiffs.length === 0,
    mismatchCount: cellDiffs.length,
    cellDiffs,
    validationOk: validation.ok,
    errors: validation.errors ?? [],
  };
});

const report = {
  goldSourceFiles: [
    "生活關懷表_17人逐人分頁補件表(已修正前四位）.xlsx",
    "生活關懷表_前4位校正後_匯入格式檢核.xlsx（生活關懷表匯入＝103欄黃金輸出）",
  ],
  generatedAt: new Date().toISOString(),
  header: {
    goldCount: gold.headers.length,
    schemaMatchGold: headerDiffSchema.length === 0,
    templateMatchGold: headerDiffTemplate.length === 0,
    schemaMatchTemplate: mohwHeadersMatchTemplate(MOHW_LIFE_CARE_HEADERS),
    headerDiffSchema,
    headerDiffTemplate,
  },
  people,
  summary: {
    header100: headerDiffSchema.length === 0 && headerDiffTemplate.length === 0,
    exportData100: people.every((person) => person.exportExactMatch),
    validation100: people.every((person) => person.validationOk),
    all100:
      headerDiffSchema.length === 0 &&
      headerDiffTemplate.length === 0 &&
      people.every((person) => person.exportExactMatch && person.validationOk),
  },
};

writeFileSync("/tmp/mohw_gold_compare_round2.json", JSON.stringify(report, null, 2));

const lines = ["姓名,欄位序,欄位名稱,黃金標準值,系統匯出值,是否相同,檢核結果"];
for (const person of people) {
  if (person.exportExactMatch) {
    lines.push(
      [
        person.name,
        "",
        "(全部103欄)",
        "",
        "",
        "是",
        person.validationOk ? "通過" : "未通過",
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(","),
    );
  } else {
    for (const diff of person.cellDiffs) {
      lines.push(
        [
          person.name,
          diff.col,
          diff.header,
          diff.expected,
          diff.actual,
          "否",
          person.validationOk ? "通過" : "未通過",
        ]
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(","),
      );
    }
  }
}

// Full 412-cell matrix (4 people × 103 columns) — always written for audit.
const detailLines = ["姓名,欄位序,欄位名稱,黃金標準值,系統往返匯出值,是否相同"];
let totalCells = 0;
let sameCells = 0;
for (let p = 0; p < gold.rows.length; p += 1) {
  const row = gold.rows[p];
  const exported = buildMohwLifeCareExportRow({
    mohwAnswers: answersFromGold(row),
  });
  for (let i = 0; i < gold.headers.length; i += 1) {
    totalCells += 1;
    const expected = String(row[i] ?? "");
    const actual = String(exported.values[i] ?? "");
    const ok = expected === actual;
    if (ok) sameCells += 1;
    detailLines.push(
      [row[5], i + 1, gold.headers[i], expected, actual, ok ? "是" : "否"]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(","),
    );
  }
}

const summaryLines = ["檢查項目,結果,說明"];
for (const person of people) {
  summaryLines.push(
    [
      `${person.name} 往返匯出`,
      person.exportExactMatch && person.validationOk ? "100%相同" : "有差異",
      `檢核${person.validationOk ? "通過" : "失敗"}；差異欄位數 ${person.mismatchCount}`,
    ]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(","),
  );
}
summaryLines.push(
  [
    "表頭與黃金標準",
    report.summary.header100 ? "100%相同" : "有差異",
    "schema / template 與黃金標準 103 欄逐字比對",
  ]
    .map((value) => `"${String(value).replaceAll('"', '""')}"`)
    .join(","),
);
summaryLines.push(
  [
    "總結",
    report.summary.all100 ? "100%符合黃金標準" : `相同 ${sameCells}/${totalCells}`,
    `共比對 ${totalCells} 格（4人×103欄）`,
  ]
    .map((value) => `"${String(value).replaceAll('"', '""')}"`)
    .join(","),
);

const csvPath = resolve(outDir, "關懷表匯出_黃金標準比對表.csv");
const summaryPath = resolve(outDir, "關懷表匯出_黃金標準檢查摘要.csv");
const diffsOnlyPath = resolve(outDir, "關懷表匯出_黃金標準差異明細.csv");
writeFileSync(csvPath, `\uFEFF${detailLines.join("\r\n")}\r\n`);
writeFileSync(summaryPath, `\uFEFF${summaryLines.join("\r\n")}\r\n`);
writeFileSync(diffsOnlyPath, `\uFEFF${lines.join("\r\n")}\r\n`);

const reportMd = `# 生活關懷表匯出 × 黃金標準檢查報告

生成時間：${report.generatedAt}

## 黃金標準來源

- \`生活關懷表_17人逐人分頁補件表(已修正前四位）.xlsx\`（前四位校正來源）
- \`生活關懷表_前4位校正後_匯入格式檢核.xlsx\` → 工作表 \`生活關懷表匯入\`（103 欄可匯入輸出）
- 前四位：王梅子、邱坤保、宋純明、陳美慧

## 檢查結果

| 項目 | 結果 |
|---|---|
| 表頭（103欄） | ${report.summary.header100 ? "**100% 相同**" : "有差異"} |
| 4 人 × 103 欄往返匯出 | **${sameCells}/${totalCells}** |
| 格式檢核（validate） | ${report.summary.validation100 ? "**4/4 通過**" : "未全部通過"} |
| 總結 | ${report.summary.all100 ? "**100% 符合黃金標準**" : "尚未完全一致"} |

## 產出檔

- \`關懷表匯出_黃金標準比對表.csv\` — 412 格逐欄比對
- \`關懷表匯出_黃金標準檢查摘要.csv\` — 每人／總結
- \`關懷表匯出_黃金標準差異明細.csv\` — 僅列差異（全符合時為摘要列）
`;
writeFileSync(resolve(outDir, "關懷表匯出_黃金標準檢查報告.md"), reportMd);

console.log(JSON.stringify(report.summary, null, 2));
console.log({ totalCells, sameCells, pct: `${((100 * sameCells) / totalCells).toFixed(2)}%` });
for (const person of people) {
  console.log(
    person.name,
    "match",
    person.exportExactMatch,
    "diffs",
    person.mismatchCount,
    "validation",
    person.validationOk,
    "errors",
    person.errors.length,
  );
  if (!person.exportExactMatch) {
    console.log(JSON.stringify(person.cellDiffs.slice(0, 20), null, 2));
  }
  if (!person.validationOk) {
    console.log(JSON.stringify(person.errors.slice(0, 10), null, 2));
  }
}
console.log("csv", csvPath);
console.log("summary", summaryPath);
console.log("diffsOnly", diffsOnlyPath);
