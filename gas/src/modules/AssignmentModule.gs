var AssignmentModule = (function () {
  var SHEET = Config.SHEET_NAMES.ASSIGNMENTS;

  function list(params) {
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    if (params.visitor_id) {
      rows = rows.filter(function (r) { return r.visitor_id === params.visitor_id; });
    }
    if (params.status) {
      rows = rows.filter(function (r) { return r.status === params.status; });
    }
    return rows;
  }

  function dispatch(data) {
    Validation.requireFields(data, ['case_id', 'visitor_id']);
    var caseRow = CaseModule.get(data.case_id);
    if (!caseRow) throw new Error('Case not found');

    var assignment = {
      assignment_id: 'ASG-' + Utilities.getUuid().slice(0, 8),
      batch_id: data.batch_id || '',
      case_id: data.case_id,
      encoded_id: caseRow.encoded_id,
      visitor_id: data.visitor_id,
      visit_village: caseRow.visit_village,
      status: '待接案',
      dispatched_at: new Date().toISOString(),
      due_date: data.due_date || '',
      notes: data.notes || '',
      updated_at: new Date().toISOString(),
    };
    return SheetHelper.appendRow(SHEET, assignment);
  }

  function confirm(data) {
    Validation.requireFields(data, ['assignment_id']);
    data.status = '進行中';
    data.confirmed_at = new Date().toISOString();
    data.updated_at = new Date().toISOString();
    // TODO: update row in place
    return data;
  }

  return { list: list, dispatch: dispatch, confirm: confirm };
})();
