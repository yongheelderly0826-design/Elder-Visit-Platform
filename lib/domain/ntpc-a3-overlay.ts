import type { MohwLifeCareAnswers } from "@/lib/domain/mohw-life-care-form";
import { buildNtpcA3FullFormPdf } from "@/lib/domain/ntpc-a3-form";

/** 完整 A3：題目、選項與已填答案一起印（不再只印資料層）。 */
export async function buildNtpcA3OverlayPdf(
  answers: MohwLifeCareAnswers,
  meta?: { elderName?: string; caseCode?: string },
): Promise<Uint8Array> {
  return buildNtpcA3FullFormPdf(answers, meta);
}

export function careFormPdfFilename(visitDate?: string, elderName?: string) {
  const rawDate = String(visitDate ?? "");
  const iso = rawDate.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  const roc = rawDate.match(/^(\d{3})[-/](\d{1,2})[-/](\d{1,2})/);
  const date = iso
    ? `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`
    : roc
      ? `${Number(roc[1]) + 1911}-${roc[2].padStart(2, "0")}-${roc[3].padStart(2, "0")}`
      : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
  const name = String(elderName || "未命名個案")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return `${date}_${name}.pdf`;
}
