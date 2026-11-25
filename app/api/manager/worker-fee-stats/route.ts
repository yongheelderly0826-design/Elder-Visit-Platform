import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerCapability } from "@/lib/api/authorization";
import { FEE_RATE_CARD_DEFAULTS, type FeeRateCard } from "@/lib/domain/fee-rate-card";
import { gasClient } from "@/lib/gas-client";

function asNumber(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function mapRateCard(raw: Record<string, unknown> | null | undefined): FeeRateCard {
  const base = { ...FEE_RATE_CARD_DEFAULTS };
  if (!raw) return base;
  const visit = (raw.visit ?? {}) as Record<string, unknown>;
  const builder = (raw.builder ?? {}) as Record<string, unknown>;
  const audit = (raw.audit ?? {}) as Record<string, unknown>;
  return {
    version: String(raw.version ?? base.version),
    effectiveFrom: String(raw.effectiveFrom ?? raw.effective_from ?? base.effectiveFrom),
    visit: {
      success: asNumber(visit.success, base.visit.success),
      missed: asNumber(visit.missed, base.visit.missed),
      refused: asNumber(visit.refused, base.visit.refused),
      not_found: asNumber(visit.not_found, base.visit.not_found),
      addr_unknown: asNumber(visit.addr_unknown, base.visit.addr_unknown),
    },
    builder: {
      success: asNumber(builder.success, base.builder.success),
      missed: asNumber(builder.missed, base.builder.missed),
      refused: asNumber(builder.refused, base.builder.refused),
      not_found: asNumber(builder.not_found, base.builder.not_found),
      addr_unknown: asNumber(builder.addr_unknown, base.builder.addr_unknown),
    },
    audit: {
      success: asNumber(audit.success, base.audit.success),
      missed: asNumber(audit.missed, base.audit.missed),
      refused: asNumber(audit.refused, base.audit.refused),
      not_found: asNumber(audit.not_found, base.audit.not_found),
      addr_unknown: asNumber(audit.addr_unknown, base.audit.addr_unknown),
    },
    builderOnlyFallback: asNumber(raw.builderOnlyFallback ?? raw.builder_only_fallback, base.builderOnlyFallback),
    auditPayeeName: String(raw.auditPayeeName ?? raw.audit_payee_name ?? base.auditPayeeName),
    auditPayeeRole: String(raw.auditPayeeRole ?? raw.audit_payee_role ?? base.auditPayeeRole),
    dualCivilSocial: "each_full_visit_fee",
    builderFeeOnlyToBuilder: Boolean(
      raw.builderFeeOnlyToBuilder ?? raw.builder_fee_only_to_builder ?? base.builderFeeOnlyToBuilder,
    ),
    requireAuditPass: Boolean(raw.requireAuditPass ?? raw.require_audit_pass ?? false),
    capSolo: asNumber(raw.capSolo ?? raw.cap_solo, base.capSolo),
    capJoint: asNumber(raw.capJoint ?? raw.cap_joint, base.capJoint),
    overrunMode: "soft_warn_only",
    source: raw.source === "sheet" ? "sheet" : "fallback",
  };
}

function mapPerson(raw: Record<string, unknown>) {
  const counts = (raw.counts ?? {}) as Record<string, unknown>;
  const amounts = (raw.amounts ?? {}) as Record<string, unknown>;
  return {
    person_key: String(raw.person_key ?? ""),
    name: String(raw.name ?? "—"),
    role: String(raw.role ?? "visitor"),
    counts: {
      success: asNumber(counts.success),
      missed: asNumber(counts.missed),
      refused: asNumber(counts.refused),
      not_found: asNumber(counts.not_found),
      addr_unknown: asNumber(counts.addr_unknown),
      total_cases: asNumber(counts.total_cases),
    },
    amounts: {
      visit: asNumber(amounts.visit),
      builder: asNumber(amounts.builder),
      audit: asNumber(amounts.audit),
      total: asNumber(amounts.total),
    },
  };
}

export async function GET(request: NextRequest) {
  const forbidden = requireManagerCapability(request, "payments.read");
  if (forbidden) return forbidden;

  const village = request.nextUrl.searchParams.get("village") || undefined;

  try {
    const raw = (await gasClient.workerFeeStats.summary(
      village ? { village_name: village } : undefined,
    )) as Record<string, unknown>;

    const totals = (raw.totals ?? {}) as Record<string, unknown>;
    const morph = (totals.morph ?? {}) as Record<string, unknown>;

    return NextResponse.json({
      ok: true,
      data: {
        computed_at: String(raw.computed_at ?? ""),
        village_filter: (raw.village_filter as string | null) ?? null,
        rate_card: mapRateCard(raw.rate_card as Record<string, unknown>),
        notes: Array.isArray(raw.notes) ? raw.notes.map(String) : [],
        totals: {
          cases_counted: asNumber(totals.cases_counted),
          dual_cases: asNumber(totals.dual_cases),
          visitor_people: asNumber(totals.visitor_people),
          builder_people: asNumber(totals.builder_people),
          morph: {
            success: asNumber(morph.success),
            missed: asNumber(morph.missed),
            refused: asNumber(morph.refused),
            not_found: asNumber(morph.not_found),
            addr_unknown: asNumber(morph.addr_unknown),
            total_cases: asNumber(morph.total_cases),
          },
          amount_visit: asNumber(totals.amount_visit),
          amount_builder: asNumber(totals.amount_builder),
          amount_audit: asNumber(totals.amount_audit),
        },
        visitors: Array.isArray(raw.visitors)
          ? raw.visitors.map((r) => mapPerson(r as Record<string, unknown>))
          : [],
        builders: Array.isArray(raw.builders)
          ? raw.builders.map((r) => mapPerson(r as Record<string, unknown>))
          : [],
        auditors: Array.isArray(raw.auditors)
          ? raw.auditors.map((r) => mapPerson(r as Record<string, unknown>))
          : [],
        case_warnings: Array.isArray(raw.case_warnings) ? raw.case_warnings : [],
        case_warnings_total: asNumber(raw.case_warnings_total),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "worker fee stats failed";
    return NextResponse.json({ ok: false, error: { message } }, { status: 502 });
  }
}
