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

/**
 * 派案／簽到／送出／稽核後 3 秒寫入「每日訪視」一天一列 JSON（含 Drive 備份）。
 */
function runPendingDailyVisitSnapshots() {
  var propKey = 'pending_daily_visit_dates';
  var props = PropertiesService.getScriptProperties();
  var pending = {};
  try {
    pending = JSON.parse(props.getProperty(propKey) || '{}') || {};
  } catch (e) {
    pending = {};
  }
  props.setProperty(propKey, '{}');
  var dates = Object.keys(pending);
  for (var i = 0; i < dates.length; i++) {
    try {
      ReportModule.saveDailyVisitSnapshot({ date: dates[i] });
    } catch (err) {
      // 單一日期失敗不阻擋其餘日期
    }
  }
  var triggers = ScriptApp.getProjectTriggers();
  for (var j = 0; j < triggers.length; j++) {
    if (triggers[j].getHandlerFunction() === 'runPendingDailyVisitSnapshots') {
      ScriptApp.deleteTrigger(triggers[j]);
    }
  }
}
