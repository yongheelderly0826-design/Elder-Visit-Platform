var AssignmentModule = (function () {
  var SHEET = Config.SHEET_NAMES.ASSIGNMENTS;
  var ACTIVE_STATUSES = { '待接案': true, '進行中': true, '空訪續訪': true };

  function list(params) {
    params = params || {};
    var cacheKey = ReadCache.key(
      'asgL:' +
        String(params.visitor_id || '') +
        ':' +
        String(params.status || '') +
        ':' +
        String(params.active_only || '')
    );
    var cached = ReadCache.getJson(cacheKey);
    if (cached) return cached;

    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    if (params.visitor_id) {
      var wantedVisitor = String(params.visitor_id).trim();
      rows = rows.filter(function (r) {
        return String(r.visitor_id || '').trim() === wantedVisitor;
      });
    }
    if (params.status) {
      rows = rows.filter(function (r) { return r.status === params.status; });
    }
    if (params.active_only === true || params.active_only === 'true') {
      rows = rows.filter(function (r) { return ACTIVE_STATUSES[r.status]; });
    }
    ReadCache.putJson(cacheKey, rows);
    return rows;
  }

  function get(assignmentId) {
    return SheetHelper.findByKey(SHEET, 'assignment_id', assignmentId)[0] || null;
  }

  function countAttempts_(caseId) {
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    return rows.filter(function (r) { return String(r.case_id) === String(caseId); }).length;
  }

  function withScriptLock_(fn) {
    var lock = LockService.getScriptLock();
    var locked = false;
    if (lock) {
      // 短鎖：長時間 tryLock(30s) 會讓桌面「一次準備派案」整批卡死
      locked = lock.tryLock(8000);
      if (!locked) {
        throw new Error('派案忙碌中，請稍後再試');
      }
    }
    try {
      return fn();
    } finally {
      if (locked && lock) {
        lock.releaseLock();
      }
    }
  }

  function isAllowMulti_(data) {
    return (
      data.allow_multi_active === true ||
      data.allow_multi_active === 'true' ||
      String(data.notes || '').indexOf('公所代填') !== -1
    );
  }

  function buildAssignmentRow_(data, caseRow, now) {
    var autoConfirm = data.auto_confirm !== false && data.auto_confirm !== 'false';
    return {
      assignment_id: 'ASG-' + Utilities.getUuid().slice(0, 8),
      batch_id: data.batch_id || '',
      case_id: data.case_id,
      encoded_id: caseRow.encoded_id,
      visitor_id: data.visitor_id,
      visit_village: caseRow.visit_village,
      status: autoConfirm ? '進行中' : '待接案',
      dispatched_at: now,
      confirmed_at: autoConfirm ? now : '',
      due_date:
        data.due_date ||
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      notes: data.notes || '',
      updated_at: now,
    };
  }

  function dispatch(data) {
    Validation.requireFields(data, ['case_id', 'visitor_id']);
    return withScriptLock_(function () {
      var caseRow = CaseModule.get(data.case_id);
      if (!caseRow) throw new Error('Case not found');

      var allowMulti = isAllowMulti_(data);
      // 紙本／代填允許多筆進行中：略過全表掃描，避免每案讀完整張派案表卡住
      if (!allowMulti) {
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
      }

      var now = new Date().toISOString();
      var assignment = buildAssignmentRow_(data, caseRow, now);
      var saved = SheetHelper.appendRow(SHEET, assignment);
      SpreadsheetApp.flush();

      SheetHelper.updateByKey(Config.SHEET_NAMES.CASES, 'case_id', data.case_id, {
        visit_status: '進行中',
        updated_at: now,
      });

      saved.visit_attempt = countAttempts_(data.case_id);
      ReadCache.bump();
      ReportModule.scheduleDailyVisitSnapshot(
        String(saved.due_date || '').slice(0, 10) ||
          Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd')
      );
      return saved;
    });
  }

  var REPLACEABLE_CAREFORM_STATUS_ = {
    '已提交': true,
    '待補件': true,
    '草稿': true,
  };

  /**
   * 同訪員＋同個案：若已有可修正關懷表（或進行中派案），回傳應重用的派案，避免再 KEY 出第二張表／重複核銷。
   */
  function findReusableVisitorCaseAssignment_(visitorId, caseId, allAssignments, careformByAssignment) {
    var wantedVisitor = String(visitorId || '').trim();
    var wantedCase = String(caseId || '').trim();
    if (!wantedVisitor || !wantedCase) return null;

    var candidates = [];
    allAssignments.forEach(function (row) {
      if (String(row.case_id || '').trim() !== wantedCase) return;
      if (String(row.visitor_id || '').trim() !== wantedVisitor) return;
      candidates.push(row);
    });
    if (!candidates.length) return null;

    candidates.sort(function (a, b) {
      return String(b.updated_at || b.dispatched_at || '').localeCompare(
        String(a.updated_at || a.dispatched_at || '')
      );
    });

    var withCareform = null;
    var activeOnly = null;
    candidates.forEach(function (row) {
      var asgId = String(row.assignment_id || '').trim();
      var cf = careformByAssignment[asgId];
      if (cf && REPLACEABLE_CAREFORM_STATUS_[String(cf.status || '')]) {
        if (!withCareform) withCareform = { assignment: row, careform: cf };
      } else if (!activeOnly && ACTIVE_STATUSES[String(row.status || '')]) {
        activeOnly = { assignment: row, careform: cf || null };
      }
    });
    return withCareform || activeOnly;
  }

  /**
   * 紙本一次多案：單次鎖 + appendRows + 一次 flush，避免 N 次 dispatch 把 UI 卡在「準備中」。
   * body: {
   *   visitor_id, case_ids, notes?, due_date?, auto_confirm?, allow_multi_active?, batch_id?,
   *   reuse_visitor_case?: true  // 同訪員同個案已有關懷表／進行中派案時重用，不另開
   * }
   */
  function dispatchBatch(data) {
    Validation.requireFields(data, ['visitor_id']);
    var caseIds = [];
    var seen = {};
    (data.case_ids || data.cases || []).forEach(function (item) {
      var id =
        typeof item === 'string'
          ? String(item || '').trim()
          : String((item && (item.case_id || item.caseId)) || '').trim();
      if (!id || seen[id]) return;
      seen[id] = true;
      caseIds.push(id);
    });
    if (!caseIds.length) {
      throw new Error('請至少選擇一位個案');
    }

    return withScriptLock_(function () {
      var now = new Date().toISOString();
      var allowMulti = isAllowMulti_(data);
      var reuseVisitorCase =
        data.reuse_visitor_case === true ||
        data.reuse_visitor_case === 'true' ||
        String(data.notes || '').indexOf('公所代填') !== -1;
      var rows = [];
      var missing = [];
      var reusedCount = 0;
      var reusedNames = [];

      var allAssignments = reuseVisitorCase
        ? SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET))
        : [];
      var careformByAssignment = {};
      if (reuseVisitorCase) {
        SheetHelper.rowsToObjects(
          SheetHelper.getSheet(Config.SHEET_NAMES.CAREFORMS)
        ).forEach(function (cf) {
          var asgId = String(cf.assignment_id || '').trim();
          if (!asgId) return;
          var prev = careformByAssignment[asgId];
          if (!prev) {
            careformByAssignment[asgId] = cf;
            return;
          }
          // 同派案多列時取較新
          if (
            String(cf.submitted_at || cf.updated_at || '') >
            String(prev.submitted_at || prev.updated_at || '')
          ) {
            careformByAssignment[asgId] = cf;
          }
        });
      }

      var toCreate = [];
      caseIds.forEach(function (caseId) {
        var caseRow = CaseModule.get(caseId);
        if (!caseRow) {
          missing.push(caseId);
          return;
        }
        if (reuseVisitorCase) {
          var reusable = findReusableVisitorCaseAssignment_(
            data.visitor_id,
            caseId,
            allAssignments,
            careformByAssignment
          );
          if (reusable && reusable.assignment) {
            var reused = Object.assign({}, reusable.assignment);
            reused.reused = true;
            reused.reuse_reason = reusable.careform
              ? '同訪員已有關懷表（' +
                String(reusable.careform.status || '') +
                '），改為進表修正，不另開第二張'
              : '同訪員已有進行中派案，重用既有編號';
            reused.prior_careform_id = reusable.careform
              ? String(reusable.careform.careform_id || '')
              : '';
            reused.prior_careform_status = reusable.careform
              ? String(reusable.careform.status || '')
              : '';
            reused.elder_name = caseRow.name || reused.elder_name || '';
            reused.encoded_id = caseRow.encoded_id || reused.encoded_id || '';
            rows.push(reused);
            reusedCount += 1;
            reusedNames.push(String(caseRow.name || caseRow.encoded_id || caseId));
            return;
          }
        }
        if (!allowMulti) {
          var existingActive = (reuseVisitorCase ? allAssignments : list({})).filter(
            function (r) {
              return String(r.case_id) === String(caseId) && ACTIVE_STATUSES[r.status];
            }
          );
          if (existingActive.length > 0) {
            var conflict = new Error(
              '此個案已有進行中的派案：' + existingActive[0].assignment_id + '，無法重複分配'
            );
            conflict.code = 'CONFLICT';
            throw conflict;
          }
        }
        var created = buildAssignmentRow_(
          {
            case_id: caseId,
            visitor_id: data.visitor_id,
            notes: data.notes || '',
            due_date: data.due_date || '',
            batch_id: data.batch_id || '',
            auto_confirm: data.auto_confirm,
            allow_multi_active: data.allow_multi_active,
          },
          caseRow,
          now
        );
        created.reused = false;
        created.elder_name = caseRow.name || '';
        toCreate.push(created);
        rows.push(created);
      });

      if (missing.length) {
        throw new Error('找不到個案：' + missing.slice(0, 5).join('、'));
      }
      if (!rows.length) {
        throw new Error('沒有可派案的個案');
      }

      if (toCreate.length) {
        SheetHelper.appendRows(SHEET, toCreate);
        SpreadsheetApp.flush();
      }

      // 一次讀派案表算 attempt，避免每案全表掃描
      var attemptCounts = {};
      SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET)).forEach(function (r) {
        var cid = String(r.case_id || '').trim();
        if (!cid) return;
        attemptCounts[cid] = (attemptCounts[cid] || 0) + 1;
      });

      rows.forEach(function (row) {
        if (!row.reused) {
          SheetHelper.updateByKey(Config.SHEET_NAMES.CASES, 'case_id', row.case_id, {
            visit_status: '進行中',
            updated_at: now,
          });
        }
        row.visit_attempt = attemptCounts[String(row.case_id)] || 1;
      });

      ReadCache.bump();
      var dueHint =
        String((rows[0] && rows[0].due_date) || '').slice(0, 10) ||
        Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
      ReportModule.scheduleDailyVisitSnapshot(dueHint);
      return {
        items: rows,
        count: rows.length,
        created: toCreate.length,
        reused: reusedCount,
        reused_names: reusedNames.slice(0, 12),
        warning:
          reusedCount > 0
            ? '有 ' +
              reusedCount +
              ' 案同訪員已有關懷表／派案，已改為進表修正既有筆（避免第二張表與重複核銷）：' +
              reusedNames.slice(0, 8).join('、') +
              (reusedNames.length > 8 ? '…' : '')
            : '',
      };
    });
  }

  function caseVisitStatusForAssignment_(assignmentStatus) {
    if (assignmentStatus === '已完成' || assignmentStatus === '已送出' || assignmentStatus === '已稽核') {
      return '已完成';
    }
    if (assignmentStatus === '空訪' || assignmentStatus === '空訪續訪') {
      return '空訪';
    }
    if (assignmentStatus === '待接案') {
      return '待訪';
    }
    return '進行中';
  }

  function confirm(data) {
    Validation.requireFields(data, ['assignment_id']);
    // CareFormModule.submit 會傳 status=已完成／空訪；接案確認則預設進行中。
    // 舊版忽略傳入 status、一律寫回「進行中」，導致核銷已完成的案仍出現在訪員「填報中」。
    var nextStatus = String(data.status || '進行中').trim() || '進行中';
    var patch = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };
    if (nextStatus === '進行中' || nextStatus === '待接案') {
      patch.confirmed_at = new Date().toISOString();
    }
    if (data.notes) patch.notes = data.notes;
    if (data.due_date) patch.due_date = String(data.due_date).slice(0, 10);
    var updated = SheetHelper.updateByKey(SHEET, 'assignment_id', data.assignment_id, patch);
    if (!updated) {
      var err = new Error('Assignment not found: ' + data.assignment_id);
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (updated.case_id) {
      SheetHelper.updateByKey(Config.SHEET_NAMES.CASES, 'case_id', updated.case_id, {
        visit_status: caseVisitStatusForAssignment_(nextStatus),
        updated_at: new Date().toISOString(),
      });
    }
    ReadCache.bump();
    ReportModule.scheduleDailyVisitSnapshot(
      String(updated.due_date || '').slice(0, 10) ||
        Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd')
    );
    return updated;
  }

  function visitorTasksBundle(params) {
    params = params || {};
    var visitorId = String(params.visitor_id || '').trim();
    var cacheKey = ReadCache.key('vt:' + (visitorId || 'all'));
    var cached = ReadCache.getJson(cacheKey);
    if (cached) return cached;

    var allAssignments = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    var assignments = allAssignments;
    if (visitorId) {
      assignments = assignments.filter(function (r) {
        return String(r.visitor_id || '').trim() === visitorId;
      });
    }
    if (params.status) {
      assignments = assignments.filter(function (r) {
        return r.status === params.status;
      });
    }
    if (params.active_only === true || params.active_only === 'true') {
      assignments = assignments.filter(function (r) {
        return ACTIVE_STATUSES[r.status];
      });
    }

    var attemptCounts = {};
    allAssignments.forEach(function (row) {
      var caseId = String(row.case_id || '').trim();
      if (!caseId) return;
      attemptCounts[caseId] = (attemptCounts[caseId] || 0) + 1;
    });

    var caseRows = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.CASES)
    );
    var caseById = {};
    var caseByEncoded = {};
    var caseByExternal = {};
    caseRows.forEach(function (row) {
      var id = String(row.case_id || '').trim();
      if (id) caseById[id] = row;
      var encoded = String(row.encoded_id || '').trim();
      if (encoded && !caseByEncoded[encoded]) caseByEncoded[encoded] = row;
      var external = String(row.external_id || '').trim();
      if (external && !caseByExternal[external]) caseByExternal[external] = row;
    });

    var cases = [];
    var seenCases = {};
    assignments.forEach(function (row) {
      var found =
        caseById[String(row.case_id || '').trim()] ||
        caseByEncoded[String(row.encoded_id || '').trim()] ||
        caseByExternal[String(row.external_id || '').trim()];
      if (!found) return;
      var id = String(found.case_id || '').trim();
      if (!id || seenCases[id]) return;
      seenCases[id] = true;
      cases.push(found);
    });

    var payload = {
      visitor_id: visitorId,
      assignments: assignments,
      cases: cases,
      attempt_counts: attemptCounts,
    };
    ReadCache.putJson(cacheKey, payload);
    return payload;
  }

  return {
    list: list,
    get: get,
    dispatch: dispatch,
    dispatchBatch: dispatchBatch,
    confirm: confirm,
    visitorTasksBundle: visitorTasksBundle,
  };
})();
