var AuditModule = (function () {
  var SHEET = Config.SHEET_NAMES.AUDIT;

  function queue(params) {
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    return rows.filter(function (r) { return !r.decision; });
  }

  function enqueue(careformId) {
    return SheetHelper.appendRow(SHEET, {
      audit_id: 'AUD-' + Utilities.getUuid().slice(0, 8),
      careform_id: careformId,
      reviewer: '',
      decision: '',
      reason: '',
    });
  }

  function decide(data) {
    Validation.requireFields(data, ['audit_id', 'decision']);
    data.decided_at = new Date().toISOString();
    // TODO: update row; if 通過, update careform status
    return data;
  }

  return { queue: queue, enqueue: enqueue, decide: decide };
})();
