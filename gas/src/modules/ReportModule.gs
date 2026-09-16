var ReportModule = (function () {
  var SHEET = Config.SHEET_NAMES.REPORTS;

  function datePart_(value) {
    if (!value && value !== 0) return '';
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, 'Asia/Taipei', 'yyyy-MM-dd');
    }
    var raw = String(value);
    var match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    var parsed = new Date(raw);
    if (isNaN(parsed.getTime())) return '';
    return Utilities.formatDate(parsed, 'Asia/Taipei', 'yyyy-MM-dd');
  }

  function assignmentVisitDate_(row) {
    return (
      datePart_(row.due_date) ||
      datePart_(row.visit_date) ||
      datePart_(row.scheduled_date) ||
      datePart_(row.dispatched_at)
    );
  }

  function text_(value) {
    return value == null ? '' : String(value).trim();
  }

  function first_(row, keys) {
    if (!row) return '';
    for (var i = 0; i < keys.length; i++) {
      var value = text_(row[keys[i]]);
      if (value) return value;
    }
    return '';
  }

  function parseAnswers_(row) {
    if (!row) return {};
    if (row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers)) {
      return row.answers;
    }
    if (typeof row.answers_json === 'string' && row.answers_json) {
      try {
        var parsed = JSON.parse(row.answers_json);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch (e) {
        return {};
      }
    }
    return {};
  }

  function careSummary_(row) {
    if (!row) return '尚無關懷表內容';
    var explicit = first_(row, ['summary', 'content_summary', 'visit_summary', 'notes', 'note']);
    if (explicit) return explicit.slice(0, 180);
    var answers = parseAnswers_(row);
    var parts = [
      first_(row, ['health_status', 'living_status']),
      first_(answers, ['health_self_rating', 'living_status']),
      first_(answers, ['life_difficulties', 'worries']),
      first_(answers, ['home_safety_issues', 'home_hygiene_issues']),
      first_(answers, ['care_note', 'other_note']),
    ].filter(function (part) { return Boolean(part); });
    return parts.length ? parts.join('；').slice(0, 180) : '已填寫，無文字摘要';
  }

  function slimAssignment_(row) {
    return {
      assignment_id: row.assignment_id || '',
      case_id: row.case_id || '',
      encoded_id: row.encoded_id || '',
      visitor_id: row.visitor_id || '',
      status: row.status || '',
      due_date: row.due_date || '',
      dispatched_at: row.dispatched_at || '',
      notes: row.notes || '',
    };
  }

  function slimVisitor_(row) {
    return {
      visitor_id: row.visitor_id || '',
      name: row.name || '',
    };
  }

  function slimCase_(row) {
    return {
      case_id: row.case_id || '',
      encoded_id: row.encoded_id || '',
      external_id: row.external_id || '',
      name: row.name || '',
    };
  }

  function slimAttendance_(row) {
    return {
      assignment_id: row.assignment_id || '',
      visitor_id: row.visitor_id || '',
      worker_name: row.worker_name || '',
      session_date: datePart_(row.session_date),
      session_type: row.session_type || '',
      checkin_at: row.checkin_at || '',
      checkout_at: row.checkout_at || '',
      duration_minutes: row.duration_minutes || '',
    };
  }

  function slimCareform_(row) {
    return {
      assignment_id: row.assignment_id || '',
      visit_result: row.visit_result || '',
      status: row.status || '',
      completion_pct: row.completion_pct || 0,
      summary: careSummary_(row),
    };
  }

  function dailyVisitBundle(params) {
    params = params || {};
    var date = String(params.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      var err = new Error('日期格式錯誤，請使用 YYYY-MM-DD');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    var cacheKey = ReadCache.key('dvr:' + date);
    if (params.fresh !== '1' && params.fresh !== true && params.fresh !== 'true') {
      var cached = ReadCache.getJson(cacheKey);
      if (cached) return cached;
    }

    var assignmentRows = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.ASSIGNMENTS)
    );
    var dailyAssignments = assignmentRows.filter(function (row) {
      return assignmentVisitDate_(row) === date;
    });
    if (dailyAssignments.length === 0) {
      var emptyPayload = {
        date: date,
        assignments: [],
        visitors: [],
        cases: [],
        attendance: [],
        audits: [],
        careForms: [],
      };
      ReadCache.putJson(cacheKey, emptyPayload);
      return emptyPayload;
    }
    var assignmentIds = {};
    var visitorIds = {};
    var caseIds = {};
    dailyAssignments.forEach(function (row) {
      assignmentIds[String(row.assignment_id || '')] = true;
      visitorIds[String(row.visitor_id || '')] = true;
      caseIds[String(row.case_id || '')] = true;
    });

    var visitorRows = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.VISITORS)
    ).filter(function (row) {
      return visitorIds[String(row.visitor_id || '')];
    });
    var caseRows = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.CASES)
    ).filter(function (row) {
      return caseIds[String(row.case_id || '')];
    });

    var attendanceRows = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.ATTENDANCE)
    ).filter(function (row) {
      if (datePart_(row.session_date) !== date) return false;
      var assignmentId = String(row.assignment_id || '');
      if (assignmentId && assignmentIds[assignmentId]) return true;
      return String(row.session_type || '') === '訪查';
    });

    var careformRows = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.CAREFORMS)
    );
    var careByAssignment = {};
    var careById = {};
    careformRows.forEach(function (row) {
      var assignmentId = String(row.assignment_id || '');
      if (assignmentId && assignmentIds[assignmentId]) {
        careByAssignment[assignmentId] = row;
      }
      if (row.careform_id) careById[String(row.careform_id)] = row;
    });

    var auditRows = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.AUDIT)
    );
    var audits = [];
    auditRows.forEach(function (audit) {
      var care = careById[String(audit.careform_id || '')] || {};
      var assignmentId = String(care.assignment_id || audit.assignment_id || '');
      if (!assignmentId || !assignmentIds[assignmentId]) return;
      audits.push({
        assignment_id: assignmentId,
        decision: audit.decision || '',
        visit_result: care.visit_result || '',
        status: audit.decision || '',
        careform_status: care.status || '',
        completion_pct: care.completion_pct || 0,
      });
    });

    var payload = {
      date: date,
      assignments: dailyAssignments.map(slimAssignment_),
      visitors: visitorRows.map(slimVisitor_),
      cases: caseRows.map(slimCase_),
      attendance: attendanceRows.map(slimAttendance_),
      audits: audits,
      careForms: Object.keys(careByAssignment).map(function (id) {
        return slimCareform_(careByAssignment[id]);
      }),
    };
    ReadCache.putJson(cacheKey, payload);
    return payload;
  }

  function kpi(params) {
    var period = params.period || Config.FISCAL_YEAR();
    var assignments = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.ASSIGNMENTS)
    );
    var total = assignments.length;
    var completed = assignments.filter(function (a) {
      return a.status === '已完成';
    }).length;
    var missed = assignments.filter(function (a) {
      return a.status === '空訪';
    }).length;

    return {
      period: period,
      total_assignments: total,
      completed: completed,
      missed: missed,
      completion_rate: total > 0 ? Math.round(completed / total * 100) : 0,
    };
  }

  function dispatchSummary(params) {
    return kpi(params);
  }

  var REPORT_TYPE = 'daily_visit';
  var ROOT_FOLDER_PROP = 'SNAPSHOT_ROOT_FOLDER_ID';
  var DAILY_FOLDER_PROP = 'DAILY_VISIT_SNAPSHOT_FOLDER_ID';
  var PENDING_DATES_PROP = 'pending_daily_visit_dates';

  function todayTaipei_() {
    return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  }

  function findOrCreateFolder_(parent, name) {
    var folders = parent.getFoldersByName(name);
    return folders.hasNext() ? folders.next() : parent.createFolder(name);
  }

  function snapshotRootFolder_() {
    var props = PropertiesService.getScriptProperties();
    var cached = props.getProperty(ROOT_FOLDER_PROP);
    if (cached) {
      try {
        return DriveApp.getFolderById(cached);
      } catch (e) {
        // recreate below
      }
    }
    var parent = DriveApp.getRootFolder();
    try {
      var file = DriveApp.getFileById(Config.SPREADSHEET_ID());
      var parents = file.getParents();
      if (parents.hasNext()) parent = parents.next();
    } catch (e) {
      // keep root
    }
    var folder = findOrCreateFolder_(parent, '報表快照');
    props.setProperty(ROOT_FOLDER_PROP, folder.getId());
    return folder;
  }

  function dailyVisitBackupFolder_() {
    var props = PropertiesService.getScriptProperties();
    var cached = props.getProperty(DAILY_FOLDER_PROP);
    if (cached) {
      try {
        return DriveApp.getFolderById(cached);
      } catch (e) {
        // recreate below
      }
    }
    var folder = findOrCreateFolder_(snapshotRootFolder_(), '每日訪視統計');
    props.setProperty(DAILY_FOLDER_PROP, folder.getId());
    return folder;
  }

  function writeDriveBackup_(date, payload) {
    var folder = dailyVisitBackupFolder_();
    var fileName = date + '.json';
    var body = JSON.stringify(payload, null, 2);
    var existing = folder.getFilesByName(fileName);
    var file;
    if (existing.hasNext()) {
      file = existing.next();
      file.setContent(body);
    } else {
      file = folder.createFile(Utilities.newBlob(body, 'application/json', fileName));
    }
    return {
      file_id: file.getId(),
      file_url: file.getUrl(),
      file_name: file.getName(),
    };
  }

  function loadPayloadFromDrive_(date) {
    try {
      var files = dailyVisitBackupFolder_().getFilesByName(date + '.json');
      if (!files.hasNext()) return null;
      return JSON.parse(files.next().getBlob().getDataAsString());
    } catch (e) {
      return null;
    }
  }

  function findSnapshotRow_(date) {
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].report_type) === REPORT_TYPE && String(rows[i].period) === date) {
        return rows[i];
      }
    }
    return null;
  }

  function parseSnapshotPayload_(row) {
    if (!row || row.data_json === '' || row.data_json == null) return null;
    try {
      return typeof row.data_json === 'string' ? JSON.parse(row.data_json) : row.data_json;
    } catch (e) {
      return null;
    }
  }

  function upsertSnapshotRow_(date, payload) {
    var now = new Date().toISOString();
    var existing = findSnapshotRow_(date);
    var patch = {
      report_type: REPORT_TYPE,
      period: date,
      data_json: JSON.stringify(payload),
      created_at: now,
    };
    if (existing && existing.snapshot_id) {
      SheetHelper.updateByKey(SHEET, 'snapshot_id', existing.snapshot_id, patch);
      patch.snapshot_id = existing.snapshot_id;
      return patch;
    }
    patch.snapshot_id = 'SNAP-DV-' + date.replace(/-/g, '');
    return SheetHelper.appendRow(SHEET, patch);
  }

  function saveDailyVisitSnapshot(params) {
    params = params || {};
    var date = String(params.date || todayTaipei_()).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      var err = new Error('日期格式錯誤，請使用 YYYY-MM-DD');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    var payload = dailyVisitBundle({ date: date, fresh: '1' });
    payload.generated_at = new Date().toISOString();
    payload.source = 'snapshot';
    var backup = { file_id: '', file_url: '', file_name: '' };
    try {
      backup = writeDriveBackup_(date, payload);
    } catch (e) {
      // Drive 備份失敗仍保留試算表一列
    }
    payload.backup = backup;
    upsertSnapshotRow_(date, payload);
    return payload;
  }

  function getDailyVisitSnapshot(params) {
    params = params || {};
    var date = String(params.date || todayTaipei_()).trim();
    var fresh = params.fresh === '1' || params.fresh === true || params.fresh === 'true';
    if (!fresh) {
      var parsed = parseSnapshotPayload_(findSnapshotRow_(date)) || loadPayloadFromDrive_(date);
      if (parsed) {
        parsed.source = parsed.source || 'snapshot';
        parsed.date = parsed.date || date;
        return parsed;
      }
    }
    return saveDailyVisitSnapshot({ date: date });
  }

  function scheduleDailyVisitSnapshot(date) {
    date = String(date || todayTaipei_()).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    try {
      var props = PropertiesService.getScriptProperties();
      var pending = {};
      try {
        pending = JSON.parse(props.getProperty(PENDING_DATES_PROP) || '{}') || {};
      } catch (e) {
        pending = {};
      }
      pending[date] = true;
      props.setProperty(PENDING_DATES_PROP, JSON.stringify(pending));
      var triggers = ScriptApp.getProjectTriggers();
      var exists = false;
      for (var i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === 'runPendingDailyVisitSnapshots') {
          exists = true;
          break;
        }
      }
      if (!exists) {
        ScriptApp.newTrigger('runPendingDailyVisitSnapshots').timeBased().after(3000).create();
      }
    } catch (e) {
      // 觸發器權限不足時略過，讀取頁會現算並存檔
    }
  }

  return {
    kpi: kpi,
    dispatchSummary: dispatchSummary,
    dailyVisitBundle: dailyVisitBundle,
    saveDailyVisitSnapshot: saveDailyVisitSnapshot,
    getDailyVisitSnapshot: getDailyVisitSnapshot,
    scheduleDailyVisitSnapshot: scheduleDailyVisitSnapshot,
  };
})();
