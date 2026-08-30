/**
 * 試算表編輯觸發器（於 Apps Script 編輯器手動設定）
 */

function onEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet().getName();
  // 防止人工修改 _操作日誌
  if (sheet === '_操作日誌') {
    e.range.setValue(e.oldValue);
  }
}

/**
 * 每日報表快照（定時觸發 06:00）
 */
function dailyReportSnapshot() {
  var kpi = ReportModule.kpi({ period: Config.FISCAL_YEAR() });
  SheetHelper.appendRow(Config.SHEET_NAMES.REPORTS, {
    snapshot_id: 'SNAP-' + Utilities.getUuid().slice(0, 8),
    report_type: 'kpi_daily',
    period: Config.FISCAL_YEAR(),
    data_json: JSON.stringify(kpi),
    created_at: new Date().toISOString(),
  });
}
