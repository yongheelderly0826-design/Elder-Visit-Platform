/**
 * 衛福部生活關懷表 .xlsx 匯出
 * 對照官方 103 欄範本（lib/domain/mohw-life-care-schema.json）
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

  function candidateFrom_(index, careform, caseRow) {
    var audit = VisitRecordIndex.latestAudit(index, careform.careform_id);
    var auditDecision = audit ? String(audit.decision || '') : '';
    var auditedPass = auditDecision === '通過' || String(careform.status) === '已稽核';
    var answers = parseAnswers_(careform);
    var validation = MohwLifeCareValidator.validateRow(answers, 2);
    return {
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
      assignment_id: careform.assignment_id || '',
    };
  }

  /**
   * 可匯出候選：已提交／已稽核關懷表，用派案 case_id 對個案，不用 encoded_id。
   */
  function listCandidatesFromIndex_(index, params) {
    params = params || {};
    var onlyAudited = params.only_audited === true || params.only_audited === 'true';
    var district = String(params.district || '').trim();
    var byCase = {};

    index.careforms.forEach(function (careform) {
      if (!VisitRecordIndex.ELIGIBLE[String(careform.status || '')]) return;
      var caseRow = VisitRecordIndex.caseForCareform(index, careform);
      if (!caseRow) return;
      if (district && String(caseRow.visit_district || '') !== district) return;
      var audit = VisitRecordIndex.latestAudit(index, careform.careform_id);
      var auditDecision = audit ? String(audit.decision || '') : '';
      var auditedPass = auditDecision === '通過' || String(careform.status) === '已稽核';
      if (onlyAudited && !auditedPass) return;
      var caseId = String(caseRow.case_id);
      var prev = byCase[caseId];
      if (prev && String(prev.careform.status) === '已稽核' && String(careform.status) !== '已稽核') {
        return;
      }
      byCase[caseId] = { careform: careform, caseRow: caseRow };
    });

    var items = Object.keys(byCase).map(function (caseId) {
      return candidateFrom_(index, byCase[caseId].careform, byCase[caseId].caseRow);
    });

    return {
      total: items.length,
      ready_count: items.filter(function (i) { return i.export_ready; }).length,
      items: items,
    };
  }

  function listCandidates(params) {
    params = params || {};
    var onlyAudited = params.only_audited === true || params.only_audited === 'true';
    var cacheKey = ReadCache.key(
      'exportCand:' + (onlyAudited ? '1' : '0') + ':' + String(params.district || '')
    );
    var cached = ReadCache.getJson(cacheKey);
    if (cached) return cached;
    var result = listCandidatesFromIndex_(VisitRecordIndex.build(), params);
    ReadCache.putJson(cacheKey, result);
    return result;
  }

  function managerBundle(params) {
    params = params || {};
    var onlyAudited = params.only_audited === true || params.only_audited === 'true';
    var cacheKey = ReadCache.key(
      'exportMgr2:' + (onlyAudited ? '1' : '0') + ':' + String(params.district || '')
    );
    var cached = ReadCache.getJson(cacheKey);
    if (cached) return cached;

    var index = VisitRecordIndex.build();
    var candidates = listCandidatesFromIndex_(index, params);
    var paymentItems = PaymentModule.visitItemsFromIndex(index);
    var totalAmount = paymentItems.reduce(function (sum, item) {
      return sum + (item.total_fee || 0);
    }, 0);
    var payload = {
      candidates: candidates,
      payments: {
        batch_no: 'PB-VISIT-' + Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd'),
        item_count: paymentItems.length,
        total_amount: totalAmount,
        items: paymentItems,
        warnings: paymentItems.length ? [] : ['目前沒有稽核通過、可列入核銷的訪視。'],
      },
      counts: VisitRecordIndex.counts(index),
    };
    ReadCache.putJson(cacheKey, payload);
    return payload;
  }

  function exportLifeCareXlsx(data) {
    Validation.requireFields(data, ['case_ids']);
    var caseIds = data.case_ids;
    var onlyAudited = data.only_audited === true;
    var payloads = [];
    var skipped = [];
    var index = VisitRecordIndex.build();

    caseIds.forEach(function (caseId) {
      var caseRow = index.caseById[String(caseId)] || CaseModule.get(caseId);
      if (!caseRow) {
        skipped.push({ case_id: caseId, reason: '個案不存在' });
        return;
      }
      var careform = VisitRecordIndex.latestEligibleCareformForCase(index, caseId);
      if (!careform) {
        skipped.push({ case_id: caseId, reason: '尚無關懷表' });
        return;
      }
      if (onlyAudited) {
        var audit = VisitRecordIndex.latestAudit(index, careform.careform_id);
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

    var stamp = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd-HHmmss');
    var exportId = uniqueExportId_(stamp);
    // 例：生活關懷表_EXP_20261006-222715.xlsx（日期時間当分秒流水號）
    var fileName = '生活關懷表_' + exportId.replace(/^EXP-/, 'EXP_') + '.xlsx';

    var exportRecord = {
      export_id: exportId,
      export_type: 'mohw_life_care',
      case_count: payloads.length,
      file_name: fileName,
      file_id: '',
      file_url: '',
      column_count: MohwLifeCareMapper.headers.length,
      skipped_count: skipped.length,
      exported_by: Session.getActiveUser().getEmail() || 'system',
      exported_at: new Date().toISOString(),
    };

    SheetHelper.ensureColumns(SHEET, [
      'export_id',
      'export_type',
      'case_count',
      'file_name',
      'file_id',
      'file_url',
      'column_count',
      'skipped_count',
      'exported_by',
      'exported_at',
    ]);

    var fileInfo = MohwLifeCareExporter.createXlsxFile(rows, fileName);
    exportRecord.file_url = fileInfo.fileUrl;
    exportRecord.file_id = fileInfo.fileId;
    exportRecord.file_name = fileInfo.fileName || fileName;

    SheetHelper.appendRow(SHEET, exportRecord);
    try {
      ReadCache.bump();
    } catch (e) {}

    return {
      export_id: exportRecord.export_id,
      case_count: payloads.length,
      skipped: skipped,
      status: 'ready',
      column_count: MohwLifeCareMapper.headers.length,
      file_url: fileInfo.fileUrl,
      file_name: exportRecord.file_name,
      file_id: fileInfo.fileId,
      validation: {
        ok: batch.ok,
        successCount: batch.successCount,
        failCount: batch.failCount,
        errorLines: batch.errorLines,
      },
      message: batch.ok
        ? '已產生 103 欄 xlsx（' + exportRecord.file_name + '）並上傳 Google Drive'
        : '已產生 xlsx，但有 ' + batch.failCount + ' 筆驗證錯誤（非嚴格模式）',
    };
  }

  /** EXP-yyyyMMdd-HHmmss；同秒重複則加 -2、-3… */
  function uniqueExportId_(stamp) {
    var base = 'EXP-' + stamp;
    var existing = {};
    try {
      SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET)).forEach(function (row) {
        existing[String(row.export_id || '')] = true;
      });
    } catch (e) {
      return base;
    }
    if (!existing[base]) return base;
    var n = 2;
    while (existing[base + '-' + n]) n++;
    return base + '-' + n;
  }

  function history(params) {
    params = params || {};
    var limit = Math.min(Number(params.limit) || 50, 100);
    var cacheKey = ReadCache.key('exportHist:' + limit);
    var cached = ReadCache.getJson(cacheKey);
    if (cached) return cached;

    var payload = historyLite_(limit);
    ReadCache.putJson(cacheKey, payload);
    return payload;
  }

  /** 讀取匯出紀錄（不做 ensureColumns，避免 Vercel 冷路徑逾時） */
  function historyLite_(limit) {
    var rows = [];
    try {
      rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET)).map(function (row) {
        return {
          export_id: String(row.export_id || ''),
          export_type: String(row.export_type || ''),
          case_count: Number(row.case_count) || 0,
          file_name: String(row.file_name || ''),
          file_id: String(row.file_id || ''),
          file_url: String(row.file_url || ''),
          column_count: Number(row.column_count) || 0,
          skipped_count: Number(row.skipped_count) || 0,
          exported_by: String(row.exported_by || ''),
          exported_at: String(row.exported_at || ''),
        };
      });
    } catch (e) {
      rows = [];
    }

    rows.sort(function (a, b) {
      return String(b.exported_at).localeCompare(String(a.exported_at));
    });

    var totalCases = 0;
    var mohwCount = 0;
    var mohwCases = 0;
    rows.forEach(function (row) {
      totalCases += row.case_count;
      if (row.export_type === 'mohw_life_care' || !row.export_type) {
        mohwCount += 1;
        mohwCases += row.case_count;
      }
    });

    return {
      items: rows.slice(0, limit),
      summary: {
        total_exports: rows.length,
        total_cases: totalCases,
        mohw_exports: mohwCount,
        mohw_cases: mohwCases,
        last_exported_at: rows[0] ? rows[0].exported_at : '',
      },
    };
  }

  /**
   * 匯出頁一次取候選＋匯出紀錄，避免 Vercel 並行打兩個 GAS action 易回 HTML。
   */
  function workspaceBundle(params) {
    params = params || {};
    var onlyAudited = params.only_audited === true || params.only_audited === 'true';
    var cacheKey = ReadCache.key(
      'exportWs:' + (onlyAudited ? '1' : '0') + ':' + String(params.district || '')
    );
    var cached = ReadCache.getJson(cacheKey);
    if (cached) return cached;

    var index = VisitRecordIndex.build();
    var candidates = listCandidatesFromIndex_(index, params);
    var hist = historyLite_(50);
    var payload = {
      candidates: candidates,
      history: hist,
      payments: null,
      counts: VisitRecordIndex.counts(index),
    };
    ReadCache.putJson(cacheKey, payload);
    return payload;
  }

  return {
    listCandidates: listCandidates,
    managerBundle: managerBundle,
    workspaceBundle: workspaceBundle,
    exportLifeCareXlsx: exportLifeCareXlsx,
    history: history,
  };
})();
