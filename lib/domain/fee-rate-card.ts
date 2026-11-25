/**
 * Typed defaults / fallback for 計費參數.
 * Live truth is Google Sheet「計費參數」; do not use this as sole source for payroll.
 */

export type FeeMorph =
  | "success"
  | "missed"
  | "refused"
  | "not_found"
  | "addr_unknown";

export type FeeTrack = "visit" | "builder" | "audit";

export type DualCivilSocialMode = "each_full_visit_fee";

export type CapOverrunMode = "soft_warn_only";

export interface FeeRateCard {
  version: string;
  effectiveFrom: string;
  visit: Record<FeeMorph, number>;
  builder: Record<FeeMorph, number>;
  audit: Record<FeeMorph, number>;
  builderOnlyFallback: number;
  auditPayeeName: string;
  auditPayeeRole: string;
  dualCivilSocial: DualCivilSocialMode;
  builderFeeOnlyToBuilder: boolean;
  requireAuditPass: boolean;
  capSolo: number;
  capJoint: number;
  overrunMode: CapOverrunMode;
  source: "sheet" | "fallback";
}

export const FEE_RATE_CARD_DEFAULTS: FeeRateCard = {
  version: "2026-YH-official-v1",
  effectiveFrom: "2026-01-01",
  visit: {
    success: 180,
    missed: 100,
    refused: 30,
    not_found: 100,
    addr_unknown: 100,
  },
  builder: {
    success: 30,
    missed: 20,
    refused: 20,
    not_found: 20,
    addr_unknown: 20,
  },
  audit: {
    success: 40,
    missed: 30,
    refused: 10,
    not_found: 30,
    addr_unknown: 30,
  },
  builderOnlyFallback: 20,
  auditPayeeName: "沈煒庭",
  auditPayeeRole: "審",
  dualCivilSocial: "each_full_visit_fee",
  builderFeeOnlyToBuilder: true,
  requireAuditPass: false,
  capSolo: 250,
  capJoint: 500,
  overrunMode: "soft_warn_only",
  source: "fallback",
};

/** Seed rows for Sheet「計費參數」 */
export const FEE_RATE_PARAM_SEEDS: Array<{
  key: string;
  value: string;
  unit: string;
  note: string;
}> = [
  { key: "fee.rate_card.version", value: FEE_RATE_CARD_DEFAULTS.version, unit: "version", note: "費率卡版本" },
  { key: "fee.rate_card.effective_from", value: FEE_RATE_CARD_DEFAULTS.effectiveFrom, unit: "date", note: "生效起日" },
  { key: "fee.visit.success", value: "180", unit: "NT$", note: "實地訪視費・成功" },
  { key: "fee.visit.missed", value: "100", unit: "NT$", note: "實地訪視費・未遇" },
  { key: "fee.visit.refused", value: "30", unit: "NT$", note: "實地訪視費・拒訪" },
  { key: "fee.visit.not_found", value: "100", unit: "NT$", note: "查無・預設＝未遇" },
  { key: "fee.visit.addr_unknown", value: "100", unit: "NT$", note: "住址不詳・預設＝未遇" },
  { key: "fee.builder.success", value: "30", unit: "NT$", note: "建檔費・成功（只給建檔人）" },
  { key: "fee.builder.missed", value: "20", unit: "NT$", note: "建檔費・未遇" },
  { key: "fee.builder.refused", value: "20", unit: "NT$", note: "建檔費・拒訪" },
  { key: "fee.builder.not_found", value: "20", unit: "NT$", note: "查無・建檔費" },
  { key: "fee.builder.addr_unknown", value: "20", unit: "NT$", note: "住址不詳・建檔費" },
  { key: "fee.builder.builder_only_fallback", value: "20", unit: "NT$", note: "僅建檔無結果時" },
  { key: "fee.audit.success", value: "40", unit: "NT$", note: "行政稽核費・成功" },
  { key: "fee.audit.missed", value: "30", unit: "NT$", note: "行政稽核費・未遇" },
  { key: "fee.audit.refused", value: "10", unit: "NT$", note: "行政稽核費・拒訪" },
  { key: "fee.audit.not_found", value: "30", unit: "NT$", note: "查無・稽核費" },
  { key: "fee.audit.addr_unknown", value: "30", unit: "NT$", note: "住址不詳・稽核費" },
  { key: "fee.audit.payee_name", value: "沈煒庭", unit: "text", note: "稽核費受款人（可改課長）" },
  { key: "fee.audit.payee_role", value: "審", unit: "text", note: "稽核費受款角色提示" },
  { key: "rule.dual_civil_social", value: "each_full_visit_fee", unit: "enum", note: "社政＋民政各發" },
  { key: "rule.builder_fee_only_to_builder", value: "true", unit: "bool", note: "建檔費只給建檔人" },
  { key: "fee.require_audit_pass", value: "false", unit: "bool", note: "稽核通過才計費（預設關）" },
  { key: "rule.cap.solo_visit_case", value: "250", unit: "NT$", note: "獨訪參考上限（僅警示）" },
  { key: "rule.cap.joint_visit_case", value: "500", unit: "NT$", note: "共同訪視參考上限（僅警示）" },
  { key: "rule.cap.overrun_mode", value: "soft_warn_only", unit: "enum", note: "超額不砍不擋" },
];

