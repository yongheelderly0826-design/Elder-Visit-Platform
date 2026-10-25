/**
 * 營運維護：清測試派案／關懷表等（保留個案名冊、里責任分配、訪查員）。
 */
var OpsModule = (function () {
  function countRows_(sheetName) {
    var sheet = SheetHelper.getSheet(sheetName);
    return Math.max(0, sheet.getLastRow() - 1);
  }

  /**
   * 將個案訪視狀態還原為「待訪」（紙本 KEY 前清測試用）。
   */
  function resetCaseVisitStatusToPending_() {
    var sheet = SheetHelper.getSheet(Config.SHEET_NAMES.CASES);
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { scanned: 0, reset: 0 };
    var headers = data[0];
    var statusIdx = headers.indexOf('visit_status');
    var updatedIdx = headers.indexOf('updated_at');
    if (statusIdx === -1) return { scanned: 0, reset: 0, error: 'visit_status missing' };

    var reset = 0;
    var now = new Date().toISOString();
    for (var r = 1; r < data.length; r++) {
      var status = String(data[r][statusIdx] || '').trim();
      if (!status || status === '待訪') continue;
      data[r][statusIdx] = '待訪';
      if (updatedIdx !== -1) data[r][updatedIdx] = now;
      reset++;
    }
    if (reset > 0) {
      sheet.getRange(1, 1, data.length, headers.length).setValues(data);
    }
    return { scanned: data.length - 1, reset: reset };
  }

  /**
   * @param {{ confirm?: boolean|string }} data
   */
  function clearVisitTestData(data) {
    data = data || {};
    var ok =
      data.confirm === true ||
      data.confirm === 'true' ||
      String(data.confirm || '').toUpperCase() === 'YES';
    if (!ok) {
      var err = new Error('請傳 confirm=YES 才會清除測試派案／關懷表資料');
      err.code = 'VALIDATION';
      throw err;
    }

    var names = Config.SHEET_NAMES;
    var before = {
      assignments: countRows_(names.ASSIGNMENTS),
      careforms: countRows_(names.CAREFORMS),
      missed: countRows_(names.MISSED),
      audit: countRows_(names.AUDIT),
      high_care: countRows_(names.HIGH_CARE),
      payments: countRows_(names.PAYMENTS),
      cases: countRows_(names.CASES),
      village_admins: countRows_(names.VILLAGE_ADMINS),
      visitors: countRows_(names.VISITORS),
    };

    var deleted = {
      assignments: SheetHelper.clearDataRows(names.ASSIGNMENTS),
      careforms: SheetHelper.clearDataRows(names.CAREFORMS),
      missed: SheetHelper.clearDataRows(names.MISSED),
      audit: SheetHelper.clearDataRows(names.AUDIT),
      high_care: SheetHelper.clearDataRows(names.HIGH_CARE),
      payments: SheetHelper.clearDataRows(names.PAYMENTS),
    };

    var caseReset = resetCaseVisitStatusToPending_();
    ReadCache.bump();

    return {
      kept: {
        cases: before.cases,
        village_admins: before.village_admins,
        visitors: before.visitors,
      },
      before: before,
      deleted: deleted,
      case_visit_status_reset: caseReset,
      note: '已清空派案／關懷表／空訪／稽核／高關懷／車馬費；個案與里責任／訪查員保留。關懷表僅剩表頭，建檔時用系統預設值。',
    };
  }

  return {
    clearVisitTestData: clearVisitTestData,
  };
})();
