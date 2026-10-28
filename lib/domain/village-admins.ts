/** 里責任分配與關懷表獨立填表 scope */

import mohwTemplate from "@/lib/domain/mohw-life-care-template.json";
import {
  lookupYongheVillageCode,
  sortYongheVillagesByCode,
} from "@/lib/domain/yonghe-village-codes";

export const YONGHE_VILLAGE_NAMES: string[] = (
  (mohwTemplate.villagesByCityDistrict as Record<string, string[]>)["新北市永和區"] ?? []
).slice();

export {
  YONGHE_VILLAGE_CODE_BY_NAME,
  YONGHE_VILLAGE_CODE_COUNT,
  canonicalizeYongheVillageName,
  compareYongheVillagesByCode,
  lookupYongheVillageCode,
  mergeYongheVillageCodeByName,
  sortYongheVillagesByCode,
} from "@/lib/domain/yonghe-village-codes";

export const VILLAGE_ORG_SLUGS = {
  civilAffairs: "org:civil-affairs",
  gentlemen: "org:gentlemen",
  mealVolunteers: "org:meal-volunteers",
  urbanRenewalSkip: "org:urban-renewal-skip",
} as const;

export const VILLAGE_ORG_LABELS: Record<string, string> = {
  [VILLAGE_ORG_SLUGS.civilAffairs]: "民政課",
  [VILLAGE_ORG_SLUGS.gentlemen]: "永和紳士協會",
  [VILLAGE_ORG_SLUGS.mealVolunteers]: "送餐組志工",
  [VILLAGE_ORG_SLUGS.urbanRenewalSkip]: "都更(不用訪)",
};

/** Excel 顯示名 → kind + account key */
export function classifyVillageAdminDisplayName(raw: string): {
  adminDisplayName: string;
  adminKind: "person" | "org" | "skip";
  adminAccountKey: string;
} {
  const name = raw.trim();
  if (!name) {
    return { adminDisplayName: "", adminKind: "person", adminAccountKey: "" };
  }
  if (/都更/.test(name)) {
    return {
      adminDisplayName: name,
      adminKind: "skip",
      adminAccountKey: VILLAGE_ORG_SLUGS.urbanRenewalSkip,
    };
  }
  if (name === "民政課") {
    return {
      adminDisplayName: name,
      adminKind: "org",
      adminAccountKey: VILLAGE_ORG_SLUGS.civilAffairs,
    };
  }
  if (/紳士協會/.test(name)) {
    return {
      adminDisplayName: name,
      adminKind: "org",
      adminAccountKey: VILLAGE_ORG_SLUGS.gentlemen,
    };
  }
  if (/送餐/.test(name)) {
    return {
      adminDisplayName: name,
      adminKind: "org",
      adminAccountKey: VILLAGE_ORG_SLUGS.mealVolunteers,
    };
  }
  return {
    adminDisplayName: name,
    adminKind: "person",
    adminAccountKey: name,
  };
}

