var AssignmentModule = (function () {
  var SHEET = Config.SHEET_NAMES.ASSIGNMENTS;
  var ACTIVE_STATUSES = { '待接案': true, '進行中': true, '空訪續訪': true };

  function list(params) {
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    if (params.visitor_id) {
      rows = rows.filter(function (r) { return r.visitor_id === params.visitor_id; });
    }
    if (params.status) {
      rows = rows.filter(function (r) { return r.status === params.status; });
    }
    if (params.active_only === true || params.active_only === 'true') {
      rows = rows.filter(function (r) { return ACTIVE_STATUSES[r.status]; });
    }
    return rows;
  }

  function get(assignmentId) {
    return SheetHelper.findByKey(SHEET, 'assignment_id', assignmentId)[0] || null;
  }

  function countAttempts_(caseId) {
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    return rows.filter(function (r) { return String(r.case_id) === String(caseId); }).length;
  }

  function dispatch(data) {
    Validation.requireFields(data, ['case_id', 'visitor_id']);
    var caseRow = CaseModule.get(data.case_id);
    if (!caseRow) throw new Error('Case not found');

    var existingActive = list({}).filter(function (r) {
      return String(r.case_id) === String(data.case_id) && ACTIVE_STATUSES[r.status];
    });
    if (existingActive.length > 0) {
      var err = new Error(
        '此個案已有進行中的派案：' + existingActive[0].assignment_id + '，無法重複分配'
      );
      err.code = 'CONFLICT';
      throw err;
    }

    var autoConfirm = data.auto_confirm !== false && data.auto_confirm !== 'false';
    var now = new Date().toISOString();
    var assignment = {
      assignment_id: 'ASG-' + Utilities.getUuid().slice(0, 8),
      batch_id: data.batch_id || '',
      case_id: data.case_id,
      encoded_id: caseRow.encoded_id,
      visitor_id: data.visitor_id,
      visit_village: caseRow.visit_village,
      status: autoConfirm ? '進行中' : '待接案',
      dispatched_at: now,
      confirmed_at: autoConfirm ? now : '',
      due_date: data.due_date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      notes: data.notes || '',
      updated_at: now,
    };
    var saved = SheetHelper.appendRow(SHEET, assignment);

    SheetHelper.updateByKey(Config.SHEET_NAMES.CASES, 'case_id', data.case_id, {
      visit_status: '進行中',
      updated_at: now,
    });

    saved.visit_attempt = countAttempts_(data.case_id);
    return saved;
  }

  function confirm(data) {
    Validation.requireFields(data, ['assignment_id']);
    var patch = {
      status: '進行中',
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (data.notes) patch.notes = data.notes;
    var updated = SheetHelper.updateByKey(SHEET, 'assignment_id', data.assignment_id, patch);
    if (!updated) {
      var err = new Error('Assignment not found: ' + data.assignment_id);
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (updated.case_id) {
      SheetHelper.updateByKey(Config.SHEET_NAMES.CASES, 'case_id', updated.case_id, {
        visit_status: '進行中',
        updated_at: new Date().toISOString(),
      });
    }
    return updated;
  }

  return { list: list, get: get, dispatch: dispatch, confirm: confirm };
})();
