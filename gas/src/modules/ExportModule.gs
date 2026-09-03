/**
 * 衛福部生活關懷表 .xlsx 匯出
 * 對照官方 102 欄範本（lib/domain/mohw-life-care-schema.json）
 */

var ExportModule = (function () {
  var SHEET = Config.SHEET_NAMES.EXPORTS;

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

  function latestCareform_(encodedId) {
    var careforms = SheetHelper.findByKey(
      Config.SHEET_NAMES.CAREFORMS, 'encoded_id', encodedId
    );
    if (!careforms.length) return null;
    return careforms[careforms.length - 1];
  }

  function latestAudit_(careformId) {
    if (!careformId) return null;
    var audits = AuditModule.findByCareform(careformId);
    if (!audits.length) return null;
    return audits[audits.length - 1];
  }

  /**
   * 可匯出候選清單：有已提交／已稽核關懷表的個案
   * params.only_audited = true 時只回傳稽核通過
   */
  function listCandidates(params) {
    params = params || {};
    var onlyAudited = params.only_audited === true || params.only_audited === 'true';
    var cases = CaseModule.list(params || {});
    var items = [];

    cases.forEach(function (caseRow) {
      var careform = latestCareform_(caseRow.encoded_id);
      if (!careform) return;
      if (careform.status !== '已提交' && careform.status !== '已稽核') return;

      var audit = latestAudit_(careform.careform_id);
      var auditDecision = audit ? String(audit.decision || '') : '';
      var auditedPass = auditDecision === '通過' || careform.status === '已稽核';

      if (onlyAudited && !auditedPass) return;

      var answers = parseAnswers_(careform);
      var validation = MohwLifeCareValidator.validateRow(answers, 2);

      items.push({
        case_id: caseRow.case_id,
        encoded_id: caseRow.encoded_id,
        external_id: caseRow.external_id || '',
        name: caseRow.name || '',
        visit_district: caseRow.visit_district || '',
        visit_village: caseRow.visit_village || '',
        careform_id: careform.careform_id,
        careform_status: careform.status,
        visit_result: careform.visit_result || '',
        submitted_at: careform.submitted_at || '',
        audited_at: careform.audited_at || '',
        audit_decision: auditDecision || (auditedPass ? '通過' : '待稽核'),
        export_ready: auditedPass && validation.ok,
        validation_ok: validation.ok,
        error_count: validation.errors.length,
        error_lines: validation.errorLines.slice(0, 5),
      });
    });

    return {
      total: items.length,
      ready_count: items.filter(function (i) { return i.export_ready; }).length,
      items: items,
    };
  }

  function exportLifeCareXlsx(data) {
    Validation.requireFields(data, ['case_ids']);
    var caseIds = data.case_ids;
    var onlyAudited = data.only_audited === true;
    var payloads = [];
    var skipped = [];

    caseIds.forEach(function (caseId) {
      var caseRow = CaseModule.get(caseId);
      if (!caseRow) {
        skipped.push({ case_id: caseId, reason: '個案不存在' });
        return;
      }
      var careform = latestCareform_(caseRow.encoded_id);
      if (!careform) {
        skipped.push({ case_id: caseId, reason: '尚無關懷表' });
        return;
      }
      if (onlyAudited) {
        var audit = latestAudit_(careform.careform_id);
        var pass = (audit && audit.decision === '通過') || careform.status === '已稽核';
        if (!pass) {
          skipped.push({ case_id: caseId, reason: '尚未稽核通過' });
          return;
        }
      }
      payloads.push({ caseRow: caseRow, careform: careform });
    });

    if (!payloads.length) {
      var emptyErr = new Error('沒有可匯出的個案');
      emptyErr.code = 'NO_EXPORTABLE_CASES';
      emptyErr.errorLines = skipped.map(function (s) {
        return s.case_id + ' ' + s.reason;
      });
      throw emptyErr;
    }

    var rows = MohwLifeCareMapper.buildWorkbookRows(payloads);

    var answerRows = payloads.map(function (payload) {
      return parseAnswers_(payload.careform);
    });

    var batch = MohwLifeCareValidator.validateBatch(answerRows, 2);
    var strict = data.strict !== false;
    if (strict && !batch.ok) {
      var verr = new Error(
        '匯出驗證失敗 ' + batch.failCount + ' 筆：' + batch.errorLines.slice(0, 10).join('；')
      );
      verr.code = 'MOHW_VALIDATION_ERROR';
      verr.errorLines = batch.errorLines;
      verr.errors = batch.results;
      throw verr;
    }

    var exportRecord = {
      export_id: 'EXP-' + Utilities.getUuid().slice(0, 8),
      export_type: 'mohw_life_care',
      case_count: payloads.length,
      file_url: '',
      exported_by: Session.getActiveUser().getEmail(),
      exported_at: new Date().toISOString(),
    };

    var fileInfo = MohwLifeCareExporter.createXlsxFile(rows, exportRecord.export_id);
    exportRecord.file_url = fileInfo.fileUrl;

    SheetHelper.appendRow(SHEET, exportRecord);

    return {
      export_id: exportRecord.export_id,
      case_count: payloads.length,
      skipped: skipped,
      status: 'ready',
      column_count: MohwLifeCareMapper.headers.length,
      file_url: fileInfo.fileUrl,
      file_name: fileInfo.fileName,
      file_id: fileInfo.fileId,
      validation: {
        ok: batch.ok,
        successCount: batch.successCount,
        failCount: batch.failCount,
        errorLines: batch.errorLines,
      },
      message: batch.ok
        ? '已產生 102 欄 xlsx 並上傳 Google Drive'
        : '已產生 xlsx，但有 ' + batch.failCount + ' 筆驗證錯誤（非嚴格模式）',
    };
  }

  function history(params) {
    return SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
  }

  return {
    listCandidates: listCandidates,
    exportLifeCareXlsx: exportLifeCareXlsx,
    history: history,
  };
})();
