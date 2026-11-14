/**
 * 衛福部直 KEY 進度回報（不建立關懷表）
 * Tabs: MOHW進度回報 / MOHW進度個案標記
 */
var MohwProgressModule = (function () {
  var REPORTS = Config.SHEET_NAMES.MOHW_PROGRESS_REPORTS;
  var MARKS = Config.SHEET_NAMES.MOHW_PROGRESS_MARKS;
  var SOURCE = 'MOHW直KEY';
  var OUTCOMES = { done: '已完成', missed: '未遇', notFound: '拒訪' };
  var LEGACY_NOT_FOUND = '查無此人';

  function normalizeOutcome_(outcome) {
    var o = String(outcome || '').trim();
    if (o === LEGACY_NOT_FOUND) return OUTCOMES.notFound;
    return o;
  }

  function isValidOutcome_(outcome) {
    var o = normalizeOutcome_(outcome);
    return o === OUTCOMES.done || o === OUTCOMES.missed || o === OUTCOMES.notFound;
  }

  var REPORT_HEADERS = [
    'report_id',
    'village_name',
    'village_code',
    'mode',
    'count_done',
    'count_missed',
    'count_not_found',
    'count_total',
    'roster_total',
    'over_roster',
    'range_text',
    'case_codes_json',
    'source',
    'civil_worker_id',
    'civil_worker_name',
    'social_worker_id',
    'social_worker_name',
    'keyed_by_id',
    'keyed_by_name',
    'audit_supervisors',
    'reported_by',
    'reported_by_email',
    'reported_at',
    'notes',
    'status',
  ];

  var MARK_HEADERS = [
    'mark_id',
    'report_id',
    'case_id',
    'encoded_id',
    'village_seq',
    'village_name',
    'outcome',
    'source',
    'civil_worker_id',
    'civil_worker_name',
    'social_worker_id',
    'social_worker_name',
    'keyed_by_id',
    'keyed_by_name',
    'audit_supervisors',
    'reported_by',
    'reported_by_email',
    'reported_at',
    'status',
    'corrected_at',
    'corrected_by',
    'correction_note',
  ];

  function ensureSchema_() {
    SheetHelper.ensureSheet(REPORTS, REPORT_HEADERS);
    SheetHelper.ensureSheet(MARKS, MARK_HEADERS);
    SheetHelper.ensureColumns(REPORTS, REPORT_HEADERS);
    SheetHelper.ensureColumns(MARKS, MARK_HEADERS);
  }

  function now_() {
    return new Date().toISOString();
  }

  function error_(code, message) {
    var err = new Error(message);
    err.code = code;
    return err;
  }

  function withLock_(callback) {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      ensureSchema_();
      return callback();
    } finally {
      lock.releaseLock();
    }
  }

  function toInt_(value) {
    var n = Number(value);
    if (!isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  }

  function rosterTotal_(villageName) {
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(Config.SHEET_NAMES.CASES));
    var count = 0;
    rows.forEach(function (row) {
      if (String(row.visit_village || '') === String(villageName)) count += 1;
    });
    return count;
  }

  function supersedeCountReports_(villageName) {
    var sheet = SheetHelper.getSheet(REPORTS);
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return 0;
    var headers = data[0];
    var villageIdx = headers.indexOf('village_name');
    var modeIdx = headers.indexOf('mode');
    var statusIdx = headers.indexOf('status');
    if (villageIdx < 0 || modeIdx < 0 || statusIdx < 0) return 0;
    var patched = 0;
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][villageIdx]) !== String(villageName)) continue;
      if (String(data[r][modeIdx]) !== 'count') continue;
      if (String(data[r][statusIdx] || 'active') === 'superseded') continue;
      data[r][statusIdx] = 'superseded';
      patched += 1;
    }
    if (patched > 0) {
      sheet.getRange(1, 1, data.length, headers.length).setValues(data);
    }
    return patched;
  }

  function upsertMark_(mark) {
    var existing = SheetHelper.findByKey(MARKS, 'case_id', mark.case_id).filter(function (row) {
      return String(row.status || 'active') === 'active';
    })[0];
    if (!existing && mark.encoded_id) {
      existing = SheetHelper.findByKey(MARKS, 'encoded_id', mark.encoded_id).filter(function (row) {
        return String(row.status || 'active') === 'active';
      })[0];
    }
    if (existing) {
      return SheetHelper.updateByKey(MARKS, 'mark_id', existing.mark_id, {
        report_id: mark.report_id,
        case_id: mark.case_id || existing.case_id,
        encoded_id: mark.encoded_id || existing.encoded_id,
        village_seq: mark.village_seq != null ? mark.village_seq : existing.village_seq,
        village_name: mark.village_name || existing.village_name,
        outcome: mark.outcome,
        source: SOURCE,
        civil_worker_id: mark.civil_worker_id || '',
        civil_worker_name: mark.civil_worker_name || '',
        social_worker_id: mark.social_worker_id || '',
        social_worker_name: mark.social_worker_name || '',
        keyed_by_id: mark.keyed_by_id || '',
        keyed_by_name: mark.keyed_by_name || '',
        audit_supervisors: mark.audit_supervisors || '',
        reported_by: mark.reported_by,
        reported_by_email: mark.reported_by_email,
        reported_at: mark.reported_at,
        status: 'active',
      });
    }
    SheetHelper.appendRow(MARKS, mark);
    return mark;
  }

  function resolveCasesBySeqRange_(villageName, fromSeq, toSeq) {
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(Config.SHEET_NAMES.CASES));
    var lo = Math.min(fromSeq, toSeq);
    var hi = Math.max(fromSeq, toSeq);
    return rows.filter(function (row) {
      if (String(row.visit_village || '') !== String(villageName)) return false;
      var seq = Number(row.village_seq);
      return isFinite(seq) && seq >= lo && seq <= hi;
    });
  }

  function resolveCasesByEncodedRange_(villageName, fromNum, toNum) {
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(Config.SHEET_NAMES.CASES));
    var lo = Math.min(fromNum, toNum);
    var hi = Math.max(fromNum, toNum);
    var prefix = String(Config.ENCODE_PREFIX() || 'YH-115');
    return rows.filter(function (row) {
      if (villageName && String(row.visit_village || '') !== String(villageName)) return false;
      var encoded = String(row.encoded_id || '');
      if (encoded.indexOf(prefix + '-') !== 0) return false;
      var match = encoded.match(/A(\d+)$/i);
      if (!match) return false;
      var num = parseInt(match[1], 10);
      return isFinite(num) && num >= lo && num <= hi;
    });
  }

  function parseRangeText_(villageName, rangeText) {
    var text = String(rangeText || '').trim();
    if (!text) throw error_('VALIDATION_ERROR', '請輸入區間，例如 1-41 或 永成1-41。');

    var encodedMatch = text.match(/^(?:YH-?115-?)?A?(\d+)\s*[-~～到至]\s*(?:YH-?115-?)?A?(\d+)$/i);
    if (encodedMatch && /A\d+/i.test(text)) {
      return {
        kind: 'encoded',
        from: parseInt(encodedMatch[1], 10),
        to: parseInt(encodedMatch[2], 10),
      };
    }

    var villageSeqMatch = text.match(/^([\u4e00-\u9fff]{1,8}里)?\s*(\d+)\s*[-~～到至]\s*(\d+)$/);
    if (villageSeqMatch) {
      var named = String(villageSeqMatch[1] || '').trim();
      if (named && named !== villageName) {
        throw error_('VALIDATION_ERROR', '區間里名「' + named + '」與目前選擇的「' + villageName + '」不一致。');
      }
      return {
        kind: 'seq',
        from: parseInt(villageSeqMatch[2], 10),
        to: parseInt(villageSeqMatch[3], 10),
      };
    }

    throw error_('VALIDATION_ERROR', '無法解析區間：' + text + '（可用 1-41、永成1-41、YH-115-A100-A120）');
  }

  function submit(data) {
    return withLock_(function () {
      data = data || {};
      var villageName = String(data.village_name || '').trim();
      if (!villageName) throw error_('VALIDATION_ERROR', '請選擇里別。');

      var mode = String(data.mode || 'count').trim();
      if (
        mode !== 'count' &&
        mode !== 'case_codes' &&
        mode !== 'range' &&
        mode !== 'case_list'
      ) {
        throw error_('VALIDATION_ERROR', '不支援的輸入模式：' + mode);
      }

      var reportedAt = String(data.reported_at || now_());
      var reportedBy = String(data.reported_by || '').trim();
      var reportedByEmail = String(data.reported_by_email || '').trim();
      var villageCode = String(data.village_code || '').trim();
      var notes = String(data.notes || '').trim();
      var civilWorkerId = String(data.civil_worker_id || '').trim();
      var civilWorkerName = String(data.civil_worker_name || '').trim();
      var socialWorkerId = String(data.social_worker_id || '').trim();
      var socialWorkerName = String(data.social_worker_name || '').trim();
      var keyedById = String(data.keyed_by_id || '').trim();
      var keyedByName = String(data.keyed_by_name || '').trim();
      var auditSupervisors = Array.isArray(data.audit_supervisors)
        ? data.audit_supervisors
            .map(function (item) {
              return String(item || '').trim();
            })
            .filter(Boolean)
        : String(data.audit_supervisors || '')
            .split(/[;；,，]/)
            .map(function (item) {
              return String(item || '').trim();
            })
            .filter(Boolean);
      var auditSupervisorsText = auditSupervisors.join('；');
      var rosterTotal = rosterTotal_(villageName);
      var reportId = 'MPR-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
      var warnings = [];
      var marks = [];

      var countDone = 0;
      var countMissed = 0;
      var countNotFound = 0;
      var rangeText = '';
      var caseCodesJson = '';

      if (mode === 'count') {
        countDone = toInt_(data.count_done);
        countMissed = toInt_(data.count_missed);
        countNotFound = toInt_(data.count_not_found);
        if (countDone + countMissed + countNotFound <= 0) {
          throw error_('VALIDATION_ERROR', '請至少填一項人數。');
        }
        supersedeCountReports_(villageName);
      } else if (mode === 'case_list') {
        var items = Array.isArray(data.items) ? data.items : [];
        if (!items.length) throw error_('VALIDATION_ERROR', '請至少勾選一筆個案狀態。');
        var allCasesForList = SheetHelper.rowsToObjects(SheetHelper.getSheet(Config.SHEET_NAMES.CASES));
        var byCaseId = {};
        var byEncoded = {};
        allCasesForList.forEach(function (row) {
          if (String(row.visit_village || '') !== villageName) return;
          byCaseId[String(row.case_id || '')] = row;
          if (row.encoded_id) byEncoded[String(row.encoded_id)] = row;
        });
        items.forEach(function (item) {
          item = item || {};
          var outcome = normalizeOutcome_(item.outcome);
          if (!isValidOutcome_(outcome)) {
            warnings.push('略過無效狀態：' + String(item.case_id || item.encoded_id || ''));
            return;
          }
          var found =
            byCaseId[String(item.case_id || '')] ||
            byEncoded[String(item.encoded_id || '')];
          if (!found) {
            warnings.push('找不到個案：' + String(item.case_id || item.encoded_id || ''));
            return;
          }
          marks.push({
            mark_id: 'MPM-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10),
            report_id: reportId,
            case_id: String(found.case_id || ''),
            encoded_id: String(found.encoded_id || ''),
            village_seq: found.village_seq != null ? Number(found.village_seq) || '' : '',
            village_name: villageName,
            outcome: outcome,
            source: SOURCE,
            civil_worker_id: civilWorkerId,
            civil_worker_name: civilWorkerName,
            social_worker_id: socialWorkerId,
            social_worker_name: socialWorkerName,
            keyed_by_id: keyedById,
            keyed_by_name: keyedByName,
            audit_supervisors: auditSupervisorsText,
            reported_by: reportedBy,
            reported_by_email: reportedByEmail,
            reported_at: reportedAt,
            status: 'active',
          });
          if (outcome === OUTCOMES.done) countDone += 1;
          if (outcome === OUTCOMES.missed) countMissed += 1;
          if (outcome === OUTCOMES.notFound) countNotFound += 1;
        });
        if (!marks.length) throw error_('VALIDATION_ERROR', '沒有可寫入的個案狀態。');
        caseCodesJson = JSON.stringify(
          marks.map(function (m) {
            return { case_id: m.case_id, encoded_id: m.encoded_id, outcome: m.outcome };
          })
        );
      } else if (mode === 'case_codes') {
        var outcome = normalizeOutcome_(data.outcome);
        if (!isValidOutcome_(outcome)) {
          throw error_('VALIDATION_ERROR', '請選擇結果：已完成／未遇／拒訪。');
        }
        var codes = Array.isArray(data.case_codes)
          ? data.case_codes
          : String(data.case_codes_text || '')
              .split(/[\s,，;；]+/)
              .map(function (item) { return String(item || '').trim(); })
              .filter(Boolean);
        if (!codes.length) throw error_('VALIDATION_ERROR', '請輸入至少一個個案編碼。');
        caseCodesJson = JSON.stringify(codes);
        var allCases = SheetHelper.rowsToObjects(SheetHelper.getSheet(Config.SHEET_NAMES.CASES));
        codes.forEach(function (code) {
          var found = allCases.filter(function (row) {
            return String(row.encoded_id || '') === code || String(row.case_id || '') === code;
          })[0];
          if (!found) {
            warnings.push('找不到個案：' + code);
            return;
          }
          if (String(found.visit_village || '') !== villageName) {
            warnings.push(code + ' 不屬於「' + villageName + '」');
            return;
          }
          marks.push({
            mark_id: 'MPM-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10),
            report_id: reportId,
            case_id: String(found.case_id || ''),
            encoded_id: String(found.encoded_id || ''),
            village_seq: found.village_seq != null ? Number(found.village_seq) || '' : '',
            village_name: villageName,
            outcome: outcome,
            source: SOURCE,
            civil_worker_id: civilWorkerId,
            civil_worker_name: civilWorkerName,
            social_worker_id: socialWorkerId,
            social_worker_name: socialWorkerName,
            keyed_by_id: keyedById,
            keyed_by_name: keyedByName,
            audit_supervisors: auditSupervisorsText,
            reported_by: reportedBy,
            reported_by_email: reportedByEmail,
            reported_at: reportedAt,
            status: 'active',
          });
        });
        if (outcome === OUTCOMES.done) countDone = marks.length;
        if (outcome === OUTCOMES.missed) countMissed = marks.length;
        if (outcome === OUTCOMES.notFound) countNotFound = marks.length;
      } else {
        var rangeOutcome = normalizeOutcome_(data.outcome);
        if (!isValidOutcome_(rangeOutcome)) {
          throw error_('VALIDATION_ERROR', '請選擇結果：已完成／未遇／拒訪。');
        }
        rangeText = String(data.range_text || '').trim();
        var parsed = parseRangeText_(villageName, rangeText);
        var matched =
          parsed.kind === 'seq'
            ? resolveCasesBySeqRange_(villageName, parsed.from, parsed.to)
            : resolveCasesByEncodedRange_(villageName, parsed.from, parsed.to);
        if (!matched.length) {
          throw error_('VALIDATION_ERROR', '區間內找不到個案：' + rangeText);
        }
        matched.forEach(function (found) {
          marks.push({
            mark_id: 'MPM-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10),
            report_id: reportId,
            case_id: String(found.case_id || ''),
            encoded_id: String(found.encoded_id || ''),
            village_seq: found.village_seq != null ? Number(found.village_seq) || '' : '',
            village_name: villageName,
            outcome: rangeOutcome,
            source: SOURCE,
            civil_worker_id: civilWorkerId,
            civil_worker_name: civilWorkerName,
            social_worker_id: socialWorkerId,
            social_worker_name: socialWorkerName,
            keyed_by_id: keyedById,
            keyed_by_name: keyedByName,
            audit_supervisors: auditSupervisorsText,
            reported_by: reportedBy,
            reported_by_email: reportedByEmail,
            reported_at: reportedAt,
            status: 'active',
          });
        });
        if (rangeOutcome === OUTCOMES.done) countDone = marks.length;
        if (rangeOutcome === OUTCOMES.missed) countMissed = marks.length;
        if (rangeOutcome === OUTCOMES.notFound) countNotFound = marks.length;
      }

      var countTotal = countDone + countMissed + countNotFound;
      var overRoster = rosterTotal > 0 && countTotal > rosterTotal;
      if (overRoster) {
        warnings.push(
          '回報人數 ' + countTotal + ' 超過名冊 ' + rosterTotal + ' 人（已允許送出）'
        );
      }

      var report = {
        report_id: reportId,
        village_name: villageName,
        village_code: villageCode,
        mode: mode,
        count_done: countDone,
        count_missed: countMissed,
        count_not_found: countNotFound,
        count_total: countTotal,
        roster_total: rosterTotal,
        over_roster: overRoster ? '1' : '0',
        range_text: rangeText,
        case_codes_json: caseCodesJson,
        source: SOURCE,
        civil_worker_id: civilWorkerId,
        civil_worker_name: civilWorkerName,
        social_worker_id: socialWorkerId,
        social_worker_name: socialWorkerName,
        keyed_by_id: keyedById,
        keyed_by_name: keyedByName,
        audit_supervisors: auditSupervisorsText,
        reported_by: reportedBy,
        reported_by_email: reportedByEmail,
        reported_at: reportedAt,
        notes: notes,
        status: 'active',
      };
      SheetHelper.appendRow(REPORTS, report);

      marks.forEach(function (mark) {
        upsertMark_(mark);
      });

      return {
        report: report,
        marks_written: marks.length,
        warnings: warnings,
        over_roster: overRoster,
        roster_total: rosterTotal,
      };
    });
  }

  function list(params) {
    params = params || {};
    ensureSchema_();
    var village = String(params.village_name || '').trim();
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(REPORTS));
    if (village) {
      rows = rows.filter(function (row) {
        return String(row.village_name || '') === village;
      });
    }
    if (params.active_only === true || params.active_only === 'true') {
      rows = rows.filter(function (row) {
        return String(row.status || 'active') === 'active';
      });
    }
    rows.sort(function (a, b) {
      return String(b.reported_at || '').localeCompare(String(a.reported_at || ''));
    });
    return rows;
  }

  function listMarks(params) {
    params = params || {};
    ensureSchema_();
    var village = String(params.village_name || '').trim();
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(MARKS)).filter(function (row) {
      if (String(row.status || 'active') !== 'active') return false;
      if (village && String(row.village_name || '') !== village) return false;
      return true;
    });
    rows.sort(function (a, b) {
      var sa = Number(a.village_seq);
      var sb = Number(b.village_seq);
      if (isFinite(sa) && isFinite(sb) && sa !== sb) return sa - sb;
      return String(a.encoded_id || '').localeCompare(String(b.encoded_id || ''));
    });
    return rows;
  }

  function noteLabel_(segment) {
    var text = String(segment || '').trim();
    if (!text) return { id: '', name: '' };
    var parts = text.split(':');
    if (parts.length >= 2) {
      return {
        id: String(parts[0] || '').trim(),
        name: String(parts.slice(1).join(':') || '').trim(),
      };
    }
    return { id: text, name: '' };
  }

  function visitorSide_(visitor) {
    var group = String((visitor && (visitor.volunteer_group || visitor.worker_group)) || '')
      .trim()
      .toLowerCase();
    if (group.indexOf('social') !== -1 || group.indexOf('社政') !== -1) return 'social';
    if (group.indexOf('civil') !== -1 || group.indexOf('民政') !== -1) return 'civil';
    var id = String((visitor && visitor.visitor_id) || '').toUpperCase();
    if (id.indexOf('-SOC-') !== -1) return 'social';
    if (id.indexOf('-CIV-') !== -1) return 'civil';
    return 'civil';
  }

  function applyAssignmentFallback_(index, caseId, civil, social) {
    var nextCivil = civil;
    var nextSocial = social;
    var assignments = index.assignmentsByCase[String(caseId || '').trim()] || [];
    if (!assignments.length) {
      return { civil: nextCivil, social: nextSocial };
    }
    var assignment = assignments[assignments.length - 1];
    var notes = String(assignment.notes || '');
    var primaryMatch = notes.match(/主填:([^｜|]+)/);
    var companionMatch = notes.match(/同行:([^｜|]+)/);
    var sideMatch = notes.match(/主填側:(民政|社政)/);
    var primary = noteLabel_(primaryMatch && primaryMatch[1]);
    var companions = companionMatch
      ? companionMatch[1].split(',').map(function (part) {
          return noteLabel_(part);
        })
      : [];
    var primarySide =
      sideMatch && sideMatch[1] === '社政'
        ? 'social'
        : sideMatch && sideMatch[1] === '民政'
          ? 'civil'
          : null;

    function putName(side, name) {
      var label = String(name || '').trim();
      if (!label) return;
      if (side === 'social' && !nextSocial) nextSocial = label;
      if (side === 'civil' && !nextCivil) nextCivil = label;
    }

    if (primary.id || primary.name) {
      var primaryVisitor = (index.visitorById && index.visitorById[primary.id]) || {};
      var primaryName = primary.name || String(primaryVisitor.name || '').trim() || primary.id;
      var side =
        primarySide ||
        visitorSide_({
          visitor_id: primary.id || primaryVisitor.visitor_id,
          volunteer_group: primaryVisitor.volunteer_group,
        });
      putName(side, primaryName);
    }

    companions.forEach(function (item) {
      if (!item.id && !item.name) return;
      var companion = (index.visitorById && index.visitorById[item.id]) || {};
      var companionName = item.name || String(companion.name || '').trim() || item.id;
      var companionSide = visitorSide_({
        visitor_id: item.id || companion.visitor_id,
        volunteer_group: companion.volunteer_group,
      });
      putName(companionSide, companionName);
    });

    if ((!nextCivil || !nextSocial) && assignment.visitor_id) {
      var visitorId = String(assignment.visitor_id || '').trim();
      var visitor = (index.visitorById && index.visitorById[visitorId]) || {};
      var visitorName = String(visitor.name || '').trim();
      if (visitorName) {
        putName(
          visitorSide_({
            visitor_id: visitorId,
            volunteer_group: visitor.volunteer_group,
          }),
          visitorName
        );
      }
    }

    return { civil: nextCivil, social: nextSocial };
  }

  function latestKeyedBy_(logsByCase, caseId) {
    var rows = logsByCase[String(caseId || '').trim()] || [];
    if (!rows.length) return '';
    var best = rows[0];
    for (var i = 1; i < rows.length; i++) {
      var at = String(rows[i].keyed_at || rows[i].created_at || '');
      var bestAt = String(best.keyed_at || best.created_at || '');
      if (at > bestAt) best = rows[i];
    }
    return String(best.display_name || best.clerk_id || '').trim();
  }

  function auditSupervisorsForCareform_(index, careform) {
    if (!careform) return [];
    var audit = VisitRecordIndex.latestAudit(index, careform.careform_id);
    var reviewer = String((audit && audit.reviewer) || '').trim();
    return reviewer ? [reviewer] : [];
  }

  function buildCaseMeta_(index, logsByCase, caseId, careform) {
    var fallback = applyAssignmentFallback_(index, caseId, '', '');
    return {
      case_id: caseId,
      civil_worker_name: fallback.civil,
      social_worker_name: fallback.social,
      keyed_by_name: latestKeyedBy_(logsByCase, caseId),
      audit_supervisors: auditSupervisorsForCareform_(index, careform),
      careform_status: careform ? String(careform.status || '').trim() : '',
      careform_id: careform ? String(careform.careform_id || '').trim() : '',
    };
  }

  /**
   * 里別名冊分兩組（合計＝全里）：
   * - items_keyed：本平台已有 eligible 關懷表（已提交／已稽核）→ 儀表板算「本系統已KEY／已完成進度」
   * - items_direct：其餘 → 需直 KEY 衛福部狀態（已完成／未遇／拒訪；舊資料「查無此人」視為拒訪）
   * 草稿／作廢／待補件不算已建檔，仍進 items_direct。
   * 相容：items ＝ items_direct；excluded_with_careform ＝ keyed_count。
   */
  function listCaseContext(params) {
    params = params || {};
    var village = String(params.village_name || '').trim();
    if (!village) throw error_('VALIDATION_ERROR', 'village_name 必填');

    var index = VisitRecordIndex.build();
    var logs = SheetHelper.rowsToObjects(SheetHelper.getSheet(Config.SHEET_NAMES.DESK_KEY_LOGS));
    var logsByCase = {};
    logs.forEach(function (row) {
      var caseId = String(row.case_id || '').trim();
      if (!caseId) return;
      if (!logsByCase[caseId]) logsByCase[caseId] = [];
      logsByCase[caseId].push(row);
    });

    var itemsKeyed = [];
    var itemsDirect = [];
    var rosterTotal = 0;
    index.cases.forEach(function (caseRow) {
      if (String(caseRow.visit_village || '').trim() !== village) return;
      var caseId = String(caseRow.case_id || '').trim();
      if (!caseId) return;
      rosterTotal += 1;

      var careform = VisitRecordIndex.latestEligibleCareformForCase(index, caseId);
      var meta = buildCaseMeta_(index, logsByCase, caseId, careform);
      if (careform) {
        itemsKeyed.push(meta);
      } else {
        itemsDirect.push(meta);
      }
    });

    return {
      village_name: village,
      roster_total: rosterTotal,
      keyed_count: itemsKeyed.length,
      direct_count: itemsDirect.length,
      excluded_with_careform: itemsKeyed.length,
      items_keyed: itemsKeyed,
      items_direct: itemsDirect,
      items: itemsDirect,
    };
  }

  /**
   * 儀表板用里別進度：
   * - platform_keyed＝本系統 eligible 關懷表（算已完成進度）
   * - direct_*＝直 KEY 衛福部標記（僅非 platform_keyed 個案）
   * - reported＝platform_keyed ∪ 有直 KEY 狀態的個案（去重）
   * - remaining／completion_rate 供儀表板
   */
  function summary(params) {
    params = params || {};
    ensureSchema_();
    var villageFilter = String(params.village_name || '').trim();
    var reports = list({ village_name: villageFilter, active_only: 'true' });
    var marks = SheetHelper.rowsToObjects(SheetHelper.getSheet(MARKS)).filter(function (row) {
      if (String(row.status || 'active') !== 'active') return false;
      if (villageFilter && String(row.village_name || '') !== villageFilter) return false;
      return true;
    });

    var index = VisitRecordIndex.build();
    var byVillage = {};
    function ensureVillage(name) {
      if (!byVillage[name]) {
        byVillage[name] = {
          village_name: name,
          roster_total: 0,
          platform_keyed: 0,
          keyed_case_ids: {},
          case_ids: {},
          count_done: 0,
          count_missed: 0,
          count_not_found: 0,
          marked_done: 0,
          marked_missed: 0,
          marked_not_found: 0,
          marked_case_ids: {},
          latest_report_at: '',
        };
      }
      return byVillage[name];
    }

    index.cases.forEach(function (caseRow) {
      var name = String(caseRow.visit_village || '').trim();
      if (!name) return;
      if (villageFilter && name !== villageFilter) return;
      var caseId = String(caseRow.case_id || '').trim();
      if (!caseId) return;
      var bucket = ensureVillage(name);
      bucket.roster_total += 1;
      bucket.case_ids[caseId] = true;
      if (VisitRecordIndex.latestEligibleCareformForCase(index, caseId)) {
        bucket.platform_keyed += 1;
        bucket.keyed_case_ids[caseId] = true;
      }
    });

    // Ensure villages that only have reports/marks still appear
    reports.forEach(function (row) {
      var name = String(row.village_name || '');
      if (!name) return;
      if (villageFilter && name !== villageFilter) return;
      ensureVillage(name);
    });
    marks.forEach(function (row) {
      var name = String(row.village_name || '');
      if (!name) return;
      if (villageFilter && name !== villageFilter) return;
      ensureVillage(name);
    });

    reports.forEach(function (row) {
      var name = String(row.village_name || '');
      if (!name) return;
      var bucket = ensureVillage(name);
      if (String(row.mode) === 'count') {
        bucket.count_done = toInt_(row.count_done);
        bucket.count_missed = toInt_(row.count_missed);
        bucket.count_not_found = toInt_(row.count_not_found);
      }
      if (String(row.reported_at || '') > bucket.latest_report_at) {
        bucket.latest_report_at = String(row.reported_at || '');
      }
    });

    marks.forEach(function (row) {
      var name = String(row.village_name || '');
      if (!name) return;
      var bucket = ensureVillage(name);
      var caseId = String(row.case_id || '').trim();
      // 已 KEY 關懷表個案不計入直 KEY 分項，避免與 platform_keyed 重複
      if (caseId && bucket.keyed_case_ids[caseId]) return;
      var outcome = normalizeOutcome_(row.outcome);
      if (!isValidOutcome_(outcome)) {
        return;
      }
      if (caseId) bucket.marked_case_ids[caseId] = outcome;
      if (outcome === OUTCOMES.done) bucket.marked_done += 1;
      if (outcome === OUTCOMES.missed) bucket.marked_missed += 1;
      if (outcome === OUTCOMES.notFound) bucket.marked_not_found += 1;
      if (String(row.reported_at || '') > bucket.latest_report_at) {
        bucket.latest_report_at = String(row.reported_at || '');
      }
    });

    var villages = Object.keys(byVillage)
      .sort(function (a, b) {
        return a.localeCompare(b, 'zh-Hant');
      })
      .map(function (key) {
        var item = byVillage[key];
        var hasMarks =
          item.marked_done + item.marked_missed + item.marked_not_found > 0;
        // Prefer case marks；無標記時退回人數 snapshot（舊 count 模式）
        var directDone = hasMarks ? item.marked_done : item.count_done;
        var directMissed = hasMarks ? item.marked_missed : item.count_missed;
        var directNotFound = hasMarks ? item.marked_not_found : item.count_not_found;
        var directMarked = directDone + directMissed + directNotFound;
        var directPool = Math.max(item.roster_total - item.platform_keyed, 0);
        var directUnset = Math.max(directPool - directMarked, 0);

        // 去重：本系統已 KEY ∪ 直 KEY 有狀態
        var progressedIds = {};
        Object.keys(item.keyed_case_ids).forEach(function (id) {
          progressedIds[id] = true;
        });
        Object.keys(item.marked_case_ids).forEach(function (id) {
          progressedIds[id] = true;
        });
        var reported = Object.keys(progressedIds).length;
        // count 模式無 case_id 時，用人數加總（與 platform_keyed 相加，可能略高估）
        if (!hasMarks && directMarked > 0) {
          reported = Math.min(item.roster_total, item.platform_keyed + directMarked);
        }
        var remaining = Math.max(item.roster_total - reported, 0);
        var completionRate =
          item.roster_total > 0
            ? Math.round((reported / item.roster_total) * 1000) / 10
            : 0;

        return {
          village_name: item.village_name,
          roster_total: item.roster_total,
          platform_keyed: item.platform_keyed,
          direct_done: directDone,
          direct_missed: directMissed,
          direct_not_found: directNotFound,
          direct_unset: directUnset,
          // 相容舊欄位：done／missed／not_found＝直 KEY；reported＝整體已完成進度
          done: directDone,
          missed: directMissed,
          not_found: directNotFound,
          reported: reported,
          remaining: remaining,
          completion_rate: completionRate,
          latest_report_at: item.latest_report_at,
        };
      });

    var totals = villages.reduce(
      function (acc, row) {
        acc.roster_total += row.roster_total;
        acc.platform_keyed += row.platform_keyed;
        acc.direct_done += row.direct_done;
        acc.direct_missed += row.direct_missed;
        acc.direct_not_found += row.direct_not_found;
        acc.direct_unset += row.direct_unset;
        acc.done += row.done;
        acc.missed += row.missed;
        acc.not_found += row.not_found;
        acc.reported += row.reported;
        acc.remaining += row.remaining;
        return acc;
      },
      {
        roster_total: 0,
        platform_keyed: 0,
        direct_done: 0,
        direct_missed: 0,
        direct_not_found: 0,
        direct_unset: 0,
        done: 0,
        missed: 0,
        not_found: 0,
        reported: 0,
        remaining: 0,
        completion_rate: 0,
      }
    );
    totals.completion_rate =
      totals.roster_total > 0
        ? Math.round((totals.reported / totals.roster_total) * 1000) / 10
        : 0;

    return {
      villages: villages,
      totals: totals,
    };
  }

  /**
   * 管理者改正已送出標記（不改 reported_by／reported_at）。
   * data.patches: [{ mark_id, outcome?, civil_worker_id?, civil_worker_name?,
   *   social_worker_id?, social_worker_name?, keyed_by_id?, keyed_by_name? }]
   * 欄位若未傳入則保留原值；字串可傳空字串以清空。
   */
  function patchMarks(data) {
    data = data || {};
    var patches = data.patches || [];
    if (!patches.length) throw error_('VALIDATION_ERROR', 'patches 不可為空');
    var correctedBy = String(data.corrected_by || '').trim();
    var note = String(data.note || data.correction_note || '').trim();
    var stamp = now_();

    return withLock_(function () {
      var updated = [];
      var missing = [];
      var reportTouch = {};

      for (var i = 0; i < patches.length; i++) {
        var p = patches[i] || {};
        var markId = String(p.mark_id || '').trim();
        if (!markId) {
          missing.push({ mark_id: '', reason: '缺少 mark_id' });
          continue;
        }
        var existing = SheetHelper.findByKey(MARKS, 'mark_id', markId)[0];
        if (!existing || String(existing.status || 'active') !== 'active') {
          missing.push({ mark_id: markId, reason: '找不到作用中標記' });
          continue;
        }

        var patch = {
          corrected_at: stamp,
          corrected_by: correctedBy || existing.corrected_by || '',
          correction_note: note || existing.correction_note || '',
        };

        if (Object.prototype.hasOwnProperty.call(p, 'outcome')) {
          var outcome = normalizeOutcome_(p.outcome);
          if (!isValidOutcome_(outcome)) {
            missing.push({ mark_id: markId, reason: '狀態無效' });
            continue;
          }
          patch.outcome = outcome;
        }
        if (Object.prototype.hasOwnProperty.call(p, 'civil_worker_id')) {
          patch.civil_worker_id = String(p.civil_worker_id || '').trim();
        }
        if (Object.prototype.hasOwnProperty.call(p, 'civil_worker_name')) {
          patch.civil_worker_name = String(p.civil_worker_name || '').trim();
        }
        if (Object.prototype.hasOwnProperty.call(p, 'social_worker_id')) {
          patch.social_worker_id = String(p.social_worker_id || '').trim();
        }
        if (Object.prototype.hasOwnProperty.call(p, 'social_worker_name')) {
          patch.social_worker_name = String(p.social_worker_name || '').trim();
        }
        if (Object.prototype.hasOwnProperty.call(p, 'keyed_by_id')) {
          patch.keyed_by_id = String(p.keyed_by_id || '').trim();
        }
        if (Object.prototype.hasOwnProperty.call(p, 'keyed_by_name')) {
          patch.keyed_by_name = String(p.keyed_by_name || '').trim();
        }

        var row = SheetHelper.updateByKey(MARKS, 'mark_id', markId, patch);
        if (!row) {
          missing.push({ mark_id: markId, reason: '更新失敗' });
          continue;
        }
        updated.push(row);
        var rid = String(row.report_id || existing.report_id || '').trim();
        if (rid) {
          if (!reportTouch[rid]) reportTouch[rid] = [];
          reportTouch[rid].push(String(row.mark_id || markId));
        }
      }

      // 同一 report：若該 report 下全部 active marks 皆在本次更新集合，同步 report staff／notes
      var reportIds = Object.keys(reportTouch);
      for (var r = 0; r < reportIds.length; r++) {
        var reportId = reportIds[r];
        var report = SheetHelper.findByKey(REPORTS, 'report_id', reportId)[0];
        if (!report) continue;
        var siblingMarks = SheetHelper.rowsToObjects(SheetHelper.getSheet(MARKS)).filter(
          function (row) {
            return (
              String(row.report_id || '') === reportId &&
              String(row.status || 'active') === 'active'
            );
          }
        );
        var touched = {};
        reportTouch[reportId].forEach(function (id) {
          touched[id] = true;
        });
        var allTouched =
          siblingMarks.length > 0 &&
          siblingMarks.every(function (row) {
            return touched[String(row.mark_id || '')];
          });
        var noteLine =
          Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm') +
          ' 管理者修正 ' +
          reportTouch[reportId].length +
          ' 筆標記' +
          (correctedBy ? '（' + correctedBy + '）' : '') +
          (note ? '：' + note : '');
        var reportPatch = {
          notes: String(report.notes || '')
            ? String(report.notes || '') + '｜' + noteLine
            : noteLine,
        };
        if (allTouched && siblingMarks.length) {
          var first = siblingMarks[0];
          // 整批同 report 全改：用第一筆的 staff 寫回 report（同梯次通常一致）
          reportPatch.keyed_by_id = String(first.keyed_by_id || '');
          reportPatch.keyed_by_name = String(first.keyed_by_name || '');
          reportPatch.civil_worker_id = String(first.civil_worker_id || '');
          reportPatch.civil_worker_name = String(first.civil_worker_name || '');
          reportPatch.social_worker_id = String(first.social_worker_id || '');
          reportPatch.social_worker_name = String(first.social_worker_name || '');
          var done = 0;
          var missed = 0;
          var notFound = 0;
          siblingMarks.forEach(function (m) {
            var o = normalizeOutcome_(m.outcome);
            if (o === OUTCOMES.done) done += 1;
            else if (o === OUTCOMES.missed) missed += 1;
            else if (o === OUTCOMES.notFound) notFound += 1;
          });
          reportPatch.count_done = done;
          reportPatch.count_missed = missed;
          reportPatch.count_not_found = notFound;
          reportPatch.count_total = done + missed + notFound;
        }
        SheetHelper.updateByKey(REPORTS, 'report_id', reportId, reportPatch);
      }

      return {
        updated_count: updated.length,
        missing_count: missing.length,
        updated: updated,
        missing: missing,
        corrected_at: stamp,
      };
    });
  }

  return {
    submit: submit,
    list: list,
    listMarks: listMarks,
    patchMarks: patchMarks,
    listCaseContext: listCaseContext,
    summary: summary,
    ensureSchema: ensureSchema_,
  };
})();
