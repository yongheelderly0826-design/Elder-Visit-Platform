var AuditModule = (function () {
  var SHEET = Config.SHEET_NAMES.AUDIT;

  function parseAnswers_(careform) {
    if (!careform || !careform.answers_json) return {};
    try {
      return typeof careform.answers_json === 'string'
        ? JSON.parse(careform.answers_json)
        : careform.answers_json;
    } catch (e) {
      return {};
    }
  }

  function truthy_(value) {
    return value === true || value === 'true' || value === '是' || value === 'TRUE';
  }

  function enrichItem_(audit) {
    var careform =
      SheetHelper.findByKey(Config.SHEET_NAMES.CAREFORMS, 'careform_id', audit.careform_id)[0] ||
      {};
    var caseRow = {};
    if (careform.assignment_id) {
      var assignment = AssignmentModule.get(careform.assignment_id);
      if (assignment && assignment.case_id) {
        caseRow = CaseModule.get(assignment.case_id) || {};
      }
    }
    if (!caseRow.case_id && careform.encoded_id) {
      caseRow =
        SheetHelper.findByKey(Config.SHEET_NAMES.CASES, 'encoded_id', careform.encoded_id)[0] ||
        {};
    }

    var answers = parseAnswers_(careform);
    var validation = { ok: true, errorLines: [], errors: [] };
    if (typeof MohwLifeCareValidator !== 'undefined') {
      validation = MohwLifeCareValidator.validateRow(answers, 2);
    }

    return {
      audit_id: audit.audit_id,
      careform_id: audit.careform_id,
      reviewer: audit.reviewer || '',
      decision: audit.decision || '',
      reason: audit.reason || '',
      decided_at: audit.decided_at || '',
      assignment_id: careform.assignment_id || '',
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
      visitor_id: careform.visitor_id || '',
      validation_ok: validation.ok,
      error_count: (validation.errors && validation.errors.length) || 0,
      error_lines: (validation.errorLines || []).slice(0, 8),
    };
  }

  function queue(params) {
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    params = params || {};
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
    return rows.map(enrichItem_);
  }

  function enqueue(careformId) {
    var existing = SheetHelper.findByKey(SHEET, 'careform_id', careformId).filter(function (r) {
      return !r.decision;
    });
    if (existing.length) return existing[0];

    return SheetHelper.appendRow(SHEET, {
      audit_id: 'AUD-' + Utilities.getUuid().slice(0, 8),
      careform_id: careformId,
      reviewer: '',
      decision: '',
      reason: '',
    });
  }

  function normalizeDecision_(value) {
    if (value === 'approve' || value === 'approved') return '通過';
    if (value === 'request_changes') return '退回補件';
    if (value === 'reject' || value === 'rejected') return '駁回';
    return value;
  }

  function decide(data) {
    Validation.requireFields(data, ['audit_id', 'decision']);
    var decision = normalizeDecision_(data.decision);
    var current = SheetHelper.findByKey(SHEET, 'audit_id', data.audit_id)[0];
    if (!current) {
      var missing = new Error('Audit record not found: ' + data.audit_id);
      missing.code = 'NOT_FOUND';
      throw missing;
    }

    var preview = enrichItem_(current);
    if (decision === '通過' && preview.validation_ok === false) {
      var verr = new Error('中央系統欄位驗證未通過，不可核准');
      verr.code = 'MOHW_VALIDATION_ERROR';
      verr.errorLines = preview.error_lines || [];
      throw verr;
    }
    if (decision === '通過' && !preview.consent_signed) {
      var cerr = new Error('未取得同意，不可核准');
      cerr.code = 'CONSENT_REQUIRED';
      throw cerr;
    }

    var updated = SheetHelper.updateByKey(SHEET, 'audit_id', data.audit_id, {
      decision: decision,
      reason: data.reason || '',
      reviewer: data.reviewer || Session.getActiveUser().getEmail(),
      decided_at: new Date().toISOString(),
    });
    if (!updated) {
      var err = new Error('Audit record not found: ' + data.audit_id);
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (updated.careform_id) {
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
          Config.SHEET_NAMES.CAREFORMS,
          'careform_id',
          updated.careform_id,
          careformPatch
        );
      }
    }

    return enrichItem_(updated);
  }

  function findByCareform(careformId) {
    return SheetHelper.findByKey(SHEET, 'careform_id', careformId);
  }

  return { queue: queue, enqueue: enqueue, decide: decide, findByCareform: findByCareform };
})();
