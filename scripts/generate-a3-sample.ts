import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { mohwLifeCareSampleAnswers } from "../lib/domain/mohw-life-care-ui";
import { evaluateHighCare } from "../lib/domain/high-care-rules";
import { buildNtpcA3OverlayPdf, careFormPdfFilename } from "../lib/domain/ntpc-a3-overlay";

async function main() {
  const answers = mohwLifeCareSampleAnswers;
  const highCare = evaluateHighCare(answers);
  const bytes = await buildNtpcA3OverlayPdf(answers, {
    elderName: String(answers.name ?? "吳秀枝"),
    caseCode: "NTPC-115-TEST-001",
  });

  const outDir = path.join(process.cwd(), "exports", "care-forms");
  mkdirSync(outDir, { recursive: true });
  const filename = careFormPdfFilename(
    String(answers.visit_date ?? ""),
    String(answers.name ?? "吳秀枝"),
  );
  const dest = path.join(outDir, filename);
  writeFileSync(dest, bytes);

  const documentsCopy = path.join("/Users/apple/Documents", filename);
  writeFileSync(documentsCopy, bytes);

  console.log(JSON.stringify({ dest, documentsCopy, bytes: bytes.length, highCare }, null, 2));
}

void main();
