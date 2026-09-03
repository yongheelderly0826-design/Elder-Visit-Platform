var CareFormModule = (function () {
  var SHEET = Config.SHEET_NAMES.CAREFORMS;

  function get(assignmentId) {
    var rows = SheetHelper.findByKey(SHEET, 'assignment_id', assignmentId);
    return rows[rows.length - 1] || null;
  }

  function saveDraft(data) {
    Validation.requireFields(data, ['assignment_id', 'visitor_id', 'encoded_id']);
    var record = {
      careform_id: data.careform_id || 'CF-' + Utilities.getUuid().slice(0, 8),
      assignment_id: data.assignment_id,
      encoded_id: data.encoded_id,
      visitor_id: data.visitor_id,
      visit_result: data.visit_result || '',
      completion_pct: data.completion_pct || 0,
      answers_json: JSON.stringify(data.answers || {}),
      consent_signed: data.consent_signed || false,
      photo_urls: JSON.stringify(data.photos || []),
      status: '草稿',
    };
    return SheetHelper.appendRow(SHEET, record);
  }

  function submit(data) {
    Validation.requireFields(data, ['assignment_id', 'visitor_id', 'encoded_id', 'answers']);
    if (data.visit_result === '未遇' && (!data.photos || data.photos.length === 0)) {
      var err = new Error('Photos required for missed visit');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    var answers = data.answers || {};
    var validation = MohwLifeCareValidator.validateRow(answers, data.row || 2);
    if (!validation.ok) {
      var verr = new Error(validation.errorLines.join('；'));
      verr.code = 'MOHW_VALIDATION_ERROR';
      verr.errors = validation.errors;
      verr.errorLines = validation.errorLines;
      throw verr;
    }

    var record = {
      careform_id: 'CF-' + Utilities.getUuid().slice(0, 8),
      assignment_id: data.assignment_id,
      encoded_id: data.encoded_id,
      visitor_id: data.visitor_id,
      visit_result: data.visit_result || '完成訪視',
      completion_pct: data.completion_pct || 100,
      answers_json: JSON.stringify(answers),
      consent_signed: data.consent_signed || false,
      photo_urls: JSON.stringify(data.photos || []),
      status: '已提交',
      submitted_at: new Date().toISOString(),
    };
    SheetHelper.appendRow(SHEET, record);

    // 更新派案狀態
    AssignmentModule.confirm({
      assignment_id: data.assignment_id,
      status: data.visit_result === '未遇' ? '空訪' : '已完成',
    });

    // 加入稽核佇列
    AuditModule.enqueue(record.careform_id);

    return {
      careform: record,
      validation: { ok: true, errorLines: [] },
    };
  }

  function validate(data) {
    return MohwLifeCareValidator.validateRow((data && data.answers) || {}, (data && data.row) || 2);
  }

  return { get: get, saveDraft: saveDraft, submit: submit, validate: validate };
})();
