/**
 * 里責任分配：一里可多人／組織；供關懷表獨立填表入口過濾。
 */
var VillageAdminModule = (function () {
  var SHEET = Config.SHEET_NAMES.VILLAGE_ADMINS;
  var HEADERS = [
    'assignment_row_id',
    'village_code',
    'village_name',
    'admin_display_name',
    'admin_kind',
    'admin_account_key',
    'matched_visitor_id',
    'status',
    'notes',
    'updated_at',
    'updated_by',
  ];

  function ensure_() {
    SheetHelper.ensureSheet(SHEET, HEADERS);
    SheetHelper.ensureColumns(SHEET, HEADERS);
  }

  function list(params) {
    params = params || {};
    ensure_();
    var cacheKey = ReadCache.key(
      'vaL:' + String(params.status || '') + ':' + String(params.village_name || '')
    );
    var cached = ReadCache.getJson(cacheKey);
    if (cached) return cached;

    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    if (params.status) {
      rows = rows.filter(function (r) {
        return String(r.status || 'active') === String(params.status);
      });
    }
    if (params.village_name) {
      rows = rows.filter(function (r) {
        return String(r.village_name || '') === String(params.village_name);
      });
    }
    ReadCache.putJson(cacheKey, rows);
    return rows;
  }

  function clearAll_() {
    ensure_();
    var sheet = SheetHelper.getSheet(SHEET);
    var last = sheet.getLastRow();
    if (last > 1) {
      sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).clearContent();
    }
  }

  function normalizeRow_(row, actor, now) {
    var villageName = String(row.village_name || '').trim();
    var display = String(row.admin_display_name || '').trim();
    if (!villageName || !display) {
      throw new Error('village_name and admin_display_name are required');
    }
    var kind = String(row.admin_kind || 'person').trim() || 'person';
    if (kind !== 'person' && kind !== 'org' && kind !== 'skip') kind = 'person';
    return {
      assignment_row_id: String(row.assignment_row_id || '').trim() || 'VA-' + Utilities.getUuid().slice(0, 8),
      village_code: String(row.village_code || '').trim(),
      village_name: villageName,
      admin_display_name: display,
      admin_kind: kind,
      admin_account_key: String(row.admin_account_key || display).trim() || display,
      matched_visitor_id: String(row.matched_visitor_id || '').trim(),
      status: String(row.status || 'active').trim() || 'active',
      notes: String(row.notes || '').trim(),
      updated_at: now,
      updated_by: actor,
    };
  }

  function replaceAll(body) {
    body = body || {};
    var rows = body.rows || [];
    if (!Array.isArray(rows)) throw new Error('rows must be an array');
    ensure_();
    if (body.mode === 'replace' || body.replace === true) {
      clearAll_();
    }
    var now = new Date().toISOString();
    var actor = String(body.updated_by || Session.getActiveUser().getEmail() || 'system');
    var written = 0;
    rows.forEach(function (row) {
      try {
        SheetHelper.appendRow(SHEET, normalizeRow_(row, actor, now));
        written += 1;
      } catch (e) {
        // skip incomplete rows on bulk import
      }
    });
    ReadCache.bump();
    return { written: written, total: list({}).length };
  }

  function upsert(body) {
    body = body || {};
    ensure_();
    var now = new Date().toISOString();
    var actor = String(body.updated_by || Session.getActiveUser().getEmail() || 'system');
    var row = normalizeRow_(body, actor, now);
    var existing = SheetHelper.updateByKey(SHEET, 'assignment_row_id', row.assignment_row_id, row);
    if (existing) {
      ReadCache.bump();
      return { action: 'updated', row: existing };
    }
    SheetHelper.appendRow(SHEET, row);
    ReadCache.bump();
    return { action: 'created', row: row };
  }

  function setStatus(body) {
    body = body || {};
    ensure_();
    var id = String(body.assignment_row_id || '').trim();
    var status = String(body.status || '').trim();
    if (!id) throw new Error('assignment_row_id is required');
    if (status !== 'active' && status !== 'inactive') {
      throw new Error('status must be active or inactive');
    }
    var updated = SheetHelper.updateByKey(SHEET, 'assignment_row_id', id, {
      status: status,
      updated_at: new Date().toISOString(),
      updated_by: String(body.updated_by || Session.getActiveUser().getEmail() || 'system'),
    });
    if (!updated) {
      var err = new Error('Village admin row not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    ReadCache.bump();
    return updated;
  }

  return {
    list: list,
    replaceAll: replaceAll,
    upsert: upsert,
    setStatus: setStatus,
  };
})();
