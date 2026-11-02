var AuditModule = (function () {
  var SHEET = Config.SHEET_NAMES.AUDIT;
  var CAREFORM_SHEET = Config.SHEET_NAMES.CAREFORMS;

  function truthy_(value) {
    return value === true || value === 'true' || value === '是' || value === 'TRUE';
  }

  function ensureCareformValidationColumns_() {
    SheetHelper.ensureColumns(CAREFORM_SHEET, [
      'validation_ok',
      'validation_error_lines',
      'validated_at',
    ]);
  }

  function parseErrorLines_(raw) {
    if (Object.prototype.toString.call(raw) === '[object Array]') {
      return raw.map(function (line) { return String(line); }).filter(Boolean);
    }
    var text = String(raw || '').trim();
    if (!text) return [];
    try {
      var parsed = JSON.parse(text);
      if (Object.prototype.toString.call(parsed) === '[object Array]') {
        return parsed.map(function (line) { return String(line); }).filter(Boolean);
      }
    } catch (e) {
      // fall through
    }
    return text.split(/\n|；|;/).map(function (line) {
      return String(line || '').trim();
    }).filter(Boolean);
  }

  function deskPaper_(assignment, careform) {
    var noteBlob = String((assignment && assignment.notes) || '') + '|' + String((careform && careform.notes) || '');
    return (
      noteBlob.indexOf('公所代填') !== -1 ||
      noteBlob.indexOf('紙本') !== -1 ||
      noteBlob.indexOf('desk') !== -1
    );
  }

  function runValidation_(index, careform, assignment, caseRow) {
    if (typeof MohwLifeCareValidator === 'undefined') {
      return { ok: true, errorLines: [], errors: [] };
    }
    var answers = MohwLifeCareMapper.mergeInputs({ careform: careform, caseRow: caseRow });
    return MohwLifeCareValidator.validateRow(answers, 2, {
      registryNationalId: caseRow.id_number || caseRow.national_id || '',
      allowMissingWorkerNationalId: deskPaper_(assignment, careform),
    });
  }

  /**
   * Persist validation snapshot on careform so queue can stay lite.
   * Called from CareFormModule.submit and optional refresh.
   */
  function persistValidationSnapshot(careformId, validation) {
    ensureCareformValidationColumns_();
    var ok = !(validation && validation.ok === false);
    var lines = (validation && validation.errorLines) || [];
    if (!lines.length && validation && validation.errors) {
      lines = validation.errors.map(function (err) {
        return err.display || err.message || '';
      }).filter(Boolean);
    }
    return SheetHelper.updateByKey(CAREFORM_SHEET, 'careform_id', careformId, {
      validation_ok: ok ? 'true' : 'false',
      validation_error_lines: JSON.stringify((lines || []).slice(0, 12)),
      validated_at: new Date().toISOString(),
    });
  }

  function resolveCaseRow_(index, careform, assignment) {
    var caseRow = index.caseById[String((assignment && assignment.case_id) || '').trim()] || {};
    if (!caseRow.case_id && careform.encoded_id) {
      var encodedMatches = index.cases.filter(function (row) {
        return String(row.encoded_id) === String(careform.encoded_id);
      });
      if (encodedMatches.length === 1) caseRow = encodedMatches[0];
    }
    return caseRow;
  }

  /**
   * @param {{ validate?: boolean }} options
   *   validate=false (default for queue): use careform snapshot; missing snapshot → treat as ok until decide.
   *   validate=true: full MohwLifeCareValidator (decide / refresh).
   */
  function enrichFromIndex_(index, audit, options) {
    options = options || {};
    var forceValidate = options.validate === true;
    var careform = index.careformById[String(audit.careform_id || '').trim()] || {};
    var assignment = index.assignmentById[String(careform.assignment_id || '').trim()] || {};
    var caseRow = resolveCaseRow_(index, careform, assignment);

    var validation = { ok: true, errorLines: [], errors: [] };
    var hasSnapshot =
      careform.validation_ok !== undefined &&
      careform.validation_ok !== null &&
      String(careform.validation_ok).trim() !== '';

    if (forceValidate) {
      validation = runValidation_(index, careform, assignment, caseRow);
    } else if (hasSnapshot) {
      var snapOk = truthy_(careform.validation_ok) || careform.validation_ok === true;
      validation = {
        ok: snapOk,
        errorLines: parseErrorLines_(careform.validation_error_lines).slice(0, 8),
        errors: [],
      };
    } else {
      // Lite queue: skip 102-col revalidate for speed. decideBatch still full-validates.
      validation = { ok: true, errorLines: [], errors: [] };
    }

    var visitorId = String(
      careform.visitor_id || assignment.visitor_id || ''
    ).trim();
    var visitor = (index.visitorById && index.visitorById[visitorId]) || {};

    return {
      audit_id: audit.audit_id,
      careform_id: audit.careform_id,
      reviewer: audit.reviewer || '',
      decision: audit.decision || '',
      reason: audit.reason || '',
      decided_at: audit.decided_at || '',
      assignment_id: careform.assignment_id || assignment.assignment_id || '',
      encoded_id: careform.encoded_id || caseRow.encoded_id || '',
      case_id: caseRow.case_id || '',
      external_id: caseRow.external_id || '',
      name: caseRow.name || '',
      visit_village: caseRow.visit_village || '',
      visit_district: caseRow.visit_district || '',
      visit_result: careform.visit_result || '',
      consent_signed: truthy_(careform.consent_signed),
      completion_pct: careform.completion_pct || 0,
      careform_status: careform.status || '',
      submitted_at: careform.submitted_at || '',
      visitor_id: visitorId,
      visitor_name: visitor.name || '',
      validation_ok: validation.ok,
      error_count: (validation.errorLines && validation.errorLines.length) || 0,
      error_lines: (validation.errorLines || []).slice(0, 8),
    };
  }

  function queue(params) {
    params = params || {};
    var decisionKey = params.decision ? String(params.decision) : 'pending';
    var forceValidate = params.validate === '1' || params.validate === true || params.fresh === '1';
    var cacheKey = ReadCache.key('auditQ:' + decisionKey + (forceValidate ? ':full' : ':lite'));
    var cached = ReadCache.getJson(cacheKey);
    if (cached) return cached;

    ensureCareformValidationColumns_();
    var index = VisitRecordIndex.build();
    var rows = index.audits;
    if (params.decision === 'all') {
      // keep all
    } else if (params.decision && params.decision !== 'pending') {
      rows = rows.filter(function (r) {
        return String(r.decision) === String(params.decision);
      });
    } else {
      rows = rows.filter(function (r) {
        return !r.decision;
      });
    }
    var result = rows.map(function (audit) {
      return enrichFromIndex_(index, audit, { validate: forceValidate });
    });

    // 同 encoded_id 多筆待審＝可能重複 KEY；標示提醒（不自動擋核准，由督導處理）
    if (!params.decision || params.decision === 'pending') {
      var pendingByEncoded = {};
      result.forEach(function (item) {
        var enc = String(item.encoded_id || '').trim();
        if (!enc) return;
        pendingByEncoded[enc] = (pendingByEncoded[enc] || 0) + 1;
      });
      result.forEach(function (item) {
        var enc = String(item.encoded_id || '').trim();
        var dupCount = enc ? pendingByEncoded[enc] || 0 : 0;
        item.duplicate_case_pending = dupCount > 1;
        item.duplicate_case_count = dupCount;
        if (dupCount > 1) {
          item.duplicate_case_warning =
            '同個案有 ' + dupCount + ' 筆待稽核關懷表，請只留正確一筆再核准，避免重複核銷';
        }
      });
    }

    // 佇列可能超過 CacheService 90KB；寫入失敗就略過，仍回傳結果
    ReadCache.putJson(cacheKey, result);
    return result;
  }

  function enqueue(careformId) {
    var existing = SheetHelper.findByKey(SHEET, 'careform_id', careformId).filter(function (r) {
      return !r.decision;
    });
    if (existing.length) return existing[0];

    var created = SheetHelper.appendRow(SHEET, {
      audit_id: 'AUD-' + Utilities.getUuid().slice(0, 8),
      careform_id: careformId,
      reviewer: '',
      decision: '',
      reason: '',
    });
    ReadCache.bump();
    return created;
  }

  function normalizeDecision_(value) {
    if (value === 'approve' || value === 'approved') return '通過';
    if (value === 'request_changes') return '退回補件';
    if (value === 'reject' || value === 'rejected') return '駁回';
    return value;
  }

  function applyDecisionSideEffects_(preview, decision, options) {
    options = options || {};
    if (preview.careform_id) {
      var careformPatch = {};
      if (decision === '通過') {
        careformPatch.status = '已稽核';
        careformPatch.audited_at = new Date().toISOString();
      } else if (decision === '退回補件') {
        careformPatch.status = '待補件';
      } else if (decision === '駁回') {
        careformPatch.status = '已駁回';
      }
      if (careformPatch.status) {
        SheetHelper.updateByKey(
          CAREFORM_SHEET,
          'careform_id',
          preview.careform_id,
          careformPatch
        );
      }
    }

    if (decision === '通過' && preview.assignment_id && !options.skipAssignmentClose) {
      try {
        AssignmentModule.confirm({
          assignment_id: preview.assignment_id,
          status: '已完成',
        });
      } catch (e) {
        // 派案更新失敗不阻斷稽核決定
      }
    }
  }

  function decideOne_(index, data, options) {
    options = options || {};
    var decision = normalizeDecision_(data.decision);
    var auditId = String(data.audit_id || '').trim();
    var current = index.audits.filter(function (row) {
      return String(row.audit_id || '').trim() === auditId;
    })[0];
    if (!current) {
      current = SheetHelper.findByKey(SHEET, 'audit_id', auditId)[0];
    }
    if (!current) {
      return {
        ok: false,
        audit_id: auditId,
        code: 'NOT_FOUND',
        message: 'Audit record not found: ' + auditId,
      };
    }

    var preview = enrichFromIndex_(index, current, { validate: true });
    if (decision === '通過' && preview.validation_ok === false) {
      return {
        ok: false,
        audit_id: auditId,
        code: 'MOHW_VALIDATION_ERROR',
        message: '中央系統欄位驗證未通過，不可核准',
        error_lines: preview.error_lines || [],
        item: preview,
      };
    }
    // 同意書暫不阻擋核准（政策：先不處理同意書）

    var updated = SheetHelper.updateByKey(SHEET, 'audit_id', auditId, {
      decision: decision,
      reason: data.reason || '',
      reviewer: data.reviewer || Session.getActiveUser().getEmail(),
      decided_at: new Date().toISOString(),
    });
    if (!updated) {
      return {
        ok: false,
        audit_id: auditId,
        code: 'NOT_FOUND',
        message: 'Audit record not found: ' + auditId,
      };
    }

    applyDecisionSideEffects_(preview, decision, options);
    // Keep index maps roughly in sync for subsequent batch items
    if (updated.careform_id && index.careformById[updated.careform_id]) {
      var cf = index.careformById[updated.careform_id];
      if (decision === '通過') {
        cf.status = '已稽核';
        cf.audited_at = new Date().toISOString();
      } else if (decision === '退回補件') {
        cf.status = '待補件';
      } else if (decision === '駁回') {
        cf.status = '已駁回';
      }
    }

    // 核准時寫入驗證快照，匯出候選清單可走 lite、不必再對每筆 validateRow
    if (decision === '通過' && preview.careform_id) {
      try {
        persistValidationSnapshot(preview.careform_id, {
          ok: true,
          errorLines: [],
          errors: [],
        });
        if (index.careformById[preview.careform_id]) {
          index.careformById[preview.careform_id].validation_ok = 'true';
          index.careformById[preview.careform_id].validation_error_lines = '[]';
        }
      } catch (eSnap) {}
    }

    var item = enrichFromIndex_(index, updated, { validate: false });
    item.decision = decision;
    return {
      ok: true,
      audit_id: auditId,
      item: item,
      assignment_id: preview.assignment_id || '',
    };
  }

  function decide(data) {
    Validation.requireFields(data, ['audit_id', 'decision']);
    var batch = decideBatch({
      audit_ids: [data.audit_id],
      decision: data.decision,
      reason: data.reason || '',
      reviewer: data.reviewer || '',
    });
    var first = (batch.results && batch.results[0]) || {};
    if (!first.ok) {
      var err = new Error(first.message || '稽核決策失敗');
      err.code = first.code || 'AUDIT_DECIDE_FAILED';
      err.errorLines = first.error_lines || [];
      throw err;
    }
    return first.item;
  }

  /**
   * One VisitRecordIndex.build for many decisions; bump cache once; snapshot once per date.
   * Body: { audit_ids: string[], decision, reason?, reviewer? }
   */
  function decideBatch(data) {
    data = data || {};
    var ids = data.audit_ids || data.auditIds || [];
    if (Object.prototype.toString.call(ids) !== '[object Array]') ids = [];
    ids = ids.map(function (id) { return String(id || '').trim(); }).filter(Boolean);
    if (!ids.length) {
      var empty = new Error('audit_ids required');
      empty.code = 'VALIDATION_ERROR';
      throw empty;
    }
    Validation.requireFields({ decision: data.decision }, ['decision']);

    ensureCareformValidationColumns_();
    var index = VisitRecordIndex.build();
    var results = [];
    var snapshotDates = {};
    var reviewer = data.reviewer || Session.getActiveUser().getEmail();
    var reason = data.reason || '';

    for (var i = 0; i < ids.length; i++) {
      var one = decideOne_(index, {
        audit_id: ids[i],
        decision: data.decision,
        reason: reason,
        reviewer: reviewer,
      }, {});
      results.push(one);
      if (one.ok && one.assignment_id) {
        var assignment = index.assignmentById[String(one.assignment_id).trim()];
        var due = assignment
          ? String(assignment.due_date || '').slice(0, 10)
          : '';
        if (!due) {
          due = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
        }
        snapshotDates[due] = true;
      }
    }

    ReadCache.bump();
    Object.keys(snapshotDates).forEach(function (date) {
      try {
        ReportModule.scheduleDailyVisitSnapshot(date);
      } catch (e) {
        // snapshot schedule failure must not fail batch
      }
    });

    var successCount = 0;
    var failCount = 0;
    results.forEach(function (row) {
      if (row.ok) successCount += 1;
      else failCount += 1;
    });

    return {
      success_count: successCount,
      fail_count: failCount,
      results: results,
    };
  }

  function findByCareform(careformId) {
    return SheetHelper.findByKey(SHEET, 'careform_id', careformId);
  }

  return {
    queue: queue,
    enqueue: enqueue,
    decide: decide,
    decideBatch: decideBatch,
    persistValidationSnapshot: persistValidationSnapshot,
    findByCareform: findByCareform,
  };
})();
