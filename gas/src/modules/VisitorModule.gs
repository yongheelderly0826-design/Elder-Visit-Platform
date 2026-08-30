var VisitorModule = (function () {
  var SHEET = Config.SHEET_NAMES.VISITORS;

  function list(params) {
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    if (params.status) {
      rows = rows.filter(function (r) { return r.status === params.status; });
    }
    return rows;
  }

  function get(id) {
    var found = SheetHelper.findByKey(SHEET, 'visitor_id', id);
    return found[0] || null;
  }

  function create(data) {
    Validation.requireFields(data, ['name', 'id_number', 'phone']);
    if (!Validation.validateTaiwanId(data.id_number)) {
      throw new Error('Invalid Taiwan ID');
    }
    data.visitor_id = data.visitor_id || 'V-YH-' + String(Date.now()).slice(-6);
    data.status = data.status || '待審';
    data.registered_at = new Date().toISOString();
    return SheetHelper.appendRow(SHEET, data);
  }

  function update(data) {
    Validation.requireFields(data, ['visitor_id']);
    // TODO: find row and update in place
    return data;
  }

  function approve(data) {
    Validation.requireFields(data, ['visitor_id']);
    data.status = '已核准';
    data.approved_at = new Date().toISOString();
    data.badge_no = data.badge_no || 'BADGE-' + data.visitor_id;
    return update(data);
  }

  return { list: list, get: get, create: create, update: update, approve: approve };
})();
