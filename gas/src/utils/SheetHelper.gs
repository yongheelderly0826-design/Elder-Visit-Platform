/**
 * 試算表讀寫工具
 */

var SheetHelper = (function () {
  function getSpreadsheet() {
    var id = Config.SPREADSHEET_ID();
    if (!id) {
      throw new Error('SPREADSHEET_ID not configured');
    }
    return SpreadsheetApp.openById(id);
  }

  function getSheet(name) {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      throw new Error('Sheet not found: ' + name);
    }
    return sheet;
  }

  function getHeaders(sheet) {
    return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  }

  function rowsToObjects(sheet) {
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];
    var headers = data[0];
    return data.slice(1).filter(function (row) {
      return row[0] !== '';
    }).map(function (row) {
      var obj = {};
      headers.forEach(function (h, i) {
        obj[h] = row[i];
      });
      return obj;
    });
  }

  function appendRow(sheetName, obj) {
    var sheet = getSheet(sheetName);
    var headers = getHeaders(sheet);
    var row = headers.map(function (h) {
      return obj[h] !== undefined ? obj[h] : '';
    });
    sheet.appendRow(row);
    logOperation_('append', sheetName, obj);
    return obj;
  }

  function findByKey(sheetName, keyField, keyValue) {
    var rows = rowsToObjects(getSheet(sheetName));
    return rows.filter(function (r) {
      return String(r[keyField]) === String(keyValue);
    });
  }

  /**
   * 依 key 更新第一筆符合的列；patch 合併進現有物件後寫回。
   */
  function updateByKey(sheetName, keyField, keyValue, patch) {
    var sheet = getSheet(sheetName);
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return null;
    var headers = data[0];
    var keyIdx = headers.indexOf(keyField);
    if (keyIdx === -1) throw new Error('Unknown key field: ' + keyField);

    for (var r = 1; r < data.length; r++) {
      if (String(data[r][keyIdx]) !== String(keyValue)) continue;
      var obj = {};
      headers.forEach(function (h, i) {
        obj[h] = data[r][i];
      });
      Object.keys(patch || {}).forEach(function (k) {
        obj[k] = patch[k];
      });
      var rowValues = headers.map(function (h) {
        return obj[h] !== undefined ? obj[h] : '';
      });
      sheet.getRange(r + 1, 1, 1, headers.length).setValues([rowValues]);
      logOperation_('update', sheetName, obj);
      return obj;
    }
    return null;
  }

  function initAllSheets() {
    var ss = getSpreadsheet();
    var templates = {
      '_設定': ['key', 'value', 'description'],
      '訪查員主檔': ['visitor_id', 'name', 'id_number', 'phone', 'email', 'service_areas', 'volunteer_group', 'status', 'badge_no', 'photo_url', 'bank_account', 'registered_at', 'approved_at', 'updated_at'],
      '個案名冊': ['case_id', 'external_id', 'case_type', 'name', 'id_number', 'gender', 'birth_date', 'age', 'household_district', 'household_village', 'visit_district', 'visit_village', 'address', 'primary_phone', 'secondary_phone', 'contact_note', 'visit_status', 'dispatch_priority', 'encoded_id', 'data_quality_tag', 'imported_at', 'updated_at'],
      '派案紀錄': ['assignment_id', 'batch_id', 'case_id', 'encoded_id', 'visitor_id', 'visit_village', 'status', 'dispatched_at', 'confirmed_at', 'due_date', 'notes', 'updated_at'],
      '簽到退紀錄': ['attendance_id', 'visitor_id', 'assignment_id', 'session_date', 'checkin_at', 'checkout_at', 'checkin_lat', 'checkin_lng', 'checkout_lat', 'checkout_lng', 'session_type', 'duration_minutes', 'channel', 'site_id', 'site_name', 'group_id', 'group_name', 'worker_name', 'id_number', 'source'],
      '關懷表登打': ['careform_id', 'assignment_id', 'encoded_id', 'visitor_id', 'visit_result', 'completion_pct', 'answers_json', 'consent_signed', 'photo_urls', 'status', 'submitted_at', 'audited_at'],
      '空訪紀錄': ['missed_visit_id', 'assignment_id', 'encoded_id', 'visitor_id', 'photo_urls', 'notes', 'recorded_at'],
      '稽核佇列': ['audit_id', 'careform_id', 'reviewer', 'decision', 'reason', 'decided_at'],
      '車馬費核銷': ['payment_id', 'visitor_id', 'period', 'visit_count', 'total_hours', 'amount', 'status', 'locked_at'],
      '匯出紀錄': ['export_id', 'export_type', 'case_count', 'file_url', 'exported_by', 'exported_at'],
      '報表快照': ['snapshot_id', 'report_type', 'period', 'data_json', 'created_at'],
      '_操作日誌': ['log_id', 'action', 'sheet', 'record_id', 'actor', 'timestamp', 'detail'],
    };

    Object.keys(templates).forEach(function (name) {
      var sheet = ss.getSheetByName(name);
      if (!sheet) {
        sheet = ss.insertSheet(name);
      }
      if (sheet.getLastRow() === 0) {
        sheet.getRange(1, 1, 1, templates[name].length).setValues([templates[name]]);
        sheet.setFrozenRows(1);
      } else {
        ensureColumns(name, templates[name]);
      }
    });
  }

  /**
   * 在既有 Sheet 右側補上缺失欄位，不覆寫舊資料。
   */
  function ensureColumns(sheetName, extraHeaders) {
    var sheet = getSheet(sheetName);
    if (!extraHeaders || extraHeaders.length === 0) return [];
    if (sheet.getLastColumn() === 0 || sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, extraHeaders.length).setValues([extraHeaders]);
      sheet.setFrozenRows(1);
      return extraHeaders.slice();
    }
    var headers = getHeaders(sheet).map(String);
    var missing = extraHeaders.filter(function (h) {
      return headers.indexOf(String(h)) === -1;
    });
    if (!missing.length) return headers;
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    return headers.concat(missing);
  }

  function logOperation_(action, sheet, record) {
    try {
      var logSheet = getSheet(Config.SHEET_NAMES.LOG);
      logSheet.appendRow([
        Utilities.getUuid(),
        action,
        sheet,
        record.visitor_id || record.case_id || record.assignment_id || '',
        Session.getActiveUser().getEmail(),
        new Date().toISOString(),
        JSON.stringify(record).substring(0, 500),
      ]);
    } catch (e) {
      Logger.log('Log failed: ' + e);
    }
  }

  return {
    getSpreadsheet: getSpreadsheet,
    getSheet: getSheet,
    getHeaders: getHeaders,
    rowsToObjects: rowsToObjects,
    appendRow: appendRow,
    findByKey: findByKey,
    updateByKey: updateByKey,
    ensureColumns: ensureColumns,
    initAllSheets: initAllSheets,
  };
})();
