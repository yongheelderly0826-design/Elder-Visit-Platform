var CaseModule = (function () {
  var SHEET = Config.SHEET_NAMES.CASES;

  function list(params) {
    params = params || {};
    var cacheKey = ReadCache.key(
      'caseL:' +
        String(params.district || '') +
        ':' +
        String(params.case_type || '') +
        ':' +
        String(params.visit_status || '')
    );
    var cached = ReadCache.getJson(cacheKey);
    if (cached) return cached;

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
    ReadCache.putJson(cacheKey, rows);
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
    var existing = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    var allocator = IdEncoder.createAllocator(existing);
    var imported = [];
    rows.forEach(function (row) {
      if (row.id_number && !Validation.validateTaiwanId(row.id_number)) {
        row.data_quality_tag = (row.data_quality_tag || '') + ';invalid_id';
      }
      row.case_id = row.case_id || 'CASE-YH-' + Utilities.getUuid().slice(0, 8);
      var requested = String(row.encoded_id || '').trim();
      // 匯入若帶了重複編碼（例如全部 YH-115-A001），改發新號
      if (requested && allocator.tryReserve(requested)) {
        row.encoded_id = requested;
      } else {
        row.encoded_id = allocator.next();
      }
      row.visit_status = row.visit_status || '待訪';
      row.imported_at = new Date().toISOString();
      row.updated_at = row.imported_at;
      SheetHelper.appendRow(SHEET, row);
      imported.push(row.case_id);
    });
    ReadCache.bump();
    return { imported: imported.length, case_ids: imported };
  }

  function patchEncodedOnSheet_(sheetName, keyField, keyToEncoded) {
    var sheet = SheetHelper.getSheet(sheetName);
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return 0;
    var headers = data[0];
    var keyIdx = headers.indexOf(keyField);
    var encodedIdx = headers.indexOf('encoded_id');
    if (keyIdx === -1 || encodedIdx === -1) return 0;

    var updated = 0;
    for (var r = 1; r < data.length; r++) {
      var key = String(data[r][keyIdx] || '').trim();
      var nextEncoded = keyToEncoded[key];
      if (!nextEncoded) continue;
      if (String(data[r][encodedIdx] || '') === nextEncoded) continue;
      data[r][encodedIdx] = nextEncoded;
      updated += 1;
    }
    if (updated > 0) {
      sheet.getRange(1, 1, data.length, headers.length).setValues(data);
    }
    return updated;
  }

  /**
   * 修復重複／空白的去識別化編碼，並同步派案／關懷表／高關懷／空訪。
   * 排序：imported_at → case_id，確保結果可重跑一致。
   */
  function reencodeAll() {
    var sheet = SheetHelper.getSheet(SHEET);
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return { cases: 0, changed: 0, assignments: 0, careforms: 0, high_care: 0, missed: 0 };
    }
    var headers = data[0];
    var caseIdIdx = headers.indexOf('case_id');
    var encodedIdx = headers.indexOf('encoded_id');
    var importedIdx = headers.indexOf('imported_at');
    var updatedIdx = headers.indexOf('updated_at');
    if (caseIdIdx === -1 || encodedIdx === -1) {
      throw new Error('個案名冊缺少 case_id / encoded_id 欄位');
    }

    var entries = [];
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][caseIdIdx] || '') === '') continue;
      entries.push({
        rowIndex: r,
        case_id: String(data[r][caseIdIdx]),
        encoded_id: String(data[r][encodedIdx] || '').trim(),
        imported_at: importedIdx >= 0 ? String(data[r][importedIdx] || '') : '',
      });
    }
    entries.sort(function (a, b) {
      if (a.imported_at !== b.imported_at) return a.imported_at < b.imported_at ? -1 : 1;
      return a.case_id < b.case_id ? -1 : a.case_id > b.case_id ? 1 : 0;
    });

    var prefix = Config.ENCODE_PREFIX();
    var used = {};
    var mapping = {}; // case_id -> encoded_id
    var changed = 0;
    var nextNum = 0;
    var now = new Date().toISOString();

    entries.forEach(function (entry) {
      var keep =
        entry.encoded_id &&
        entry.encoded_id.indexOf(prefix) === 0 &&
        !used[entry.encoded_id] &&
        !isNaN(IdEncoder.parseSuffixNum(entry.encoded_id));

      var nextEncoded;
      if (keep) {
        nextEncoded = entry.encoded_id;
        used[nextEncoded] = true;
        var keptNum = IdEncoder.parseSuffixNum(nextEncoded);
        if (!isNaN(keptNum) && keptNum > nextNum) nextNum = keptNum;
      } else {
        do {
          nextNum += 1;
          nextEncoded = IdEncoder.formatId(prefix, nextNum);
        } while (used[nextEncoded]);
        used[nextEncoded] = true;
      }

      mapping[entry.case_id] = nextEncoded;
      if (String(data[entry.rowIndex][encodedIdx] || '') !== nextEncoded) {
        data[entry.rowIndex][encodedIdx] = nextEncoded;
        if (updatedIdx >= 0) data[entry.rowIndex][updatedIdx] = now;
        changed += 1;
      }
    });

    if (changed > 0) {
      sheet.getRange(1, 1, data.length, headers.length).setValues(data);
    }

    var assignmentUpdated = patchEncodedOnSheet_(
      Config.SHEET_NAMES.ASSIGNMENTS,
      'case_id',
      mapping
    );

    // 關懷表／空訪沒有 case_id：先由派案建 assignment_id → encoded 對照
    var assignmentRows = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.ASSIGNMENTS)
    );
    var assignmentEncoded = {};
    assignmentRows.forEach(function (row) {
      var encoded = mapping[String(row.case_id || '')];
      if (encoded && row.assignment_id) {
        assignmentEncoded[String(row.assignment_id)] = encoded;
      }
    });

    var careformUpdated = patchEncodedOnSheet_(
      Config.SHEET_NAMES.CAREFORMS,
      'assignment_id',
      assignmentEncoded
    );
    var highCareUpdated = patchEncodedOnSheet_(
      Config.SHEET_NAMES.HIGH_CARE,
      'case_id',
      mapping
    );
    var missedUpdated = patchEncodedOnSheet_(
      Config.SHEET_NAMES.MISSED,
      'assignment_id',
      assignmentEncoded
    );

    ReadCache.bump();
    return {
      cases: entries.length,
      changed: changed,
      assignments: assignmentUpdated,
      careforms: careformUpdated,
      high_care: highCareUpdated,
      missed: missedUpdated,
      sample: entries.slice(0, 5).map(function (entry) {
        return {
          case_id: entry.case_id,
          encoded_id: mapping[entry.case_id],
        };
      }),
    };
  }

  return {
    list: list,
    get: get,
    getByEncoded: getByEncoded,
    importBatch: importBatch,
    reencodeAll: reencodeAll,
  };
})();
