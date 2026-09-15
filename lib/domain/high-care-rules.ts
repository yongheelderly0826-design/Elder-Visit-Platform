import type { MohwLifeCareAnswers } from "@/lib/domain/mohw-life-care-form";

export type HighCareColor = "橘" | "黃" | "綠";

export type HighCareMatch = "equals" | "includes";

export type HighCareRule = {
  id: string;
  color: HighCareColor;
  key: string;
  match: HighCareMatch;
  values: string[];
  label: string;
};

export type HighCareTrigger = {
  id: string;
  color: HighCareColor;
  key: string;
  label: string;
  value: string;
};

export type HighCareEvaluation = {
  triggered: boolean;
  colors: HighCareColor[];
  primaryColor: HighCareColor | null;
  triggers: HighCareTrigger[];
};

export const HIGH_CARE_COLOR_ORDER: HighCareColor[] = ["橘", "黃", "綠"];

export const HIGH_CARE_STATUSES = ["追蹤中", "已轉介", "已結案"] as const;
export type HighCareStatus = (typeof HIGH_CARE_STATUSES)[number];

export const HIGH_CARE_RULES: HighCareRule[] = [
  {
    id: "orange-no-help",
    color: "橘",
    key: "help_sources_none",
    match: "includes",
    values: ["找不到人可以協助", "找不到人可以問"],
    label: "找不到人可以協助",
  },
  {
    id: "orange-suicide",
    color: "橘",
    key: "mental_status",
    match: "includes",
    values: ["在訪談過程中，長者有提到自殺意念", "有提到自殺意念"],
    label: "訪談中提到自殺意念",
  },
  {
    id: "orange-need-help-move",
    color: "橘",
    key: "self_care_observation",
    match: "includes",
    values: ["需要別人幫助才能移動", "需要別人協助才能移動"],
    label: "需要別人幫助才能移動",
  },
  {
    id: "yellow-health-bad",
    color: "黃",
    key: "health_self_rating",
    match: "equals",
    values: ["很不好"],
    label: "健康自評很不好",
  },
  {
    id: "yellow-weight-loss",
    color: "黃",
    key: "weight_change_3m",
    match: "equals",
    values: ["減輕3公斤以上"],
    label: "近三個月體重減輕3公斤以上",
  },
  {
    id: "yellow-heart",
    color: "黃",
    key: "diseases",
    match: "includes",
    values: ["心臟病"],
    label: "疾病史含心臟病",
  },
  {
    id: "yellow-memory",
    color: "黃",
    key: "life_difficulties",
    match: "includes",
    values: ["最近記憶力不好", "記憶力不好"],
    label: "最近記憶力不好",
  },
  {
    id: "yellow-unsafe-home",
    color: "黃",
    key: "home_safety_feeling",
    match: "equals",
    values: ["很不安全"],
    label: "在家感到很不安全",
  },
  {
    id: "yellow-odor",
    color: "黃",
    key: "self_care_observation",
    match: "includes",
    values: ["身上有異味(例如尿騷味)", "身上有異味"],
    label: "身上有異味",
  },
  {
    id: "green-health-poor",
    color: "綠",
    key: "health_self_rating",
    match: "equals",
    values: ["不太好"],
    label: "健康自評不太好",
  },
  {
    id: "green-hearing",
    color: "綠",
    key: "hearing_issue",
    match: "equals",
    values: ["是"],
    label: "重聽",
  },
  {
    id: "green-vision",
    color: "綠",
    key: "vision_issue",
    match: "equals",
    values: ["是"],
    label: "視力不好",
  },
  {
    id: "green-transport",
    color: "綠",
    key: "life_difficulties",
    match: "includes",
    values: ["外出交通不方便（例如缺乏公車或客運）", "外出交通不方便"],
    label: "外出交通不方便",
  },
  {
    id: "green-fraud",
    color: "綠",
    key: "worries",
    match: "includes",
    values: ["被詐騙"],
    label: "被詐騙",
  },
  {
    id: "green-lonely",
    color: "綠",
    key: "loneliness_2w",
    match: "includes",
    values: ["幾乎每天：12至14天", "幾乎每天"],
    label: "過去兩週幾乎每天覺得寂寞",
  },
  {
    id: "green-loss-interest",
    color: "綠",
    key: "loss_interest_2w",
    match: "includes",
    values: ["幾乎每天：12至14天", "幾乎每天"],
    label: "過去兩週幾乎每天失去興趣",
  },
  {
    id: "green-aid",
    color: "綠",
    key: "self_care_observation",
    match: "includes",
    values: ["使用器具(例如輪椅、拐杖)就可以自行移動", "使用器具可自行移動"],
    label: "使用輔具才可自行移動",
  },
];

function answerTokens(raw: MohwLifeCareAnswers[string]): string[] {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean);
  return String(raw)
    .split(/[;；、,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function ruleMatches(tokens: string[], rule: HighCareRule): string | null {
  if (tokens.length === 0) return null;
  if (rule.match === "equals") {
    const hit = tokens.find((token) => rule.values.includes(token));
    return hit ?? null;
  }
  const joined = tokens.join(";");
  const hit = rule.values.find((value) => tokens.some((token) => token.includes(value) || value.includes(token)) || joined.includes(value));
  return hit ?? null;
}

export function evaluateHighCare(answers: MohwLifeCareAnswers): HighCareEvaluation {
  const triggers: HighCareTrigger[] = [];

  for (const rule of HIGH_CARE_RULES) {
    const tokens = answerTokens(answers[rule.key]);
    const value = ruleMatches(tokens, rule);
    if (!value) continue;
    triggers.push({
      id: rule.id,
      color: rule.color,
      key: rule.key,
      label: rule.label,
      value,
    });
  }

  const colors = HIGH_CARE_COLOR_ORDER.filter((color) => triggers.some((item) => item.color === color));

  return {
    triggered: triggers.length > 0,
    colors,
    primaryColor: colors[0] ?? null,
    triggers,
  };
}

export function formatHighCareColors(colors: HighCareColor[]) {
  return colors.join(";");
}

export function formatHighCareTriggerKeys(triggers: HighCareTrigger[]) {
  return triggers.map((item) => item.key).join(";");
}

export function formatHighCareTriggerLabels(triggers: HighCareTrigger[]) {
  return triggers.map((item) => `${item.color}:${item.label}`).join("；");
}

export function formatHighCareTriggerValues(triggers: HighCareTrigger[]) {
  return triggers.map((item) => item.value).join("；");
}
