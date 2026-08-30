/**
 * 衛福部生活關懷表 .xlsx 匯出
 * 對照官方 102 欄範本（docs/new-taipei-care-form-workflow.md）
 */

var ExportModule = (function () {
  var SHEET = Config.SHEET_NAMES.EXPORTS;

  function exportLifeCareXlsx(data) {
    Validation.requireFields(data, ['case_ids']);
    var caseIds = data.case_ids;
    var rows = [];

    caseIds.forEach(function (caseId) {
      var caseRow = CaseModule.get(caseId);
      var careforms = SheetHelper.findByKey(
        Config.SHEET_NAMES.CAREFORMS, 'encoded_id', caseRow.encoded_id
      );
      var latest = careforms[careforms.length - 1];
      rows.push({ case: caseRow, careform: latest });
    });

    // TODO: map to official 102-column template and create xlsx via Drive
    var exportRecord = {
      export_id: 'EXP-' + Utilities.getUuid().slice(0, 8),
      export_type: 'mohw_life_care',
      case_count: caseIds.length,
      file_url: '', // Drive file URL after generation
      exported_by: Session.getActiveUser().getEmail(),
      exported_at: new Date().toISOString(),
    };
    SheetHelper.appendRow(SHEET, exportRecord);

    return {
      export_id: exportRecord.export_id,
      case_count: caseIds.length,
      status: 'pending_generation',
      message: 'xlsx generation placeholder — implement 102-column mapping',
    };
  }

  function history(params) {
    return SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
  }

  return { exportLifeCareXlsx: exportLifeCareXlsx, history: history };
})();
