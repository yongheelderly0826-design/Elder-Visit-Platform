var CaseModule = (function () {
  var SHEET = Config.SHEET_NAMES.CASES;

  function list(params) {
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    if (params.district) {
      rows = rows.filter(function (r) {
        return r.visit_district === params.district;
      });
    }
    if (params.case_type) {
      rows = rows.filter(function (r) { return r.case_type === params.case_type; });
    }
    if (params.visit_status) {
      rows = rows.filter(function (r) { return r.visit_status === params.visit_status; });
    }
    return rows;
  }

  function get(id) {
    return SheetHelper.findByKey(SHEET, 'case_id', id)[0] || null;
  }

  function getByEncoded(code) {
    var found = SheetHelper.findByKey(SHEET, 'encoded_id', code)[0];
    if (!found) return null;
    // 去識別化：不返回姓名、身分證
    return {
      encoded_id: found.encoded_id,
      case_type: found.case_type,
      visit_village: found.visit_village,
      visit_status: found.visit_status,
      age: found.age,
    };
  }

  function importBatch(data) {
    var rows = data.rows || data;
    if (!Array.isArray(rows)) {
      throw new Error('rows must be an array');
    }
    var imported = [];
    rows.forEach(function (row) {
      if (row.id_number && !Validation.validateTaiwanId(row.id_number)) {
        row.data_quality_tag = (row.data_quality_tag || '') + ';invalid_id';
      }
      row.case_id = row.case_id || 'CASE-YH-' + Utilities.getUuid().slice(0, 8);
      row.encoded_id = row.encoded_id || IdEncoder.nextEncodedId();
      row.visit_status = row.visit_status || '待訪';
      row.imported_at = new Date().toISOString();
      SheetHelper.appendRow(SHEET, row);
      imported.push(row.case_id);
    });
    return { imported: imported.length, case_ids: imported };
  }

  return { list: list, get: get, getByEncoded: getByEncoded, importBatch: importBatch };
})();
