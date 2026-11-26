/**
 * 進度修正：關懷表／分桶索引列表與批量改正（直 KEY 仍走 MohwProgressModule.patchMarks）
 */
var ProgressCorrectionModule = (function () {
  var INDEX = Config.SHEET_NAMES.CASE_PROGRESS_BUCKET_INDEX;
  var CAREFORMS = Config.SHEET_NAMES.CAREFORMS;
  var CASES = Config.SHEET_NAMES.CASES;
  var DESK = Config.SHEET_NAMES.DESK_KEY_LOGS;
  var MARKS = Config.SHEET_NAMES.MOHW_PROGRESS_MARKS;

  function error_(code, message) {
    var err = new Error(message);
    err.code = code;
    throw err;
  }

  function parseAnswers_(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(String(raw));
    } catch (e) {
      return {};
    }
  }

  function now_() {
    return new Date().toISOString();
  }

  /** 進度修正 UI 狀態 → 關懷表 visit_result + answers.visit_status */
  function mapOutcomeToCareform_(outcome) {
    var o = String(outcome || '').trim();
    if (o === '已完成') return { visit_result: '訪視成功', visit_status: '已完成' };
    if (o === '未遇') return { visit_result: '未遇', visit_status: '查無此人' };
    if (o === '拒訪') return { visit_result: '拒訪', visit_status: '拒絕訪視' };
    if (o === '住址不詳') {
      return {
        visit_result: '未遇',
        visit_status: '住址不詳',
        living_address_type: '未住戶籍地址',
        living_address_note: '居住地址不詳',
      };
    }
    return null;
  }

  function displayOutcomeFromCareform_(visitResult, visitStatus) {
    var vs = String(visitStatus || '').trim();
    var vr = String(visitResult || '').trim();
    if (vs === '住址不詳') return '住址不詳';
    if (vs === '拒絕訪視' || vr === '拒訪') return '拒訪';
    if (vr === '未遇' || vs === '查無此人' || vs.indexOf('未遇') >= 0) return '未遇';
    if (vs === '已完成' || vr === '訪視成功' || vr === '完成') return '已完成';
    return vs || vr || '';
  }

  function latestDeskByCase_() {
    var map = {};
    try {
      var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(DESK));
      rows.forEach(function (row) {
        var caseId = String(row.case_id || '').trim();
        if (!caseId) return;
        var at = String(row.keyed_at || row.created_at || '');
        var prev = map[caseId];
        if (!prev || at > String(prev.keyed_at || prev.created_at || '')) {
          map[caseId] = row;
        }
      });
    } catch (e) {
      // desk sheet optional
    }
    return map;
  }

  function caseMetaById_() {
    var map = {};
    SheetHelper.rowsToObjects(SheetHelper.getSheet(CASES)).forEach(function (row) {
      var id = String(row.case_id || '').trim();
      if (!id) return;
      map[id] = {
        name: String(row.name || '').trim(),
        encoded_id: String(row.encoded_id || '').trim(),
        village: String(row.visit_village || row.household_village || '').trim(),
        village_seq: row.village_seq != null ? Number(row.village_seq) : null,
      };
    });
    return map;
  }

  /**
   * 列出 eligible 關懷表（可選里別）
   */
  function listCareforms(params) {
    params = params || {};
    var villageFilter = String(params.village_name || params.village || '').trim();
    var cases = caseMetaById_();
    var deskByCase = latestDeskByCase_();
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(CAREFORMS));
    var out = [];
    var keyedNames = {};

    rows.forEach(function (cf) {
      var status = String(cf.status || '').trim();
      if (!VisitRecordIndex.ELIGIBLE[status]) return;
      var caseId = String(cf.case_id || '').trim();
      var meta = cases[caseId] || {};
      var village = meta.village || '';
      if (villageFilter && village !== villageFilter) return;

      var answers = parseAnswers_(cf.answers_json);
      var desk = deskByCase[caseId];
      var builder =
        (desk &&
          (String(desk.display_name || '').trim() ||
            String(desk.clerk_id || '').trim())) ||
        String(cf.keyed_by_name || '').trim() ||
        '';
      if (!builder) {
        var vid = String(cf.visitor_id || '').trim();
        if (vid) {
          try {
            var visitor = VisitorModule.get(vid);
            builder = String((visitor && visitor.name) || vid).trim();
          } catch (eV) {
            builder = vid;
          }
        }
      }
      if (builder) keyedNames[builder] = true;

      out.push({
        row_id: String(cf.careform_id || ''),
        source: 'careform',
        careform_id: String(cf.careform_id || ''),
        case_id: caseId,
        name: meta.name || '',
        encoded_id: meta.encoded_id || String(cf.encoded_id || ''),
        village_name: village,
        village_seq: meta.village_seq,
        outcome: displayOutcomeFromCareform_(cf.visit_result, answers.visit_status),
        visit_status: String(answers.visit_status || ''),
        visit_result: String(cf.visit_result || ''),
        keyed_by_name: builder,
        civil_worker_name: String(answers.civil_worker_name || '').trim(),
        social_worker_name: String(answers.social_worker_name || '').trim(),
        reported_at: String(cf.submitted_at || cf.updated_at || ''),
        careform_status: status,
      });
    });

    out.sort(function (a, b) {
      var v = String(a.village_name).localeCompare(String(b.village_name), 'zh-Hant');
      if (v) return v;
      return String(a.encoded_id).localeCompare(String(b.encoded_id));
    });

    return {
      source: 'careform',
      rows: out,
      keyed_by_names: Object.keys(keyedNames).sort(function (a, b) {
        return a.localeCompare(b, 'zh-Hant');
      }),
      villages: Object.keys(
        out.reduce(function (acc, row) {
          if (row.village_name) acc[row.village_name] = true;
          return acc;
        }, {})
      ).sort(function (a, b) {
        return a.localeCompare(b, 'zh-Hant');
      }),
    };
  }

  /**
   * 列出分桶索引列（建議帶里別；未帶里則上限 max_rows）
   */
  function listIndex(params) {
    params = params || {};
    var villageFilter = String(params.village_name || params.village || '').trim();
    var bucketFilter = String(params.bucket || '').trim();
    var maxRows = Number(params.max_rows);
    if (!isFinite(maxRows) || maxRows <= 0) maxRows = villageFilter ? 5000 : 800;

    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(INDEX));
    var out = [];
    var keyedNames = {};
    var villages = {};

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var village = String(row.village || '').trim();
      if (villageFilter && village !== villageFilter) continue;
      if (bucketFilter && String(row.bucket || '') !== bucketFilter) continue;
      villages[village || '（空白）'] = true;

      var builder = String(row.builder_name || '').trim();
      if (builder) keyedNames[builder] = true;

      var outcome = displayOutcomeFromCareform_(
        row.careform_visit_result,
        row.careform_visit_status || row.visit_status
      );
      if (!outcome) outcome = String(row.mark_outcome || row.visit_status || '');

      out.push({
        row_id: String(row.bucket || '') + '|' + String(row.seq || '') + '|' + String(row.case_id || ''),
        source: 'index',
        bucket: String(row.bucket || ''),
        seq: Number(row.seq) || 0,
        case_id: String(row.case_id || ''),
        name: String(row.name || ''),
        encoded_id: '',
        village_name: village,
        village_seq: null,
        outcome: outcome,
        visit_status: String(row.visit_status || ''),
        careform_visit_status: String(row.careform_visit_status || ''),
        careform_visit_result: String(row.careform_visit_result || ''),
        mark_outcome: String(row.mark_outcome || ''),
        keyed_by_name: builder,
        civil_worker_name: String(row.civil_worker_name || ''),
        social_worker_name: String(row.social_worker_name || ''),
        reported_at: '',
        channel: String(row.channel || ''),
        has_careform: String(row.has_careform || '') === 'Y',
        has_direct_mark: String(row.has_direct_mark || '') === 'Y',
      });

      if (out.length >= maxRows) break;
    }

    // fill encoded_id from cases
    var cases = caseMetaById_();
    out.forEach(function (row) {
      var meta = cases[row.case_id];
      if (meta) {
        row.encoded_id = meta.encoded_id || '';
        row.village_seq = meta.village_seq;
        if (!row.name) row.name = meta.name;
      }
    });

    return {
      source: 'index',
      rows: out,
      truncated: !villageFilter && rows.length > maxRows,
      max_rows: maxRows,
      keyed_by_names: Object.keys(keyedNames).sort(function (a, b) {
        return a.localeCompare(b, 'zh-Hant');
      }),
      villages: Object.keys(villages)
        .filter(function (v) {
          return v !== '（空白）';
        })
        .sort(function (a, b) {
          return a.localeCompare(b, 'zh-Hant');
        }),
      note: villageFilter
        ? null
        : '未選里別時最多載入 ' + maxRows + ' 筆；建議先選里再改正。',
    };
  }

  function patchCareformRow_(careformId, fields, note, correctedBy) {
    var found = SheetHelper.findByKey(CAREFORMS, 'careform_id', careformId)[0];
    if (!found) return { ok: false, reason: '找不到關懷表' };
    if (!VisitRecordIndex.ELIGIBLE[String(found.status || '')]) {
      return { ok: false, reason: '非 eligible 關懷表' };
    }

    var answers = parseAnswers_(found.answers_json);
    var sheetPatch = {};
    var touched = false;

    if (Object.prototype.hasOwnProperty.call(fields, 'civil_worker_name')) {
      answers.civil_worker_name = String(fields.civil_worker_name || '').trim();
      touched = true;
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'social_worker_name')) {
      answers.social_worker_name = String(fields.social_worker_name || '').trim();
      touched = true;
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'outcome')) {
      var mapped = mapOutcomeToCareform_(fields.outcome);
      if (!mapped) return { ok: false, reason: '狀態無效' };
      answers.visit_status = mapped.visit_status;
      if (mapped.living_address_type) answers.living_address_type = mapped.living_address_type;
      if (mapped.living_address_note) answers.living_address_note = mapped.living_address_note;
      sheetPatch.visit_result = mapped.visit_result;
      touched = true;
    }

    if (note) {
      var stamp =
        Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm') +
        ' 進度修正' +
        (correctedBy ? '（' + correctedBy + '）' : '') +
        '：' +
        note;
      var prevNotes = String(answers.visit_notes || '').trim();
      answers.visit_notes = prevNotes ? prevNotes + '｜' + stamp : stamp;
      touched = true;
    }

    if (touched) {
      sheetPatch.answers_json = JSON.stringify(answers);
      sheetPatch.updated_at = now_();
      SheetHelper.updateByKey(CAREFORMS, 'careform_id', careformId, sheetPatch);
    }

    // 建檔：優先改最新 desk log display_name
    if (Object.prototype.hasOwnProperty.call(fields, 'keyed_by_name')) {
      var caseId = String(found.case_id || '').trim();
      var builderName = String(fields.keyed_by_name || '').trim();
      var deskByCase = latestDeskByCase_();
      var desk = deskByCase[caseId];
      if (desk && desk.log_id) {
        SheetHelper.updateByKey(DESK, 'log_id', String(desk.log_id), {
          display_name: builderName,
        });
      } else if (caseId) {
        // 無 desk：寫入 answers 輔助欄，並同步索引時用
        answers = parseAnswers_(
          SheetHelper.findByKey(CAREFORMS, 'careform_id', careformId)[0].answers_json
        );
        answers.correction_builder_name = builderName;
        SheetHelper.updateByKey(CAREFORMS, 'careform_id', careformId, {
          answers_json: JSON.stringify(answers),
          updated_at: now_(),
        });
      }
    }

    syncIndexForCase_(String(found.case_id || ''), fields);
    return { ok: true, careform_id: careformId };
  }

  function findActiveMarkForCase_(caseId) {
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(MARKS));
    for (var i = rows.length - 1; i >= 0; i--) {
      if (
        String(rows[i].case_id || '') === caseId &&
        String(rows[i].status || 'active') === 'active'
      ) {
        return rows[i];
      }
    }
    return null;
  }

  function syncIndexForCase_(caseId, fields) {
    if (!caseId) return;
    var sheet = SheetHelper.getSheet(INDEX);
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return;
    var headers = data[0];
    var caseIdx = headers.indexOf('case_id');
    if (caseIdx === -1) return;

    for (var r = 1; r < data.length; r++) {
      if (String(data[r][caseIdx] || '') !== caseId) continue;
      var obj = {};
      headers.forEach(function (h, i) {
        obj[h] = data[r][i];
      });
      if (Object.prototype.hasOwnProperty.call(fields, 'civil_worker_name')) {
        obj.civil_worker_name = String(fields.civil_worker_name || '');
      }
      if (Object.prototype.hasOwnProperty.call(fields, 'social_worker_name')) {
        obj.social_worker_name = String(fields.social_worker_name || '');
      }
      if (Object.prototype.hasOwnProperty.call(fields, 'keyed_by_name')) {
        obj.builder_name = String(fields.keyed_by_name || '');
      }
      if (Object.prototype.hasOwnProperty.call(fields, 'outcome')) {
        var mapped = mapOutcomeToCareform_(fields.outcome);
        if (mapped) {
          obj.careform_visit_status = mapped.visit_status;
          obj.careform_visit_result = mapped.visit_result;
          if (String(obj.has_direct_mark || '') === 'Y' && String(obj.has_careform || '') !== 'Y') {
            obj.mark_outcome = String(fields.outcome || '');
          }
        }
      }
      var rowValues = headers.map(function (h) {
        return obj[h] !== undefined ? obj[h] : '';
      });
      sheet.getRange(r + 1, 1, 1, headers.length).setValues([rowValues]);
    }
  }

  function patchIndexRow_(rowId, fields, note, correctedBy) {
    // row_id = bucket|seq|case_id
    var parts = String(rowId || '').split('|');
    var caseId = parts.length >= 3 ? parts.slice(2).join('|') : '';
    if (!caseId) return { ok: false, reason: '列 ID 無效' };

    var indexRows = SheetHelper.rowsToObjects(SheetHelper.getSheet(INDEX)).filter(
      function (row) {
        return String(row.case_id || '') === caseId;
      }
    );
    if (!indexRows.length) return { ok: false, reason: '找不到索引列' };

    var sample = indexRows[0];
    var hasCf = String(sample.has_careform || '') === 'Y';
    var hasMark = String(sample.has_direct_mark || '') === 'Y';

    // 優先回寫關懷表（避免全量 VisitRecordIndex.build）
    if (hasCf) {
      var cfId = '';
      var cfRows = SheetHelper.rowsToObjects(SheetHelper.getSheet(CAREFORMS));
      for (var c = cfRows.length - 1; c >= 0; c--) {
        if (
          String(cfRows[c].case_id || '') === caseId &&
          VisitRecordIndex.ELIGIBLE[String(cfRows[c].status || '')]
        ) {
          cfId = String(cfRows[c].careform_id || '');
          break;
        }
      }
      if (cfId) {
        var cfResult = patchCareformRow_(cfId, fields, note, correctedBy);
        if (!cfResult.ok) return cfResult;
      }
    }

    // 有直 KEY 也同步 mark（人員／狀態）
    if (hasMark) {
      var mark = findActiveMarkForCase_(caseId);
      if (mark && mark.mark_id) {
        var markPatch = { mark_id: String(mark.mark_id) };
        if (Object.prototype.hasOwnProperty.call(fields, 'civil_worker_name')) {
          markPatch.civil_worker_name = String(fields.civil_worker_name || '');
          markPatch.civil_worker_id = '';
        }
        if (Object.prototype.hasOwnProperty.call(fields, 'social_worker_name')) {
          markPatch.social_worker_name = String(fields.social_worker_name || '');
          markPatch.social_worker_id = '';
        }
        if (Object.prototype.hasOwnProperty.call(fields, 'keyed_by_name')) {
          markPatch.keyed_by_name = String(fields.keyed_by_name || '');
          markPatch.keyed_by_id = '';
        }
        if (Object.prototype.hasOwnProperty.call(fields, 'outcome')) {
          var o = String(fields.outcome || '').trim();
          if (o === '住址不詳') o = '未遇';
          markPatch.outcome = o;
        }
        MohwProgressModule.patchMarks({
          patches: [markPatch],
          corrected_by: correctedBy,
          note: note,
        });
      }
    }

    // 無關懷表也無 mark：只改索引（衍生欄；下次重算可能被蓋）
    if (!hasCf && !hasMark) {
      syncIndexForCase_(caseId, fields);
    }

    return { ok: true, case_id: caseId };
  }

  function patchRows(data) {
    data = data || {};
    var source = String(data.source || '').trim();
    var patches = data.patches || [];
    if (!patches.length) error_('VALIDATION_ERROR', 'patches 不可為空');
    var note = String(data.note || data.correction_note || '').trim();
    var correctedBy = String(data.corrected_by || '').trim();

    var updated = [];
    var missing = [];

    for (var i = 0; i < patches.length; i++) {
      var p = patches[i] || {};
      var fields = {};
      if (Object.prototype.hasOwnProperty.call(p, 'civil_worker_name')) {
        fields.civil_worker_name = p.civil_worker_name;
      }
      if (Object.prototype.hasOwnProperty.call(p, 'social_worker_name')) {
        fields.social_worker_name = p.social_worker_name;
      }
      if (Object.prototype.hasOwnProperty.call(p, 'keyed_by_name')) {
        fields.keyed_by_name = p.keyed_by_name;
      }
      if (Object.prototype.hasOwnProperty.call(p, 'outcome')) {
        fields.outcome = p.outcome;
      }

      var result;
      if (source === 'careform') {
        var cfId = String(p.careform_id || p.row_id || '').trim();
        result = patchCareformRow_(cfId, fields, note, correctedBy);
        if (result.ok) updated.push(result);
        else missing.push({ row_id: cfId, reason: result.reason });
      } else if (source === 'index') {
        var rowId = String(p.row_id || '').trim();
        result = patchIndexRow_(rowId, fields, note, correctedBy);
        if (result.ok) updated.push(result);
        else missing.push({ row_id: rowId, reason: result.reason });
      } else {
        error_('VALIDATION_ERROR', 'source 需為 careform 或 index');
      }
    }

    try {
      ReadCache.bump();
    } catch (eBump) {}

    return {
      source: source,
      updated_count: updated.length,
      missing_count: missing.length,
      updated: updated,
      missing: missing,
      corrected_at: now_(),
    };
  }

  return {
    listCareforms: listCareforms,
    listIndex: listIndex,
    patchRows: patchRows,
  };
})();
