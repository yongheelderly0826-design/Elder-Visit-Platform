import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { mohwLifeCareSampleAnswers } from "../lib/domain/mohw-life-care-ui";

loadEnvConfig(process.cwd());

async function main() {
  // Must import after loading .env.local because gas-client reads env at module initialization.
  const { gasClient } = await import("../lib/gas-client");
  const result = await gasClient.careform.generatePdf({
    answers: mohwLifeCareSampleAnswers as Record<string, unknown>,
    elder_name: String(mohwLifeCareSampleAnswers.name ?? "吳秀枝"),
    case_code: "NTPC-115-TEST-001",
    encoded_id: "NTPC-115-TEST-001",
    district: String(mohwLifeCareSampleAnswers.household_district ?? ""),
    include_base64: true,
  });
  const bytes = Buffer.from(result.pdf_base64, "base64");
  const localPath = path.join("/Users/apple/Documents", result.file_name);
  writeFileSync(localPath, bytes);
  console.log(
    JSON.stringify(
      {
        file_name: result.file_name,
        file_url: result.file_url,
        folder_url: result.folder_url,
        page_count: result.page_count,
        local_path: localPath,
        bytes: bytes.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
