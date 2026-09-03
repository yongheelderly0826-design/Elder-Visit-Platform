var VisitorModule = (function () {
  var SHEET = Config.SHEET_NAMES.VISITORS;

  function list(params) {
    SheetHelper.ensureColumns(SHEET, ['volunteer_group']);
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

  function extractTaiwanId_(raw) {
    var normalized = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    var match = normalized.match(/[A-Z][0-9]{9}/);
    return match ? match[0] : normalized;
  }

  function getByIdNumber(idNumber) {
    SheetHelper.ensureColumns(SHEET, ['volunteer_group']);
    var target = extractTaiwanId_(idNumber);
    if (!target) return null;
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    for (var i = 0; i < rows.length; i++) {
      if (extractTaiwanId_(rows[i].id_number) === target) return rows[i];
    }
    return null;
  }

  function create(data) {
    SheetHelper.ensureColumns(SHEET, ['volunteer_group']);
    Validation.requireFields(data, ['name', 'id_number', 'phone']);
    data.id_number = extractTaiwanId_(data.id_number);
    if (!Validation.validateTaiwanId(data.id_number)) {
      throw new Error('Invalid Taiwan ID');
    }
    if (getByIdNumber(data.id_number)) {
      var dup = new Error('此身分證已有志工資料');
      dup.code = 'VALIDATION_ERROR';
      throw dup;
    }
    data.visitor_id = data.visitor_id || 'V-YH-' + String(Date.now()).slice(-6);
    data.status = data.status || '待審';
    data.registered_at = new Date().toISOString();
    data.updated_at = data.registered_at;
    return SheetHelper.appendRow(SHEET, data);
  }

  function update(data) {
    SheetHelper.ensureColumns(SHEET, ['volunteer_group']);
    Validation.requireFields(data, ['visitor_id']);
    data.updated_at = new Date().toISOString();
    var updated = SheetHelper.updateByKey(SHEET, 'visitor_id', data.visitor_id, data);
    if (!updated) {
      var err = new Error('Visitor not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    return updated;
  }

  function approve(data) {
    Validation.requireFields(data, ['visitor_id']);
    data.status = '已核准';
    data.approved_at = new Date().toISOString();
    data.badge_no = data.badge_no || 'BADGE-' + data.visitor_id;
    return update(data);
  }

  return {
    list: list,
    get: get,
    getByIdNumber: getByIdNumber,
    create: create,
    update: update,
    approve: approve,
  };
})();
