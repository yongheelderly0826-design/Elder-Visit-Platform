var VisitorModule = (function () {
  var SHEET = Config.SHEET_NAMES.VISITORS;

  function list(params) {
    params = params || {};
    var slim = params.slim === true || params.slim === 'true';
    // slim2：含 id_number，供關懷表社政／民政搜尋帶入
    var cacheKey = ReadCache.key(
      'visL:' + String(params.status || '') + ':' + (slim ? 'slim2' : 'full')
    );
    var cached = ReadCache.getJson(cacheKey);
    if (cached) return cached;

    SheetHelper.ensureColumns(SHEET, ['volunteer_group']);
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    if (params.status) {
      rows = rows.filter(function (r) { return r.status === params.status; });
    }
    // 紙本建檔只需少數欄，縮小後才進得了 CacheService（約 90KB）。
    if (slim) {
      rows = rows.map(function (r) {
        return {
          visitor_id: r.visitor_id,
          name: r.name || r.full_name || '',
          email: r.email || '',
          phone: r.phone || '',
          id_number: r.id_number || '',
          status: r.status || '',
          badge_no: r.badge_no || '',
          volunteer_group: r.volunteer_group || '',
        };
      });
    }
    ReadCache.putJson(cacheKey, rows);
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
    var deskMinimal = Boolean(data && data.desk_minimal);
    Validation.requireFields(data, deskMinimal ? ['name', 'phone'] : ['name', 'id_number', 'phone']);
    data.id_number = extractTaiwanId_(data.id_number);
    if (deskMinimal && !data.id_number) {
      data.id_number = '';
      data.data_quality_tag = String(data.data_quality_tag || '') + ';desk_no_id';
    } else {
      if (!Validation.validateTaiwanId(data.id_number)) {
        throw new Error('Invalid Taiwan ID');
      }
      if (getByIdNumber(data.id_number)) {
        var dup = new Error('此身分證已有志工資料');
        dup.code = 'VALIDATION_ERROR';
        throw dup;
      }
    }
    data.visitor_id = data.visitor_id || 'V-YH-' + String(Date.now()).slice(-6);
    data.status = data.status || (deskMinimal ? '已核准' : '待審');
    if (deskMinimal && data.status === '已核准') {
      data.approved_at = new Date().toISOString();
      data.badge_no = data.badge_no || 'BADGE-' + data.visitor_id;
    }
    data.email = String(data.email || '').trim().toLowerCase();
    data.registered_at = new Date().toISOString();
    data.updated_at = data.registered_at;
    delete data.desk_minimal;
    var created = SheetHelper.appendRow(SHEET, data);
    ReadCache.bump();
    return created;
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
    ReadCache.bump();
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
