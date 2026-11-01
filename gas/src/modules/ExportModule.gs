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

  function truthy_(value) {
    return value === true || value === 'true' || value === '是' || value === 'TRUE';
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
    } catch (e) {}
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

  /**
   * @param {{ validate?: boolean }} options
   *   validate=true：強制重跑 102 欄（不寫入 Sheets）
   *   預設 lite：有快照用快照；無快照且已稽核通過 → 清單顯示 validation_ok=true（僅 list）；
   *   無快照且未稽核 → validation_ok=false。list 路徑禁止 persist／validateRow。
   */
  function candidateFrom_(index, careform, caseRow, options) {
    options = options || {};
    var forceValidate = options.validate === true;
    var audit = VisitRecordIndex.latestAudit(index, careform.careform_id);
    var auditDecision = audit ? String(audit.decision || '') : '';
    var auditedPass = auditDecision === '通過' || String(careform.status) === '已稽核';
    var assignment = index.assignmentById[String(careform.assignment_id || '').trim()] || {};
    var answers = null;
    var validation = { ok: false, errorLines: [], errors: [] };
    var hasSnapshot =
      careform.validation_ok !== undefined &&
      careform.validation_ok !== null &&
      String(careform.validation_ok).trim() !== '';

    if (forceValidate) {
      answers = MohwLifeCareMapper.mergeInputs({ careform: careform, caseRow: caseRow });
      validation = MohwLifeCareValidator.validateRow(answers, 2, {
        registryNationalId: (caseRow && (caseRow.id_number || caseRow.national_id)) || '',
        allowMissingWorkerNationalId: deskPaper_(assignment, careform),
      });
    } else if (hasSnapshot) {
      validation = {
        ok: truthy_(careform.validation_ok) || careform.validation_ok === true,
        errorLines: parseErrorLines_(careform.validation_error_lines),
        errors: [],
      };
    } else if (auditedPass) {
      // Lite list only：舊列無快照但已稽核通過 → 顯示可匯出；真正產檔仍走 validateBatch
      validation = { ok: true, errorLines: [], errors: [] };
    } else {
      validation = { ok: false, errorLines: [], errors: [] };
    }

    var visitDate = '';
    if (answers) {
      visitDate = String(answers.visit_date || '');
    } else {
      try {
        var parsed = parseAnswers_(careform);
        visitDate = String((parsed && parsed.visit_date) || '');
      } catch (eDate) {}
    }

    return {
      case_id: caseRow.case_id,
      encoded_id: caseRow.encoded_id,
      external_id: caseRow.external_id || '',
      name: caseRow.name || '',
      visit_district: caseRow.visit_district || '',
      visit_village: caseRow.visit_village || '',
      visit_date: visitDate || String(careform.visit_date || ''),
      careform_id: careform.careform_id,
      careform_status: careform.status,
      visit_result: careform.visit_result || '',
      submitted_at: careform.submitted_at || '',
      audited_at: careform.audited_at || '',
      audit_decision: auditDecision || (auditedPass ? '通過' : '待稽核'),
      export_ready: auditedPass && validation.ok,
      validation_ok: validation.ok,
      error_count: (validation.errorLines && validation.errorLines.length) || 0,
      error_lines: (validation.errorLines || []).slice(0, 5),
      assignment_id: careform.assignment_id || '',
    };
  }

  /**
   * 可匯出候選：已提交／已稽核關懷表，用派案 case_id 對個案，不用 encoded_id。
   */
  function listCandidatesFromIndex_(index, params) {
    params = params || {};
    var onlyAudited = params.only_audited === true || params.only_audited === 'true';
    var forceValidate = params.validate === '1' || params.validate === true || params.fresh === '1';
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
      return candidateFrom_(index, byCase[caseId].careform, byCase[caseId].caseRow, {
        validate: forceValidate,
      });
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
    var forceValidate = params.validate === '1' || params.validate === true || params.fresh === '1';
    var cacheKey = ReadCache.key(
      'exportCand5:' +
        (onlyAudited ? '1' : '0') +
        ':' +
        (forceValidate ? 'full' : 'lite') +
        ':' +
        String(params.district || '')
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
      'exportMgr3:' + (onlyAudited ? '1' : '0') + ':' + String(params.district || '')
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

    var answerRows = rows.slice(1).map(function (row) {
      var answers = {};
      MohwLifeCareMapper.keys.forEach(function (key, index) { answers[key] = row[index]; });
      return answers;
    });
    var registryIds = payloads.map(function (payload) {
      var caseRow = payload.caseRow || {};
      return caseRow.id_number || caseRow.national_id || '';
    });

    // 加速：全部關懷表已有 validation_ok 快照時，略過整批 103 欄重驗（仍可用 force_validate 強制）
    var forceValidate =
      data.force_validate === true ||
      data.force_validate === 'true' ||
      data.fresh === '1';
    var allSnapshotsOk = !forceValidate && payloads.every(function (payload) {
      var cf = payload.careform || {};
      var raw = cf.validation_ok;
      return raw === true || raw === 'true' || raw === 'TRUE' || raw === '是';
    });
    var batch = allSnapshotsOk
      ? {
          ok: true,
          successCount: answerRows.length,
          failCount: 0,
          errorLines: [],
          results: [],
          trusted_snapshots: true,
        }
      : MohwLifeCareValidator.validateBatch(answerRows, 2, registryIds);
    var strict = true; // 正式生活關懷表禁止略過驗證產檔（無快照時仍嚴格）。
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
        trusted_snapshots: batch.trusted_snapshots === true,
      },
      message: batch.ok
        ? (batch.trusted_snapshots
            ? '已產生 103 欄 xlsx（' + exportRecord.file_name + '；沿用驗證快照加速）並上傳 Google Drive'
            : '已產生 103 欄 xlsx（' + exportRecord.file_name + '）並上傳 Google Drive')
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
      'exportWs2:' + (onlyAudited ? '1' : '0') + ':' + String(params.district || '')
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

  /**
   * 管理端：已稽核個案整版 A3 套印（從 Sheets 關懷表答案填入母版）。
   * @param {{ case_id?: string, careform_id?: string, include_base64?: boolean }} data
   */
  function careFormPdf(data) {
    data = data || {};
    var caseId = String(data.case_id || '').trim();
    var careformId = String(data.careform_id || '').trim();
    if (!caseId && !careformId) {
      var reqErr = new Error('請提供 case_id 或 careform_id');
      reqErr.code = 'CASE_ID_REQUIRED';
      throw reqErr;
    }

    var index = VisitRecordIndex.build();
    var careform = null;
    var caseRow = null;

    if (careformId) {
      careform = index.careformById[careformId] || null;
      if (careform) {
        caseRow =
          VisitRecordIndex.caseForCareform(index, careform) ||
          (caseId ? index.caseById[caseId] : null);
      }
    }
    if (!careform && caseId) {
      caseRow = index.caseById[caseId] || CaseModule.get(caseId);
      careform = VisitRecordIndex.latestEligibleCareformForCase(index, caseId);
    }
    if (!careform || !caseRow) {
      var miss = new Error('找不到已提交的關懷表');
      miss.code = 'CAREFORM_NOT_FOUND';
      throw miss;
    }

    var audit = VisitRecordIndex.latestAudit(index, careform.careform_id);
    var auditedPass =
      (audit && String(audit.decision) === '通過') || String(careform.status) === '已稽核';
    if (!auditedPass) {
      var deny = new Error('僅已稽核通過的個案可整版套印');
      deny.code = 'NOT_AUDITED';
      throw deny;
    }

    var answers = parseAnswers_(careform);
    if (!answers || !Object.keys(answers).length) {
      var empty = new Error('關懷表尚無答案內容');
      empty.code = 'ANSWERS_EMPTY';
      throw empty;
    }

    return NtpcCareFormPdfModule.generate({
      answers: answers,
      elder_name: caseRow.name || answers.name || '',
      case_code: caseRow.external_id || caseRow.encoded_id || caseRow.case_id || '',
      encoded_id: caseRow.encoded_id || '',
      district: caseRow.visit_district || answers.household_district || '',
      include_base64: data.include_base64 !== false,
    });
  }

  return {
    listCandidates: listCandidates,
    managerBundle: managerBundle,
    workspaceBundle: workspaceBundle,
    exportLifeCareXlsx: exportLifeCareXlsx,
    careFormPdf: careFormPdf,
    history: history,
  };
})();