export function morphFromVisitStatus(status: string): FeeMorph | null {
  const s = String(status || "").trim();
  if (!s) return null;
  if (s === "已完成" || s === "訪視成功" || s === "完成") return "success";
  if (s === "拒絕訪視" || s === "拒訪") return "refused";
  if (s === "查無此人" || s === "地址錯誤") return "not_found";
  if (s === "住址不詳") return "addr_unknown";
  if (s === "未遇" || s === "空訪" || s.includes("未遇")) return "missed";
  return null;
}

export function morphFromMarkOutcome(outcome: string): FeeMorph | null {
  const o = String(outcome || "").trim();
  if (!o) return null;
  if (o === "已完成" || o === "訪視成功" || o === "完成" || o === "success") return "success";
  if (o === "拒訪" || o === "拒絕訪視" || o === "refused") return "refused";
  if (o === "查無此人" || o === "not_found") return "not_found";
  if (o === "住址不詳" || o === "addr_unknown") return "addr_unknown";
  if (o === "未遇" || o === "missed") return "missed";
  return morphFromVisitStatus(o);
}

export function resolveCaseMorph(input: {
  visit_status?: string | null;
  mark_outcome?: string | null;
  visit_result?: string | null;
}): FeeMorph {
  return (
    morphFromVisitStatus(String(input.visit_status || "")) ||
    morphFromMarkOutcome(String(input.mark_outcome || "")) ||
    morphFromVisitStatus(String(input.visit_result || "")) ||
    "missed"
  );
}

export function feeFor(card: FeeRateCard, track: FeeTrack, morph: FeeMorph): number {
  if (track === "visit") return Number(card.visit[morph] || 0);
  if (track === "builder") return Number(card.builder[morph] || 0);
  return Number(card.audit[morph] || 0);
}

export function capThresholdForCase(card: FeeRateCard, hasCivil: boolean, hasSocial: boolean): number {
  return hasCivil && hasSocial ? card.capJoint : card.capSolo;
}

export function softWarnIfOverCap(total: number, cap: number, mode: CapOverrunMode): string | null {
  if (mode !== "soft_warn_only") return null;
  if (total > cap) return `案內加總 ${total} 元超過參考上限 ${cap} 元（僅警示，不折減）`;
  return null;
}

export interface WorkerFeePersonRow {
  person_key: string;
  name: string;
  role: "civil" | "social" | "builder" | "audit" | "visitor";
  counts: Partial<Record<FeeMorph, number>> & { total_cases: number };
  amounts: {
    visit: number;
    builder: number;
    audit: number;
    total: number;
  };
}

export function emptyMorphCounts(): WorkerFeePersonRow["counts"] {
  return {
    success: 0,
    missed: 0,
    refused: 0,
    not_found: 0,
    addr_unknown: 0,
    total_cases: 0,
  };
}