export function splitVillageAdminNames(raw: string) {
  return String(raw || "")
    .split(/[&＆、,，/／]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export type VillageAdminRow = {
  assignmentRowId: string;
  villageCode: string;
  villageName: string;
  adminDisplayName: string;
  adminKind: "person" | "org" | "skip";
  adminAccountKey: string;
  matchedVisitorId: string;
  status: string;
  notes: string;
};

/**
 * 永和區里編碼：官方六碼，如上林里 `040051`（縣市末三碼 `040` + 里序三碼）。
 * - 已是正確 6 碼（040051）→ 原樣
 * - 僅里序（51／051／1）→ 補成 `040` + 三碼
 * - 縣市碼 65000040 + 里序 → 取末六碼後再正規化
 * - 常見誤鍵：左補零成六碼（000051）或前綴錯位（004001）→ 改為 `040` + 末三碼
 */
export function formatYongheVillageCode(
  villageCodeOrSeq: string | number | null | undefined,
  districtCode: string | number = "65000040",
): string {
  const raw = String(villageCodeOrSeq ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  const district = String(districtCode ?? "65000040").replace(/\D/g, "") || "65000040";
  const prefix = district.slice(-3).padStart(3, "0");

  if (digits.length >= 6) {
    const six = digits.slice(-6);
    if (six.startsWith(prefix)) return six;
    // 000051／004001 等：不當成正式六碼，改解讀為里序末三碼
    if (six.startsWith("00")) return `${prefix}${six.slice(-3)}`;
    return six;
  }

  // 里序不足六碼：只取末三碼再補齊（避免 0001 → 七碼）
  return `${prefix}${digits.slice(-3).padStart(3, "0")}`;
}

/** 由匯入檔縣市碼＋里別組成六碼里編碼。 */
export function buildYongheVillageCodeFromImport(input: {
  districtCode?: string | number;
  villageSeq?: string | number;
}): string {
  return formatYongheVillageCode(input.villageSeq, input.districtCode);
}

/**
 * 里別下拉顯示文字：紙本同款「六碼（里名）」，碼在前以便 native select 打數字可 typeahead。
 * 無碼參數時回退 Excel「里別 編碼」對照表；仍無碼則僅回傳里名。`value` 仍應使用里名。
 */
export function formatYongheVillageSelectLabel(
  villageName: string,
  villageCode?: string | number | null,
): string {
  const name = String(villageName ?? "").trim();
  const code =
    formatYongheVillageCode(villageCode) || lookupYongheVillageCode(name);
  if (code && name) return `${code}（${name}）`;
  return name || code;
}

export function mapVillageAdminRow(row: Record<string, unknown>): VillageAdminRow {
  const kindRaw = String(row.admin_kind || "person");
  const adminKind =
    kindRaw === "org" || kindRaw === "skip" || kindRaw === "person" ? kindRaw : "person";
  return {
    assignmentRowId: String(row.assignment_row_id || ""),
    villageCode: formatYongheVillageCode(row.village_code as string | number | null | undefined),
    villageName: String(row.village_name || ""),
    adminDisplayName: String(row.admin_display_name || ""),
    adminKind,
    adminAccountKey: String(row.admin_account_key || ""),
    matchedVisitorId: String(row.matched_visitor_id || ""),
    status: String(row.status || "active"),
    notes: String(row.notes || ""),
  };
}

export type DeskScope =
  | { mode: "all"; label: string }
  | { mode: "villages"; label: string; villages: string[]; skipVillages: string[] }
  | { mode: "none"; label: string };

export type DeskIdentityInput = {
  email: string;
  name?: string;
  roleKey?: string;
  /** env: email → org slug */
  orgEmailMap?: Record<string, string>;
};

function normalizePerson(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * 依登入者解析可 KEY 的里。
 * 對人：優先 email／姓名對訪查員主檔，再對里分配 display_name。
 * 組織：email 對 org slug，或 display 本身是 org。
 */
export function resolveDeskScope(input: {
  identity: DeskIdentityInput;
  admins: VillageAdminRow[];
  visitors: Array<{ visitorId: string; name: string; email: string }>;
  unassignedVillages?: string[];
}): DeskScope {
  const email = input.identity.email.trim().toLowerCase();
  const roleKey = input.identity.roleKey || "";
  // 承辦後台／紙本 KEY：總承辦與工作空間管理員都可代選各里身份（里責資料本來就在表上）。
  if (roleKey === "workspace_owner" || roleKey === "workspace_manager") {
    return {
      mode: "all",
      label: roleKey === "workspace_owner" ? "總承辦（全部里）" : "承辦（全部里）",
    };
  }
  // 臨時登打：論件紙本 KEY，不依里責任限縮，可跨里選案。
  if (roleKey === "desk_clerk") {
    return {
      mode: "all",
      label: "臨時登打（全部里）",
    };
  }

  const active = input.admins.filter((row) => row.status !== "inactive");
  const skipVillages = [
    ...new Set(active.filter((row) => row.adminKind === "skip").map((row) => row.villageName)),
  ];

  const orgSlug = input.identity.orgEmailMap?.[email];
  if (orgSlug) {
    const villages = [
      ...new Set(
        active
          .filter((row) => row.adminKind === "org" && row.adminAccountKey === orgSlug)
          .map((row) => row.villageName),
      ),
    ];
    // 民政課暫管未指定里
    if (orgSlug === VILLAGE_ORG_SLUGS.civilAffairs) {
      for (const village of input.unassignedVillages ?? []) {
        if (!villages.includes(village)) villages.push(village);
      }
    }
    return {
      mode: villages.length > 0 ? "villages" : "none",
      label: VILLAGE_ORG_LABELS[orgSlug] || orgSlug,
      villages,
      skipVillages,
    };
  }

  const visitor =
    input.visitors.find((row) => row.email && row.email.toLowerCase() === email) ||
    input.visitors.find(
      (row) =>
        input.identity.name &&
        normalizePerson(row.name) === normalizePerson(input.identity.name),
    );

  const personKeys = new Set<string>();
  if (visitor?.name) personKeys.add(normalizePerson(visitor.name));
  if (input.identity.name) personKeys.add(normalizePerson(input.identity.name));

  const villages = [
    ...new Set(
      active
        .filter((row) => {
          if (row.adminKind !== "person") return false;
          if (visitor?.visitorId && row.matchedVisitorId === visitor.visitorId) return true;
          return personKeys.has(normalizePerson(row.adminDisplayName));
        })
        .map((row) => row.villageName),
    ),
  ];

  if (villages.length === 0) {
    return { mode: "none", label: visitor?.name || input.identity.name || email };
  }

  return {
    mode: "villages",
    label: visitor?.name || input.identity.name || email,
    villages,
    skipVillages,
  };
}

export function villagesAllowedForDesk(scope: DeskScope): string[] | null {
  if (scope.mode === "all") return null;
  if (scope.mode === "none") return [];
  return scope.villages.filter((village) => !scope.skipVillages.includes(village));
}

export type DeskIdentityOption = {
  key: string;
  label: string;
  kind: "all" | "person" | "org" | "self";
  villages: string[];
};

/** 填表頁「身份」下拉：總承辦／承辦可代選各管理員；里責僅自己。 */
export function buildDeskIdentityOptions(input: {
  scope: DeskScope;
  admins: VillageAdminRow[];
  allVillages: string[];
}): DeskIdentityOption[] {
  const { scope, admins, allVillages } = input;

  if (scope.mode === "villages") {
    return [
      {
        key: "self",
        label: scope.label,
        kind: "self",
        villages: sortYongheVillagesByCode(
          [...scope.villages].filter((village) => !scope.skipVillages.includes(village)),
        ),
      },
    ];
  }

  // mode=all，或尚未對到個人里責：承辦紙本 KEY 仍要能選里責任表上的身份。
  const skipVillages = new Set(
    admins
      .filter((row) => (row.status || "active") === "active" && row.adminKind === "skip")
      .map((row) => row.villageName),
  );
  const options: DeskIdentityOption[] = [
    {
      key: "all",
      label: scope.mode === "all" ? scope.label : "承辦（全部里）",
      kind: "all",
      villages: sortYongheVillagesByCode(
        [...new Set(allVillages)].filter((village) => village && !skipVillages.has(village)),
      ),
    },
  ];

  const byKey = new Map<string, { label: string; kind: "person" | "org"; villages: Set<string> }>();
  for (const row of admins) {
    if (row.status === "inactive" || row.adminKind === "skip") continue;
    const key = `${row.adminKind}:${row.adminAccountKey || row.adminDisplayName}`;
    const current = byKey.get(key) ?? {
      label: row.adminDisplayName,
      kind: row.adminKind === "org" ? "org" : "person",
      villages: new Set<string>(),
    };
    if (row.villageName) current.villages.add(row.villageName);
    byKey.set(key, current);
  }

  for (const [key, value] of [...byKey.entries()].sort((a, b) =>
    a[1].label.localeCompare(b[1].label, "zh-Hant"),
  )) {
    options.push({
      key,
      label: value.label,
      kind: value.kind,
      villages: sortYongheVillagesByCode([...value.villages]),
    });
  }

  return options;
}

export const VILLAGE_ADMIN_KIND_LABELS: Record<VillageAdminRow["adminKind"], string> = {
  person: "個人",
  org: "組織",
  skip: "不訪（skip）",
};

/** 表單選組織時用 */
export const VILLAGE_ORG_OPTIONS = [
  { slug: VILLAGE_ORG_SLUGS.civilAffairs, label: VILLAGE_ORG_LABELS[VILLAGE_ORG_SLUGS.civilAffairs] },
  { slug: VILLAGE_ORG_SLUGS.gentlemen, label: VILLAGE_ORG_LABELS[VILLAGE_ORG_SLUGS.gentlemen] },
  { slug: VILLAGE_ORG_SLUGS.mealVolunteers, label: VILLAGE_ORG_LABELS[VILLAGE_ORG_SLUGS.mealVolunteers] },
  {
    slug: VILLAGE_ORG_SLUGS.urbanRenewalSkip,
    label: VILLAGE_ORG_LABELS[VILLAGE_ORG_SLUGS.urbanRenewalSkip],
  },
] as const;

export function resolveAdminAccountFields(input: {
  adminKind: VillageAdminRow["adminKind"];
  adminDisplayName: string;
  adminAccountKey?: string;
}): { adminDisplayName: string; adminAccountKey: string; adminKind: VillageAdminRow["adminKind"] } {
  const classified = classifyVillageAdminDisplayName(input.adminDisplayName);
  if (input.adminKind === "org" || input.adminKind === "skip") {
    const slug =
      input.adminAccountKey?.trim() ||
      classified.adminAccountKey ||
      (input.adminKind === "skip"
        ? VILLAGE_ORG_SLUGS.urbanRenewalSkip
        : VILLAGE_ORG_SLUGS.civilAffairs);
    return {
      adminKind: input.adminKind === "skip" || /都更/.test(input.adminDisplayName) ? "skip" : "org",
      adminDisplayName: input.adminDisplayName.trim() || VILLAGE_ORG_LABELS[slug] || slug,
      adminAccountKey: slug,
    };
  }
  const name = input.adminDisplayName.trim();
  return {
    adminKind: "person",
    adminDisplayName: name,
    adminAccountKey: input.adminAccountKey?.trim() || name,
  };
}
