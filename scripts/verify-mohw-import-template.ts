import { readFileSync } from "node:fs";
import { formatMohwPhone, formatRocDate } from "../lib/domain/mohw-life-care-export";
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
  ? [
      ...headerBlock[1].matchAll(/'((?:\\'|[^'])*)'|\"((?:\\\"|[^\"])*)\"/g),
    ].map((match) => (match[1] ?? match[2] ?? "").replace(/\\'/g, "'").replace(/\\"/g, '"'))
  : [];
expect(gasHeaders.length === 103, `GAS headers count ${gasHeaders.length}`);
expect(
  gasHeaders.every((header, index) => header === MOHW_IMPORT_TEMPLATE_HEADERS[index]),
  "GAS headers differ from import template",
);

expect(formatRocDate("1948-06-15") === "037/06/15", `iso ${formatRocDate("1948-06-15")}`);
expect(formatRocDate("48/6/15") === "048/06/15", `roc ${formatRocDate("48/6/15")}`);
expect(formatRocDate("113/06/15") === "113/06/15", `padded ${formatRocDate("113/06/15")}`);
expect(formatRocDate("2028-05-10") === "117/05/10", `western future ${formatRocDate("2028-05-10")}`);
expect(
  formatRocDate("1959-06-15ERROR") === "1959-06-15ERROR",
  `iso suffix must not convert: ${formatRocDate("1959-06-15ERROR")}`,
);
expect(
  formatRocDate("1959-06-14T16:00:00Z") === "048/06/15",
  `iso stamp TZ: ${formatRocDate("1959-06-14T16:00:00Z")}`,
);
expect(formatMohwPhone("02-2921-1234") === "0229211234", `phone clean ${formatMohwPhone("02-2921-1234")}`);
expect(formatMohwPhone("0912abc3456") === "0912abc3456", `phone keep letters ${formatMohwPhone("0912abc3456")}`);

const sample = validateMohwLifeCareRow(mohwLifeCareSampleAnswers, {
  row: 2,
  registryNationalId: "A123456789",
});
const newRuleHits = sample.errorLines.filter((line) =>
  /查無此里|應留空|無個案資料|日期格式錯誤|訪查人欄位順序不符|電話格式|手機格式|市話須為/.test(line),
);
expect(newRuleHits.length === 0, `sample tripped new rules: ${newRuleHits.join(" | ")}`);

const mobileInLandline = validateMohwLifeCareRow(
  {
    ...mohwLifeCareSampleAnswers,
    phone: "0983524441",
    mobile: "",
  },
  { row: 2, registryNationalId: "A123456789" },
);
expect(
  mobileInLandline.errorLines.some((line) => line.includes("市話須為") && line.includes("09 開頭請填手機欄")),
  `09 in J must fail: ${mobileInLandline.errorLines.join(" | ")}`,
);

const typoVillage = validateMohwLifeCareRow(
  {
    ...mohwLifeCareSampleAnswers,
    household_city: "新北市",
    household_district: "永和區",
    household_village: "新星里",
    household_address: "永和路一段100號",
    living_city: "新北市",
    living_district: "永和區",
    living_village: "新星里",
    living_address: "永和路一段100號",
  },
  { row: 2, registryNationalId: "A123456789" },
);
expect(
  typoVillage.errorLines.some((line) => line.includes("查無此里")),
  `新星里 must not auto-fix; expect village error: ${typoVillage.errorLines.join(" | ")}`,
);

const hyphenId = validateMohwLifeCareRow(
  {
    ...mohwLifeCareSampleAnswers,
    national_id: "A-123456789",
  },
  { row: 2, registryNationalId: "A123456789" },
);
expect(
  hyphenId.errorLines.some((line) => line.includes("身分證") && line.includes("格式不正確")),
  `hyphen ID must fail: ${hyphenId.errorLines.join(" | ")}`,
);

const badPhone = validateMohwLifeCareRow(
  {
    ...mohwLifeCareSampleAnswers,
    phone: "",
    mobile: "0911",
  },
  { row: 2, registryNationalId: "A123456789" },
);
expect(
  badPhone.errorLines.some((line) => line.includes("手機格式不正確")),
  `short mobile must fail: ${badPhone.errorLines.join(" | ")}`,
);

const refused = validateMohwLifeCareRow(
  {
    ...mohwLifeCareSampleAnswers,
    visit_status: "拒絕訪視",
    consent_agreement: "",
    consent_signature: "",
    housing_type: "",
  },
  { row: 2, registryNationalId: "A123456789" },
);
expect(
  !refused.errorLines.some((line) => /同意|簽名|住宅類型/.test(line) && line.includes("必填")),
  `拒訪 should skip AC:CN required: ${refused.errorLines.join(" | ")}`,
);

const badVillage = validateMohwLifeCareRow(
  {
    ...mohwLifeCareSampleAnswers,
    household_city: "新北市",
    household_district: "永和區",
    household_village: "成村里",
    household_address: "永和路一段100號",
    living_address_type: "未住戶籍地址",
    living_city: "新北市",
    living_district: "永和區",
    living_village: "成村里",
    living_address: "永和路一段100號",
  },
  { row: 2, registryNationalId: "A123456789" },
);
expect(
  badVillage.errorLines.some((line) => line === "T2 戶籍村里「成村里」在「永和區」下查無此里"),
  `missing T village line: ${badVillage.errorLines.join(" | ")}`,
);
expect(
  badVillage.errorLines.some((line) => line === "Z2 居住村里「成村里」在「永和區」下查無此里"),
  `missing Z village line: ${badVillage.errorLines.join(" | ")}`,
);

const otherHouseholdDistrict = validateMohwLifeCareRow(
  {
    ...mohwLifeCareSampleAnswers,
    household_city: "新北市",
    household_district: "中和區",
    household_village: "不存在里",
    household_address: "中和路1號",
    living_address_type: "未住戶籍地址",
    living_city: "新北市",
    living_district: "永和區",
    living_village: "福林里",
    living_address: "新北市永和區福林里文化路100號",
  },
  { row: 2, registryNationalId: "A123456789" },
);
expect(
  !otherHouseholdDistrict.errorLines.some((line) => line.includes("查無此里")),
  `非永和戶籍里不應擋: ${otherHouseholdDistrict.errorLines.join(" | ")}`,
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
