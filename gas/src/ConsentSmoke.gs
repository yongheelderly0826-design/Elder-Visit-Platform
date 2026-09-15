/**
 * 可由 Apps Script 編輯器或 clasp run 執行；不讀寫外部資料。
 */
function runConsentTemplateSmokeChecks() {
  return ConsentModule.smokeCheck();
}
