/**
 * 永和區里名 → 六碼里編碼。
 * 來源：`75歲以上待訪(線上).xlsx` 工作表「里別 編碼」（市／區碼 65000040 + 村里序）。
 * 請勿手填；若紙本／Excel 更新，由此表重新匯出後覆寫。
 */
export const YONGHE_VILLAGE_CODE_BY_NAME = {
  福林里: "040001",
  文化里: "040002",
  豫溪里: "040003",
  光明里: "040004",
  仁愛里: "040005",
  永貞里: "040006",
  永福里: "040007",
  民治里: "040008",
  永成里: "040009",
  忠義里: "040010",
  永元里: "040011",
  秀林里: "040012",
  保安里: "040013",
  中溪里: "040014",
  永安里: "040015",
  民族里: "040016",
  民權里: "040017",
  中興里: "040018",
  勵行里: "040019",
  秀朗里: "040020",
  秀成里: "040021",
  上溪里: "040022",
  竹林里: "040023",
  雙和里: "040024",
  安和里: "040025",
  水源里: "040026",
  協和里: "040027",
  河堤里: "040028",
  頂溪里: "040029",
  潭墘里: "040030",
  潭安里: "040031",
  大新里: "040032",
  保平里: "040033",
  民本里: "040034",
  民樂里: "040035",
  光復里: "040036",
  復興里: "040037",
  福和里: "040038",
  得和里: "040039",
  智光里: "040040",
  新生里: "040041",
  大同里: "040042",
  前溪里: "040043",
  和平里: "040044",
  新廍里: "040045",
  下溪里: "040046",
  秀和里: "040047",
  河濱里: "040048",
  民生里: "040049",
  秀得里: "040050",
  上林里: "040051",
  網溪里: "040052",
  正興里: "040053",
  永興里: "040054",
  桂林里: "040055",
  店街里: "040056",
  信義里: "040057",
  後溪里: "040058",
  民富里: "040059",
  秀元里: "040060",
  永樂里: "040061",
  保順里: "040062",
} as const satisfies Record<string, string>;

export type YongheVillageName = keyof typeof YONGHE_VILLAGE_CODE_BY_NAME;

/** 常見錯字／俗稱 → 官方里名（對齊 Excel「里別 編碼」）。 */
const YONGHE_VILLAGE_NAME_ALIASES: Record<string, YongheVillageName> = {
  新庿里: "新廍里",
  新庿: "新廍里",
  新廟里: "新廍里",
  新廟: "新廍里",
  新廊里: "新廍里",
  新廊: "新廍里",
  新星里: "新生里",
  新星: "新生里",
};

function withLi(name: string) {
  const text = name.trim();
  if (!text) return "";
  return text.endsWith("里") ? text : `${text}里`;
}

/** 正規化為 Excel 官方里名；無法對到則回傳 trim 後原文。 */
export function canonicalizeYongheVillageName(villageName: string): string {
  const raw = String(villageName ?? "").trim();
  if (!raw) return "";
  const withSuffix = withLi(raw);
  const alias =
    YONGHE_VILLAGE_NAME_ALIASES[raw] ||
    YONGHE_VILLAGE_NAME_ALIASES[withSuffix] ||
    YONGHE_VILLAGE_NAME_ALIASES[raw.replace(/里$/, "")] ||
    "";
  const candidate = alias || withSuffix;
  if (candidate in YONGHE_VILLAGE_CODE_BY_NAME) return candidate;
  if (raw in YONGHE_VILLAGE_CODE_BY_NAME) return raw;
  return raw;
}

/** 依 Excel 對照表查六碼；別名會先正規化。 */
export function lookupYongheVillageCode(villageName: string): string {
  const canonical = canonicalizeYongheVillageName(villageName);
  if (!canonical) return "";
  return YONGHE_VILLAGE_CODE_BY_NAME[canonical as YongheVillageName] ?? "";
}

/**
 * 合併里責任表／其他來源的里碼，缺漏以 Excel 對照表補齊。
 * 同時為別名鍵寫入同一六碼，方便 identity 里名直接 lookup。
 */
export function mergeYongheVillageCodeByName(
  extra?: Record<string, string> | null,
): Record<string, string> {
  const out: Record<string, string> = { ...YONGHE_VILLAGE_CODE_BY_NAME };
  for (const [name, code] of Object.entries(extra ?? {})) {
    const trimmedName = String(name ?? "").trim();
    const digits = String(code ?? "").replace(/\D/g, "");
    if (!trimmedName || digits.length < 3) continue;
    const six =
      digits.length >= 6 && digits.slice(-6).startsWith("040")
        ? digits.slice(-6)
        : `040${digits.slice(-3).padStart(3, "0")}`;
    out[trimmedName] = six;
    const canonical = canonicalizeYongheVillageName(trimmedName);
    if (canonical && canonical !== trimmedName) out[canonical] = six;
  }
  for (const [alias, canonical] of Object.entries(YONGHE_VILLAGE_NAME_ALIASES)) {
    const code = out[canonical] || lookupYongheVillageCode(canonical);
    if (code) out[alias] = code;
  }
  return out;
}

/** 里別下拉排序：六碼數字升冪；無碼者置後再依里名。 */
export function compareYongheVillagesByCode(
  a: string,
  b: string,
  codeByName?: Record<string, string> | null,
): number {
  const codeA =
    codeByName?.[a] ||
    codeByName?.[canonicalizeYongheVillageName(a)] ||
    lookupYongheVillageCode(a);
  const codeB =
    codeByName?.[b] ||
    codeByName?.[canonicalizeYongheVillageName(b)] ||
    lookupYongheVillageCode(b);
  const hasA = Boolean(codeA);
  const hasB = Boolean(codeB);
  if (hasA && hasB && codeA !== codeB) {
    return Number(codeA) - Number(codeB);
  }
  if (hasA !== hasB) return hasA ? -1 : 1;
  return a.localeCompare(b, "zh-Hant");
}

export function sortYongheVillagesByCode(
  villages: string[],
  codeByName?: Record<string, string> | null,
): string[] {
  return [...villages].sort((a, b) => compareYongheVillagesByCode(a, b, codeByName));
}

export const YONGHE_VILLAGE_CODE_COUNT = Object.keys(YONGHE_VILLAGE_CODE_BY_NAME).length;
