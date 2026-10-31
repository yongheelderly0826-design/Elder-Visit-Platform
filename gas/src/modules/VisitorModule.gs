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

    SheetHelper.ensureColumns(SHEET, ['volunteer_group', 'job_title', 'gender', 'department']);
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
          job_title: r.job_title || '',
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
    SheetHelper.ensureColumns(SHEET, ['volunteer_group', 'job_title']);
    var target = extractTaiwanId_(idNumber);
    if (!target) return null;
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    for (var i = 0; i < rows.length; i++) {
      if (extractTaiwanId_(rows[i].id_number) === target) return rows[i];
    }
    return null;
  }

  function persistHeadshot_(dataUrl, visitorId) {
    var value = String(dataUrl || '');
    var match = value.match(/^data:(image\/[A-Za-z0-9.+-]+);base64,(.+)$/);
    if (!match) return value;
    var folders = DriveApp.getFoldersByName('_訪員註冊證件照');
    var folder = folders.hasNext()
      ? folders.next()
      : DriveApp.getRootFolder().createFolder('_訪員註冊證件照');
    var extension = match[1].indexOf('png') >= 0 ? 'png' : 'jpg';
    var blob = Utilities.newBlob(
      Utilities.base64Decode(match[2].replace(/\s/g, '')),
      match[1],
      visitorId + '-desk-headshot.' + extension
    );
    return folder.createFile(blob).getUrl();
  }

  function create(data) {
    SheetHelper.ensureColumns(SHEET, ['volunteer_group', 'job_title', 'gender', 'department']);
    var deskMinimal = Boolean(data && data.desk_minimal);
    // desk_minimal = auto-approve for KEY ops; still requires full registration fields (no empty id).
    Validation.requireFields(data, ['name', 'id_number', 'phone']);
    data.id_number = extractTaiwanId_(data.id_number);
    if (!data.id_number || !Validation.validateTaiwanId(data.id_number)) {
      throw new Error('身分證字號格式不正確');
    }
    if (getByIdNumber(data.id_number)) {
      var dup = new Error('此身分證已有訪查員資料');
      dup.code = 'VALIDATION_ERROR';
      throw dup;
    }
    data.email = String(data.email || '').trim().toLowerCase();
    if (deskMinimal && !data.email) {
      throw new Error('新增訪查員請填姓名、手機、身分證、信箱與證件照');
    }
    data.visitor_id = data.visitor_id || 'V-YH-' + String(Date.now()).slice(-6);
    data.status = data.status || (deskMinimal ? '已核准' : '待審');
    if (deskMinimal && data.status === '已核准') {
      data.approved_at = new Date().toISOString();
      data.badge_no = data.badge_no || 'BADGE-' + data.visitor_id;
    }
    if (data.photo_url && /^data:image\//.test(String(data.photo_url))) {
      data.photo_url = persistHeadshot_(data.photo_url, data.visitor_id);
    } else if (deskMinimal && !data.photo_url) {
      throw new Error('新增訪查員請填姓名、手機、身分證、信箱與證件照');
    }
    data.gender = String(data.gender || '').trim();
    data.department = String(data.department || '').trim();
    data.job_title = String(data.job_title || '').trim();
    data.volunteer_group = String(data.volunteer_group || '').trim();
    data.registered_at = new Date().toISOString();
    data.updated_at = data.registered_at;
    delete data.desk_minimal;
    var created = SheetHelper.appendRow(SHEET, data);
    ReadCache.bump();
    return created;
  }

  function update(data) {
    SheetHelper.ensureColumns(SHEET, ['volunteer_group', 'job_title', 'gender', 'department']);
    Validation.requireFields(data, ['visitor_id']);
    if (data.id_number != null && String(data.id_number).trim()) {
      data.id_number = extractTaiwanId_(data.id_number);
      if (!Validation.validateTaiwanId(data.id_number)) {
        throw new Error('身分證字號格式不正確');
      }
    }
    if (data.email != null) {
      data.email = String(data.email || '').trim().toLowerCase();
    }
    if (data.photo_url && /^data:image\//.test(String(data.photo_url))) {
      data.photo_url = persistHeadshot_(data.photo_url, data.visitor_id);
    }
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
