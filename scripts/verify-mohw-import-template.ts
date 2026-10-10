import { readFileSync } from "node:fs";
import { formatRocDate } from "../lib/domain/mohw-life-care-export";
import { MOHW_LIFE_CARE_HEADERS } from "../lib/domain/mohw-life-care-form";
import { mohwLifeCareSampleAnswers } from "../lib/domain/mohw-life-care-ui";
import {
  MOHW_IMPORT_TEMPLATE_HEADERS,
  mohwHeadersMatchTemplate,
} from "../lib/domain/mohw-life-care-template";
import { validateMohwLifeCareRow } from "../lib/domain/mohw-life-care-validation";

const failures: string[] = [];

function expect(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

expect(
  mohwHeadersMatchTemplate(MOHW_LIFE_CARE_HEADERS),
  "schema headers differ from import template",
);

const mapper = readFileSync("gas/src/utils/MohwLifeCareMapper.gs", "utf8");
const headerBlock = mapper.match(/var HEADERS = \[([\s\S]*?)\];/);
const gasHeaders = headerBlock
  ? [...headerBlock[1].matchAll(/'((?:\\'|[^'])*)'/g)].map((match) => match[1].replace(/\\'/g, "'"))
  : [];
expect(gasHeaders.length === 103, `GAS headers count ${gasHeaders.length}`);
expect(
  gasHeaders.every((header, index) => header === MOHW_IMPORT_TEMPLATE_HEADERS[index]),
  "GAS headers differ from import template",
);

expect(formatRocDate("1948-06-15") === "037/06/15", `iso ${formatRocDate("1948-06-15")}`);
expect(formatRocDate("48/6/15") === "048/06/15", `roc ${formatRocDate("48/6/15")}`);
expect(formatRocDate("113/06/15") === "113/06/15", `padded ${formatRocDate("113/06/15")}`);

const sample = validateMohwLifeCareRow(mohwLifeCareSampleAnswers, {
  row: 2,
  registryNationalId: "A123456789",
});
const newRuleHits = sample.errorLines.filter((line) =>
  /查無此里|應留空|無個案資料|日期格式錯誤|訪查人欄位順序不符/.test(line),
);
expect(newRuleHits.length === 0, `sample tripped new rules: ${newRuleHits.join(" | ")}`);

const badVillage = validateMohwLifeCareRow(
  {
    ...mohwLifeCareSampleAnswers,
    household_city: "新北市",
    household_district: "永和區",
    household_village: "新星里",
    living_city: "新北市",
    living_district: "永和區",
    living_village: "新星里",
  },
  { row: 2, registryNationalId: "A123456789" },
);
expect(
  badVillage.errorLines.some((line) => line === "T2 戶籍村里「新星里」在「永和區」下查無此里"),
  `missing T village line: ${badVillage.errorLines.join(" | ")}`,
);
expect(
  badVillage.errorLines.some((line) => line === "Z2 居住村里「新星里」在「永和區」下查無此里"),
  `missing Z village line: ${badVillage.errorLines.join(" | ")}`,
);

const yonghe = validateMohwLifeCareRow(
  {
    ...mohwLifeCareSampleAnswers,
    household_city: "新北市",
    household_district: "永和區",
    household_village: "福林里",
  },
  { row: 2, registryNationalId: "A123456789" },
);
expect(
  !yonghe.errorLines.some((line) => line.includes("查無此里")),
  `福林里 should exist: ${yonghe.errorLines.join(" | ")}`,
);

const blankOther = validateMohwLifeCareRow(
  {
    ...mohwLifeCareSampleAnswers,
    help_sources_flag: "無",
    help_sources_none: ["沒發生過"],
    help_sources_none_other: "自己處理",
  },
  { row: 2, registryNationalId: "A123456789" },
);
expect(
  blankOther.errorLines.some(
    (line) => line === "BN2 未勾選「其他」時，「求助對象無-其他說明」應留空",
  ),
  `missing BN line: ${blankOther.errorLines.join(" | ")}`,
);

const otherSelected = validateMohwLifeCareRow(
  {
    ...mohwLifeCareSampleAnswers,
    help_sources_flag: "無",
    help_sources_none: ["其他"],
    help_sources_none_other: "自己處理",
  },
  { row: 2, registryNationalId: "A123456789" },
);
expect(
  !otherSelected.errorLines.some((line) => line.includes("應留空")),
  `BN should allow 其他: ${otherSelected.errorLines.join(" | ")}`,
);

const missingCase = validateMohwLifeCareRow(mohwLifeCareSampleAnswers, {
  row: 2,
  registryNationalId: "B123456789",
});
expect(
  missingCase.errorLines.some((line) => line === "I2 無個案資料"),
  `missing case line: ${missingCase.errorLines.join(" | ")}`,
);

const badDate = validateMohwLifeCareRow(
  { ...mohwLifeCareSampleAnswers, birth_date: "不是日期" },
  { row: 2, registryNationalId: "A123456789" },
);
expect(
  badDate.errorLines.some((line) => line.startsWith("H2 日期格式錯誤:此欄需為文字格式")),
  `missing date line: ${badDate.errorLines.join(" | ")}`,
);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("mohw import template checks passed");
