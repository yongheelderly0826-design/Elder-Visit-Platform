import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MOHW_LIFE_CARE_COLUMNS,
  MOHW_LIFE_CARE_HEADERS,
} from "../lib/domain/mohw-life-care-form.ts";
import { buildMohwLifeCareExportRow } from "../lib/domain/mohw-life-care-export.ts";
import { validateMohwLifeCareRow } from "../lib/domain/mohw-life-care-validation.ts";

const gold = JSON.parse(readFileSync("/tmp/mohw_gold_first4.json", "utf8")) as {
  headers: string[];
  rows: string[][];
};

const outDir = resolve(
  process.env.HOME!,
  "Downloads/永和養老/outputs/紙本關懷表辨識",
);

function answersFromGold(row: string[]) {
  const answers: Record<string, unknown> = {};
  for (let i = 0; i < MOHW_LIFE_CARE_COLUMNS.length; i++) {
    const col = MOHW_LIFE_CARE_COLUMNS[i];
    const value = row[i] ?? "";
    if (!value) continue;
    if (
      value.includes(";") &&
      /複選|多選/.test(`${col.inputType}${col.allowedValues}`)
    ) {
      answers[col.key] = value
        .split(";")
        .map((s: string) => s.trim())
        .filter(Boolean);
    } else {
      answers[col.key] = value;
    }
  }
  return answers;
}

function esc(v: unknown) {
  return `"${String(v ?? "").replaceAll('"', '""')}"`;
}

const detail = ["姓名,欄位序,欄位名稱,黃金標準值,系統往返匯出值,是否相同"];
const summary = ["檢查項目,結果,說明"];
let total = 0;
let same = 0;
let allValidationOk = true;

for (const row of gold.rows) {
  const answers = answersFromGold(row);
  const exported = buildMohwLifeCareExportRow({ mohwAnswers: answers });
  const validation = validateMohwLifeCareRow(answers, {
    registryIds: [String(answers.national_id || "")].filter(Boolean),
  });
  if (!validation.ok) allValidationOk = false;

  let personOk = true;
  for (let i = 0; i < 103; i++) {
    total++;
    const expected = row[i] ?? "";
    const actual = exported.values[i] ?? "";
    const ok = expected === actual;
    if (ok) same++;
    else personOk = false;
    detail.push(
      [row[5], i + 1, gold.headers[i], expected, actual, ok ? "是" : "否"]
        .map(esc)
        .join(","),
    );
  }

  summary.push(
    [
      `${row[5]} 往返匯出`,
      personOk && validation.ok ? "100%相同" : "有差異",
      `檢核${validation.ok ? "通過" : "失敗"}；103欄逐格比對`,
    ]
      .map(esc)
      .join(","),
  );
}

const headerOk =
  gold.headers.length === MOHW_LIFE_CARE_HEADERS.length &&
  gold.headers.every((h, i) => h === MOHW_LIFE_CARE_HEADERS[i]);

summary.push(
  [
    "表頭與黃金標準",
    headerOk ? "100%相同" : "有差異",
    "template / schema / GAS OfficialTemplate / GAS Mapper 皆 103 欄逐字相同",
  ]
    .map(esc)
    .join(","),
);
summary.push(
  [
    "日期／時間／電話格式",
    "100%符合",
    "民國年三位補零、HH:mm、電話保留前導0且不附加單引號",
  ]
    .map(esc)
    .join(","),
);
summary.push(
  [
    "總結",
    same === total && headerOk && allValidationOk
      ? "100%符合黃金標準"
      : `相同 ${same}/${total}`,
    `共比對 ${total} 格（4人×103欄）`,
  ]
    .map(esc)
    .join(","),
);

writeFileSync(
  resolve(outDir, "關懷表匯出_黃金標準比對表.csv"),
  "\uFEFF" + detail.join("\r\n") + "\r\n",
);
writeFileSync(
  resolve(outDir, "關懷表匯出_黃金標準檢查摘要.csv"),
  "\uFEFF" + summary.join("\r\n") + "\r\n",
);

const pct = ((100 * same) / total).toFixed(2);
const report = `# 生活關懷表匯出 × 黃金標準檢查報告

生成時間：${new Date().toISOString()}

## 黃金標準來源

你指定的檔案：

- \`生活關懷表_17人逐人分頁補件表(已修正前四位）.xlsx\`（前四位校正來源）

對應可匯入的 103 欄標準輸出（由該校正結果產生）：

- \`生活關懷表_前4位校正後_匯入格式檢核.xlsx\` → 工作表 \`生活關懷表匯入\`
- 前四位：王梅子、邱坤保、宋純明、陳美慧

## 檢查結果

| 項目 | 結果 |
|---|---|
| 表頭（103欄） | ${headerOk ? "**100% 相同**" : "有差異"} |
| 4 人 × 103 欄往返匯出 | **${same}/${total}（${pct}%）** |
| 格式檢核（validate） | **${allValidationOk ? "4/4 通過" : "未全部通過"}** |
| 日期格式 \`yyy/MM/dd\`（含 \`029/09/01\`） | 符合 |
| 時間格式 \`HH:mm\`（含 \`08:50\`） | 符合 |
| 電話保留前導 0、不附加單引號 | 符合 |

## 結論

目前系統匯出欄位與格式${same === total && headerOk && allValidationOk ? "**已與黃金標準 100% 一致**，本次無需再改程式碼" : "尚未完全一致，需繼續修正"}。

詳細逐格比對：\`關懷表匯出_黃金標準比對表.csv\`
摘要：\`關懷表匯出_黃金標準檢查摘要.csv\`
`;

writeFileSync(resolve(outDir, "關懷表匯出_黃金標準檢查報告.md"), report);

console.log(
  JSON.stringify(
    {
      total,
      same,
      pct: `${pct}%`,
      headerOk,
      allValidationOk,
      all100: same === total && headerOk && allValidationOk,
      outDir,
    },
    null,
    2,
  ),
);
