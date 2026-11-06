/**
 * 營運維護：清測試派案／關懷表等（保留個案名冊、里責任分配、訪查員）。
 */
var OpsModule = (function () {
  function countRows_(sheetName) {
    var sheet = SheetHelper.getSheet(sheetName);
    return Math.max(0, sheet.getLastRow() - 1);
  }

  /**
   * 稽核／修復：同訪查員「訪視未遇」M/D+時間戳不可重複。
   * @param {{
   *   apply?: boolean|string,
   *   dry_run?: boolean|string,
   *   limit?: number|string,
   *   offset?: number|string,
   *   skip_missed?: boolean|string
   * }} params
   *   預設 dry-run；傳 apply=true 才寫入。
   *   limit／offset：只寫入 fixes 切片（仍依全表占用計算，避免分身重撞）。
   */
  function repairDuplicateMissedStamps(params) {
    params = params || {};
    var apply =
      params.apply === true ||
      params.apply === 'true' ||
      String(params.apply || '').toUpperCase() === 'YES';
    if (params.dry_run === true || params.dry_run === 'true') apply = false;
    var limit = Number(params.limit);
    if (!isFinite(limit) || limit < 0) limit = 0;
    var offset = Number(params.offset);
    if (!isFinite(offset) || offset < 0) offset = 0;
    var skipMissed =
      params.skip_missed === true ||
      params.skip_missed === 'true';

    var names = Config.SHEET_NAMES;
    var careforms = SheetHelper.rowsToObjects(SheetHelper.getSheet(names.CAREFORMS));
    var assignments = SheetHelper.rowsToObjects(SheetHelper.getSheet(names.ASSIGNMENTS));
    var assignmentById = {};
    assignments.forEach(function (row) {
      assignmentById[String(row.assignment_id || '')] = row;
    });

    // visitor → stampKey → [{ careform, stamp, note, submitted_at }]
    var byVisitorStamp = {};
    var scannedWithStamps = 0;
    var entries = [];

    careforms.forEach(function (careform) {
      var assignment = assignmentById[String(careform.assignment_id || '')] || null;
      var team = MissedVisitStampHelper.teamVisitorIdsFromAssignment(
        assignment || { visitor_id: careform.visitor_id }
      );
      if (!team.length) {
        var fallback = String(careform.visitor_id || '').trim();
        if (fallback) team = [fallback];
      }
      if (!team.length) return;

      var answers = MissedVisitStampHelper.parseAnswersJson(careform.answers_json);
      var living = String(answers.living_address_other || '');
      var visitNotes = String(answers.visit_notes || '');
      var primaryNote = living.indexOf('訪視未遇') !== -1 ? living : visitNotes;
      if (primaryNote.indexOf('訪視未遇') === -1) return;

      var stamps = MissedVisitStampHelper.parseStamps(primaryNote);
      if (!stamps.length) return;
      scannedWithStamps += 1;

      var caseId = assignment ? String(assignment.case_id || '') : '';
      var submittedAt = String(careform.submitted_at || '');
      var record = {
        careform_id: String(careform.careform_id || ''),
        assignment_id: String(careform.assignment_id || ''),
        case_id: caseId,
        visitor_ids: team,
        note: primaryNote,
        living_address_other: living,
        visit_notes: visitNotes,
        submitted_at: submittedAt,
        stamps: stamps,
        careform: careform,
        answers: answers,
      };
      entries.push(record);

      team.forEach(function (visitorId) {
        stamps.forEach(function (stamp) {
          var mapKey = visitorId + '||' + stamp.key;
          if (!byVisitorStamp[mapKey]) byVisitorStamp[mapKey] = [];
          byVisitorStamp[mapKey].push({
            visitor_id: visitorId,
            stamp_key: stamp.key,
            careform_id: record.careform_id,
            case_id: caseId,
            note: primaryNote,
            submitted_at: submittedAt,
          });
        });
      });
    });

    var conflicts = [];
    Object.keys(byVisitorStamp).forEach(function (mapKey) {
      var group = byVisitorStamp[mapKey];
      if (!group || group.length < 2) return;
      // 同一 careform 重複解析略過
      var seenCf = {};
      var unique = [];
      group.forEach(function (item) {
        if (seenCf[item.careform_id]) return;
        seenCf[item.careform_id] = true;
        unique.push(item);
      });
      if (unique.length < 2) return;
      unique.sort(function (a, b) {
        return String(a.submitted_at).localeCompare(String(b.submitted_at));
      });
      conflicts.push({
        visitor_id: unique[0].visitor_id,
        stamp_key: unique[0].stamp_key,
        count: unique.length,
        keep_careform_id: unique[0].careform_id,
        rows: unique,
      });
    });

    // 依 visitor 重建占用：先保留最早 careform 的全部戳記，後到者 uniquify
    entries.sort(function (a, b) {
      return String(a.submitted_at).localeCompare(String(b.submitted_at));
    });

    var occupiedByVisitor = {};
    var fixes = [];
    var answersByCareformId = {};

    entries.forEach(function (entry) {
      var occupied = {};
      entry.visitor_ids.forEach(function (visitorId) {
        var bag = occupiedByVisitor[visitorId] || {};
        Object.keys(bag).forEach(function (k) {
          occupied[k] = true;
        });
      });

      var before = entry.note;
      var resolved = MissedVisitStampHelper.uniquifyNote(before, occupied);
      var after = resolved.note;

      // 登記占用（用解衝突後戳記）
      resolved.stamps.forEach(function (stamp) {
        entry.visitor_ids.forEach(function (visitorId) {
          if (!occupiedByVisitor[visitorId]) occupiedByVisitor[visitorId] = {};
          occupiedByVisitor[visitorId][stamp.key] = entry.careform_id;
        });
      });

      if (!resolved.changed) return;

      var nextAnswers = Object.assign({}, entry.answers);
      if (entry.living_address_other.indexOf('訪視未遇') !== -1) {
        nextAnswers.living_address_other = after;
      }
      if (entry.visit_notes) {
        if (entry.living_address_other && entry.visit_notes.indexOf(entry.living_address_other) !== -1) {
          nextAnswers.visit_notes = entry.visit_notes.split(entry.living_address_other).join(after);
        } else if (entry.visit_notes.indexOf('訪視未遇') !== -1) {
          var visitResolved = MissedVisitStampHelper.uniquifyNote(entry.visit_notes, occupied);
          nextAnswers.visit_notes = visitResolved.note;
        }
      }

      answersByCareformId[entry.careform_id] = nextAnswers;
      fixes.push({
        careform_id: entry.careform_id,
        assignment_id: entry.assignment_id,
        case_id: entry.case_id,
        visitor_ids: entry.visitor_ids,
        before: before,
        after: after,
        replacements: resolved.replacements,
      });
    });

    var totalFixes = fixes.length;
    var chunkFixes = fixes;
    if (limit > 0) {
      chunkFixes = fixes.slice(offset, offset + limit);
    } else if (offset > 0) {
      chunkFixes = fixes.slice(offset);
    }

    var written = 0;
    var missedUpdated = 0;
    var chunkIds = {};
    chunkFixes.forEach(function (fix) {
      chunkIds[fix.careform_id] = true;
    });

    if (apply && chunkFixes.length) {
      // 只改 answers_json 欄（單欄 setValues），避免整表重寫逾時
      var cfSheet = SheetHelper.getSheet(names.CAREFORMS);
      var cfData = cfSheet.getDataRange().getValues();
      var cfHeaders = cfData[0];
      var cfIdIdx = cfHeaders.indexOf('careform_id');
      var answersIdx = cfHeaders.indexOf('answers_json');
      if (cfIdIdx === -1 || answersIdx === -1) {
        var errCols = new Error('careforms missing careform_id/answers_json');
        errCols.code = 'SCHEMA';
        throw errCols;
      }
      var answersCol = [];
      for (var r = 1; r < cfData.length; r++) {
        var cid = String(cfData[r][cfIdIdx] || '').trim();
        if (cid && chunkIds[cid] && answersByCareformId[cid]) {
          answersCol.push([JSON.stringify(answersByCareformId[cid])]);
          written += 1;
        } else {
          answersCol.push([cfData[r][answersIdx]]);
        }
      }
      if (written > 0 && answersCol.length) {
        cfSheet.getRange(2, answersIdx + 1, answersCol.length, 1).setValues(answersCol);
      }

      if (!skipMissed) {
        try {
          var fixByAssignment = {};
          chunkFixes.forEach(function (fix) {
            fixByAssignment[String(fix.assignment_id || '')] = fix;
          });
          var missedSheet = SheetHelper.getSheet(names.MISSED);
          var missedData = missedSheet.getDataRange().getValues();
          if (missedData.length >= 2) {
            var mHeaders = missedData[0];
            var mAsgIdx = mHeaders.indexOf('assignment_id');
            var mNotesIdx = mHeaders.indexOf('notes');
            if (mAsgIdx !== -1 && mNotesIdx !== -1) {
              var notesCol = [];
              for (var mr = 1; mr < missedData.length; mr++) {
                var asgId = String(missedData[mr][mAsgIdx] || '').trim();
                var fix = fixByAssignment[asgId];
                var missedNotes = String(missedData[mr][mNotesIdx] || '');
                var nextMissed = missedNotes;
                if (fix && missedNotes.indexOf('訪視未遇') !== -1 && fix.before && missedNotes.indexOf(fix.before) !== -1) {
                  nextMissed = missedNotes.split(fix.before).join(fix.after);
                }
                if (nextMissed !== missedNotes) missedUpdated += 1;
                notesCol.push([nextMissed]);
              }
              if (missedUpdated > 0) {
                missedSheet.getRange(2, mNotesIdx + 1, notesCol.length, 1).setValues(notesCol);
              }
            }
          }
        } catch (eMissed) {}
      }

      ReadCache.bump();
    }

    var remainingAfterChunk = Math.max(0, totalFixes - (offset + chunkFixes.length));
    return {
      dry_run: !apply,
      scanned_careforms: careforms.length,
      missed_note_careforms: scannedWithStamps,
      conflict_groups: conflicts.length,
      conflicts: conflicts.slice(0, 50),
      fix_count: totalFixes,
      chunk_fix_count: chunkFixes.length,
      chunk_offset: offset,
      chunk_limit: limit || null,
      remaining_fixes: apply ? remainingAfterChunk : totalFixes,
      fixes: chunkFixes.slice(0, 80),
      applied: apply,
      written: written,
      missed_updated: missedUpdated,
    };
  }

  /**
   * 將個案訪視狀態還原為「待訪」（紙本 KEY 前清測試用）。
   */
  function resetCaseVisitStatusToPending_() {
    var sheet = SheetHelper.getSheet(Config.SHEET_NAMES.CASES);
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { scanned: 0, reset: 0 };
    var headers = data[0];
    var statusIdx = headers.indexOf('visit_status');
    var updatedIdx = headers.indexOf('updated_at');
    if (statusIdx === -1) return { scanned: 0, reset: 0, error: 'visit_status missing' };

    var reset = 0;
    var now = new Date().toISOString();
    for (var r = 1; r < data.length; r++) {
      var status = String(data[r][statusIdx] || '').trim();
      if (!status || status === '待訪') continue;
      data[r][statusIdx] = '待訪';
      if (updatedIdx !== -1) data[r][updatedIdx] = now;
      reset++;
    }
    if (reset > 0) {
      sheet.getRange(1, 1, data.length, headers.length).setValues(data);
    }
    return { scanned: data.length - 1, reset: reset };
  }

  /**
   * @param {{ confirm?: boolean|string }} data
   */
  function clearVisitTestData(data) {
    data = data || {};
    var ok =
      data.confirm === true ||
      data.confirm === 'true' ||
      String(data.confirm || '').toUpperCase() === 'YES';
    if (!ok) {
      var err = new Error('請傳 confirm=YES 才會清除測試派案／關懷表資料');
      err.code = 'VALIDATION';
      throw err;
    }

    var names = Config.SHEET_NAMES;
    var before = {
      assignments: countRows_(names.ASSIGNMENTS),
      careforms: countRows_(names.CAREFORMS),
      missed: countRows_(names.MISSED),
      audit: countRows_(names.AUDIT),
      high_care: countRows_(names.HIGH_CARE),
      payments: countRows_(names.PAYMENTS),
      cases: countRows_(names.CASES),
      village_admins: countRows_(names.VILLAGE_ADMINS),
      visitors: countRows_(names.VISITORS),
    };

    var deleted = {
      assignments: SheetHelper.clearDataRows(names.ASSIGNMENTS),
      careforms: SheetHelper.clearDataRows(names.CAREFORMS),
      missed: SheetHelper.clearDataRows(names.MISSED),
      audit: SheetHelper.clearDataRows(names.AUDIT),
      high_care: SheetHelper.clearDataRows(names.HIGH_CARE),
      payments: SheetHelper.clearDataRows(names.PAYMENTS),
    };

    var caseReset = resetCaseVisitStatusToPending_();
    ReadCache.bump();

    return {
      kept: {
        cases: before.cases,
        village_admins: before.village_admins,
        visitors: before.visitors,
      },
      before: before,
      deleted: deleted,
      case_visit_status_reset: caseReset,
      note: '已清空派案／關懷表／空訪／稽核／高關懷／車馬費；個案與里責任／訪查員保留。關懷表僅剩表頭，建檔時用系統預設值。',
    };
  }

  function hasVal_(v) {
    return String(v == null ? '' : v).trim() !== '';
  }

  /**
   * 匯出卡「已填社政／民政但缺身分證」：列出缺證號的訪查人與對應關懷表。
   */
  function findMissingWorkerNationalIds(data) {
    data = data || {};
    var onlyAudited = data.only_audited !== false && data.only_audited !== 'false';
    var index = VisitRecordIndex.build();
    var missing = [];
    var byName = {};

    (index.careforms || []).forEach(function (careform) {
      if (!careform) return;
      if (onlyAudited) {
        var audit = VisitRecordIndex.latestAudit(index, careform.careform_id);
        var pass = (audit && audit.decision === '通過') || String(careform.status) === '已稽核';
        if (!pass) return;
      }
      var answers = {};
      try {
        answers = MissedVisitStampHelper.parseAnswersJson(careform.answers_json) || {};
      } catch (e) {
        answers = {};
      }
      var caseRow = VisitRecordIndex.caseForCareform(index, careform) || {};
      var assignment = index.assignmentById[String(careform.assignment_id || '').trim()] || {};

      var hasSocial =
        hasVal_(answers.social_worker_role) ||
        hasVal_(answers.social_worker_name) ||
        hasVal_(answers.social_worker_national_id) ||
        hasVal_(answers.social_worker_phone);
      var hasCivil =
        hasVal_(answers.civil_worker_role) ||
        hasVal_(answers.civil_worker_name) ||
        hasVal_(answers.civil_worker_national_id) ||
        hasVal_(answers.civil_worker_phone);

      var socialMissing = hasSocial && !hasVal_(answers.social_worker_national_id);
      var civilMissing = hasCivil && !hasVal_(answers.civil_worker_national_id);
      if (!socialMissing && !civilMissing) return;

      var socialName = String(answers.social_worker_name || '').trim();
      var civilName = String(answers.civil_worker_name || '').trim();
      var row = {
        careform_id: careform.careform_id,
        case_id: caseRow.case_id || '',
        encoded_id: caseRow.encoded_id || careform.encoded_id || '',
        elder_name: caseRow.name || '',
        visit_village: caseRow.visit_village || '',
        careform_status: careform.status || '',
        assignment_id: careform.assignment_id || '',
        visitor_id: assignment.visitor_id || careform.visitor_id || '',
        social_worker_name: socialName,
        social_worker_role: String(answers.social_worker_role || '').trim(),
        social_worker_phone: String(answers.social_worker_phone || '').trim(),
        social_missing_national_id: socialMissing,
        civil_worker_name: civilName,
        civil_worker_role: String(answers.civil_worker_role || '').trim(),
        civil_worker_phone: String(answers.civil_worker_phone || '').trim(),
        civil_missing_national_id: civilMissing,
      };
      missing.push(row);

      if (socialMissing && socialName) {
        if (!byName[socialName]) {
          byName[socialName] = {
            name: socialName,
            side: '社政',
            role: row.social_worker_role,
            phone: row.social_worker_phone,
            careform_ids: [],
            case_ids: [],
            elder_names: [],
          };
        }
        byName[socialName].careform_ids.push(row.careform_id);
        byName[socialName].case_ids.push(row.case_id);
        byName[socialName].elder_names.push(row.elder_name);
        if (!byName[socialName].phone && row.social_worker_phone) {
          byName[socialName].phone = row.social_worker_phone;
        }
        if (!byName[socialName].role && row.social_worker_role) {
          byName[socialName].role = row.social_worker_role;
        }
      }
      if (civilMissing && civilName) {
        var civilKey = 'civil:' + civilName;
        if (!byName[civilKey]) {
          byName[civilKey] = {
            name: civilName,
            side: '民政',
            role: row.civil_worker_role,
            phone: row.civil_worker_phone,
            careform_ids: [],
            case_ids: [],
            elder_names: [],
          };
        }
        byName[civilKey].careform_ids.push(row.careform_id);
        byName[civilKey].case_ids.push(row.case_id);
        byName[civilKey].elder_names.push(row.elder_name);
      }
    });

    var people = Object.keys(byName).map(function (k) { return byName[k]; });
    people.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name), 'zh-Hant');
    });

    return {
      only_audited: onlyAudited,
      missing_row_count: missing.length,
      people_count: people.length,
      people: people,
      rows: missing.slice(0, 80),
    };
  }

  /**
   * 依社政／民政姓名補身分證字號（僅填空白，不覆蓋既有）。
   * data.patches: [{ name, national_id, side?: 'social'|'civil'|'both' }]
   */
  function patchWorkerNationalIdsByName(data) {
    data = data || {};
    var apply = data.apply === true || data.apply === 'true';
    var patches = data.patches || [];
    if (!patches.length) {
      var err = new Error('patches 不可為空');
      err.code = 'VALIDATION';
      throw err;
    }

    var byName = {};
    patches.forEach(function (p) {
      var name = String((p && p.name) || '').trim();
      var nid = String((p && p.national_id) || '').trim().toUpperCase();
      if (!name || !nid) return;
      byName[name] = {
        national_id: nid,
        side: String((p && p.side) || 'both').trim() || 'both',
      };
    });

    var index = VisitRecordIndex.build();
    var planned = [];
    var idToNewAnswers = {};

    (index.careforms || []).forEach(function (careform) {
      if (!careform || !careform.careform_id) return;
      var answers = {};
      try {
        answers = MissedVisitStampHelper.parseAnswersJson(careform.answers_json) || {};
      } catch (eParse) {
        answers = {};
      }
      var changed = false;
      var socialName = String(answers.social_worker_name || '').trim();
      var civilName = String(answers.civil_worker_name || '').trim();
      var socialPatch = socialName && byName[socialName] ? byName[socialName] : null;
      var civilPatch = civilName && byName[civilName] ? byName[civilName] : null;

      if (
        socialPatch &&
        (socialPatch.side === 'both' || socialPatch.side === 'social' || socialPatch.side === '社政') &&
        !hasVal_(answers.social_worker_national_id)
      ) {
        answers.social_worker_national_id = socialPatch.national_id;
        changed = true;
      }
      if (
        civilPatch &&
        (civilPatch.side === 'both' || civilPatch.side === 'civil' || civilPatch.side === '民政') &&
        !hasVal_(answers.civil_worker_national_id)
      ) {
        answers.civil_worker_national_id = civilPatch.national_id;
        changed = true;
      }
      if (!changed) return;

      var caseRow = VisitRecordIndex.caseForCareform(index, careform) || {};
      planned.push({
        careform_id: careform.careform_id,
        case_id: caseRow.case_id || '',
        elder_name: caseRow.name || '',
        social_worker_name: socialName,
        civil_worker_name: civilName,
        social_worker_national_id: answers.social_worker_national_id || '',
        civil_worker_national_id: answers.civil_worker_national_id || '',
      });
      idToNewAnswers[String(careform.careform_id)] = answers;
    });

    var written = 0;
    var visitorPatched = 0;
    if (apply && planned.length) {
      var cfSheet = SheetHelper.getSheet(Config.SHEET_NAMES.CAREFORMS);
      var cfValues = cfSheet.getDataRange().getValues();
      var cfHeaders = cfValues[0];
      var idIdx = cfHeaders.indexOf('careform_id');
      var answersIdx = cfHeaders.indexOf('answers_json');
      if (idIdx === -1 || answersIdx === -1) {
        var errCols = new Error('careforms missing careform_id/answers_json');
        errCols.code = 'CONFIG';
        throw errCols;
      }
      var col = [];
      for (var r = 1; r < cfValues.length; r++) {
        var cid = String(cfValues[r][idIdx] || '').trim();
        if (idToNewAnswers[cid]) {
          col.push([JSON.stringify(idToNewAnswers[cid])]);
          written++;
        } else {
          col.push([cfValues[r][answersIdx]]);
        }
      }
      if (written > 0) {
        cfSheet.getRange(2, answersIdx + 1, col.length, 1).setValues(col);
      }

      // 名冊空白證號一併補上（同名且證號空）
      try {
        var vSheet = SheetHelper.getSheet(Config.SHEET_NAMES.VISITORS);
        var vValues = vSheet.getDataRange().getValues();
        var vHeaders = vValues[0];
        var vNameIdx = vHeaders.indexOf('name');
        var vNidIdx = vHeaders.indexOf('national_id');
        if (vNidIdx === -1) vNidIdx = vHeaders.indexOf('id_number');
        if (vNameIdx !== -1 && vNidIdx !== -1) {
          var vChanged = false;
          for (var vr = 1; vr < vValues.length; vr++) {
            var vName = String(vValues[vr][vNameIdx] || '').trim();
            var patch = byName[vName];
            if (!patch) continue;
            if (hasVal_(vValues[vr][vNidIdx])) continue;
            vValues[vr][vNidIdx] = patch.national_id;
            visitorPatched++;
            vChanged = true;
          }
          if (vChanged) {
            vSheet.getRange(1, 1, vValues.length, vHeaders.length).setValues(vValues);
          }
        }
      } catch (eVis) {}

      try {
        ReadCache.bump();
      } catch (eBump) {}
    }

    return {
      dry_run: !apply,
      planned_count: planned.length,
      written: written,
      visitor_patched: visitorPatched,
      applied: apply,
      rows: planned.slice(0, 40),
    };
  }

  /**
   * 稽核關懷表上某訪查人姓名的身分證／電話是否與預期一致。
   * data: { name, national_id?, phone?, only_audited? }
   */
  function auditWorkerIdentityByName(data) {
    data = data || {};
    var name = String(data.name || '').trim();
    if (!name) {
      var err = new Error('name 必填');
      err.code = 'VALIDATION';
      throw err;
    }
    var expectNid = String(data.national_id || '').trim().toUpperCase();
    var expectPhoneDigits = String(data.phone || '').replace(/\D/g, '');
    if (expectPhoneDigits.length === 9 && expectPhoneDigits.charAt(0) === '9') {
      expectPhoneDigits = '0' + expectPhoneDigits;
    }
    var onlyAudited = data.only_audited !== false && data.only_audited !== 'false';
    var index = VisitRecordIndex.build();
    var rows = [];
    var okCount = 0;
    var issueCount = 0;

    function phoneDigits_(v) {
      var d = String(v || '').replace(/\D/g, '');
      if (d.length === 9 && d.charAt(0) === '9') d = '0' + d;
      return d;
    }

    (index.careforms || []).forEach(function (careform) {
      if (!careform) return;
      if (onlyAudited) {
        var audit = VisitRecordIndex.latestAudit(index, careform.careform_id);
        var pass = (audit && audit.decision === '通過') || String(careform.status) === '已稽核';
        if (!pass) return;
      }
      var answers = {};
      try {
        answers = MissedVisitStampHelper.parseAnswersJson(careform.answers_json) || {};
      } catch (e) {
        answers = {};
      }
      var sides = [];
      if (String(answers.social_worker_name || '').trim() === name) sides.push('社政');
      if (String(answers.civil_worker_name || '').trim() === name) sides.push('民政');
      if (!sides.length) return;

      var caseRow = VisitRecordIndex.caseForCareform(index, careform) || {};
      sides.forEach(function (side) {
        var nid =
          side === '社政'
            ? String(answers.social_worker_national_id || '').trim().toUpperCase()
            : String(answers.civil_worker_national_id || '').trim().toUpperCase();
        var phone =
          side === '社政'
            ? String(answers.social_worker_phone || '').trim()
            : String(answers.civil_worker_phone || '').trim();
        var role =
          side === '社政'
            ? String(answers.social_worker_role || '').trim()
            : String(answers.civil_worker_role || '').trim();
        var issues = [];
        if (expectNid) {
          if (!nid) issues.push('缺身分證');
          else if (nid !== expectNid) issues.push('身分證不符:' + nid);
        } else if (!nid) {
          issues.push('缺身分證');
        }
        if (expectPhoneDigits) {
          var got = phoneDigits_(phone);
          if (!got) issues.push('缺電話');
          else if (got !== expectPhoneDigits) issues.push('電話不符:' + phone);
        }
        var row = {
          careform_id: careform.careform_id,
          case_id: caseRow.case_id || '',
          encoded_id: caseRow.encoded_id || '',
          elder_name: caseRow.name || '',
          visit_village: caseRow.visit_village || '',
          careform_status: careform.status || '',
          side: side,
          role: role,
          national_id: nid,
          phone: phone,
          ok: issues.length === 0,
          issues: issues,
        };
        rows.push(row);
        if (row.ok) okCount++;
        else issueCount++;
      });
    });

    return {
      name: name,
      expected_national_id: expectNid || null,
      expected_phone: expectPhoneDigits || null,
      only_audited: onlyAudited,
      total: rows.length,
      ok_count: okCount,
      issue_count: issueCount,
      rows: rows,
    };
  }

  function phoneDigits_(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length === 9 && d.charAt(0) === '9') d = '0' + d;
    return d;
  }

  function hammingOrNearPhone_(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      if (a.charAt(i) !== b.charAt(i)) diff++;
      if (diff > 1) return false;
    }
    return diff === 1;
  }

  /**
   * 標準自主稽核：關懷表訪查人證號／電話 vs 訪員名冊（同名）。
   * 找出缺填、與名冊不符、疑似電話少打／錯一碼。
   */
  function auditAllWorkerIdentities(data) {
    data = data || {};
    var onlyAudited = data.only_audited !== false && data.only_audited !== 'false';
    var index = VisitRecordIndex.build();

    var rosterByName = {};
    (index.visitors || []).forEach(function (v) {
      var name = String((v && v.name) || '').trim();
      if (!name) return;
      var row = {
        visitor_id: v.visitor_id || '',
        name: name,
        national_id: String(v.national_id || v.id_number || '').trim().toUpperCase(),
        phone: phoneDigits_(v.phone || v.mobile || ''),
      };
      var prev = rosterByName[name];
      if (!prev) {
        rosterByName[name] = row;
        return;
      }
      if (!prev.national_id && row.national_id) rosterByName[name] = row;
      else {
        if (!prev.phone && row.phone) prev.phone = row.phone;
        if (prev.national_id && row.national_id && prev.national_id !== row.national_id) {
          prev.roster_id_conflict = true;
        }
      }
    });

    // VisitRecordIndex 若無 visitors，改讀表
    if (!Object.keys(rosterByName).length) {
      try {
        var vSheet = SheetHelper.getSheet(Config.SHEET_NAMES.VISITORS);
        var vValues = vSheet.getDataRange().getValues();
        var vHeaders = vValues[0];
        var nameIdx = vHeaders.indexOf('name');
        var idIdx = vHeaders.indexOf('national_id');
        if (idIdx === -1) idIdx = vHeaders.indexOf('id_number');
        var phoneIdx = vHeaders.indexOf('phone');
        if (phoneIdx === -1) phoneIdx = vHeaders.indexOf('mobile');
        var vidIdx = vHeaders.indexOf('visitor_id');
        for (var vr = 1; vr < vValues.length; vr++) {
          var nm = String(vValues[vr][nameIdx] || '').trim();
          if (!nm) continue;
          var row2 = {
            visitor_id: vidIdx === -1 ? '' : String(vValues[vr][vidIdx] || ''),
            name: nm,
            national_id: idIdx === -1 ? '' : String(vValues[vr][idIdx] || '').trim().toUpperCase(),
            phone: phoneIdx === -1 ? '' : phoneDigits_(vValues[vr][phoneIdx]),
          };
          var prev2 = rosterByName[nm];
          if (!prev2) rosterByName[nm] = row2;
          else if (!prev2.national_id && row2.national_id) rosterByName[nm] = row2;
          else if (!prev2.phone && row2.phone) prev2.phone = row2.phone;
        }
      } catch (eVis) {}
    }

    var issues = [];
    var fillSides = 0;
    var scanned = 0;
    var byType = {
      missing_national_id: 0,
      missing_phone: 0,
      national_id_mismatch_roster: 0,
      phone_mismatch_roster: 0,
      phone_near_miss_roster: 0,
      roster_missing_national_id: 0,
      name_not_in_roster: 0,
    };
    var peopleMap = {};

    function pushIssue_(row) {
      issues.push(row);
      byType[row.issue_type] = (byType[row.issue_type] || 0) + 1;
      var key = row.worker_name + '|' + row.issue_type;
      if (!peopleMap[key]) {
        peopleMap[key] = {
          worker_name: row.worker_name,
          issue_type: row.issue_type,
          roster_national_id: row.roster_national_id || '',
          roster_phone: row.roster_phone || '',
          count: 0,
          sample_careform_ids: [],
          sample_elders: [],
        };
      }
      peopleMap[key].count++;
      if (peopleMap[key].sample_careform_ids.length < 5) {
        peopleMap[key].sample_careform_ids.push(row.careform_id);
        peopleMap[key].sample_elders.push(row.elder_name || '');
      }
    }

    (index.careforms || []).forEach(function (careform) {
      if (!careform) return;
      scanned++;
      if (onlyAudited) {
        var audit = VisitRecordIndex.latestAudit(index, careform.careform_id);
        var pass = (audit && audit.decision === '通過') || String(careform.status) === '已稽核';
        if (!pass) return;
      }
      var answers = {};
      try {
        answers = MissedVisitStampHelper.parseAnswersJson(careform.answers_json) || {};
      } catch (e) {
        answers = {};
      }
      var caseRow = VisitRecordIndex.caseForCareform(index, careform) || {};
      var sides = [
        {
          side: '社政',
          name: String(answers.social_worker_name || '').trim(),
          national_id: String(answers.social_worker_national_id || '').trim().toUpperCase(),
          phone: phoneDigits_(answers.social_worker_phone),
          started:
            hasVal_(answers.social_worker_role) ||
            hasVal_(answers.social_worker_name) ||
            hasVal_(answers.social_worker_national_id) ||
            hasVal_(answers.social_worker_phone),
        },
        {
          side: '民政',
          name: String(answers.civil_worker_name || '').trim(),
          national_id: String(answers.civil_worker_national_id || '').trim().toUpperCase(),
          phone: phoneDigits_(answers.civil_worker_phone),
          started:
            hasVal_(answers.civil_worker_role) ||
            hasVal_(answers.civil_worker_name) ||
            hasVal_(answers.civil_worker_national_id) ||
            hasVal_(answers.civil_worker_phone),
        },
      ];

      sides.forEach(function (s) {
        if (!s.started || !s.name) return;
        fillSides++;
        var roster = rosterByName[s.name] || null;
        var base = {
          careform_id: careform.careform_id,
          case_id: caseRow.case_id || '',
          encoded_id: caseRow.encoded_id || '',
          elder_name: caseRow.name || '',
          visit_village: caseRow.visit_village || '',
          careform_status: careform.status || '',
          side: s.side,
          worker_name: s.name,
          form_national_id: s.national_id,
          form_phone: s.phone,
          roster_national_id: roster ? roster.national_id : '',
          roster_phone: roster ? roster.phone : '',
          roster_visitor_id: roster ? roster.visitor_id : '',
        };

        if (!s.national_id) {
          pushIssue_(Object.assign({}, base, { issue_type: 'missing_national_id' }));
        } else if (roster && roster.national_id && s.national_id !== roster.national_id) {
          pushIssue_(Object.assign({}, base, { issue_type: 'national_id_mismatch_roster' }));
        } else if (roster && !roster.national_id) {
          pushIssue_(Object.assign({}, base, { issue_type: 'roster_missing_national_id' }));
        }

        if (!s.phone) {
          pushIssue_(Object.assign({}, base, { issue_type: 'missing_phone' }));
        } else if (roster && roster.phone && s.phone !== roster.phone) {
          if (hammingOrNearPhone_(s.phone, roster.phone)) {
            pushIssue_(Object.assign({}, base, { issue_type: 'phone_near_miss_roster' }));
          } else {
            pushIssue_(Object.assign({}, base, { issue_type: 'phone_mismatch_roster' }));
          }
        }

        if (!roster) {
          pushIssue_(Object.assign({}, base, { issue_type: 'name_not_in_roster' }));
        }
      });
    });

    var people = Object.keys(peopleMap).map(function (k) { return peopleMap[k]; });
    people.sort(function (a, b) {
      return b.count - a.count || String(a.worker_name).localeCompare(String(b.worker_name), 'zh-Hant');
    });

    return {
      only_audited: onlyAudited,
      roster_names: Object.keys(rosterByName).length,
      scanned_careforms: scanned,
      fill_sides: fillSides,
      issue_count: issues.length,
      by_type: byType,
      people_with_issues: people.slice(0, 80),
      issues: issues.slice(0, 200),
    };
  }

  /**
   * 依 careform_id 覆寫社政／民政電話（僅指定欄）。
   * data.patches: [{ careform_id, side: 'social'|'civil', phone }]
   */
  function patchWorkerPhoneByCareformIds(data) {
    data = data || {};
    var apply = data.apply === true || data.apply === 'true';
    var patches = data.patches || [];
    if (!patches.length) {
      var err = new Error('patches 不可為空');
      err.code = 'VALIDATION';
      throw err;
    }
    var byId = {};
    patches.forEach(function (p) {
      var id = String((p && p.careform_id) || '').trim();
      var phone = String((p && p.phone) || '').trim();
      var side = String((p && p.side) || 'civil').trim();
      if (!id || !phone) return;
      byId[id] = { phone: phone, side: side };
    });

    var cfSheet = SheetHelper.getSheet(Config.SHEET_NAMES.CAREFORMS);
    var cfValues = cfSheet.getDataRange().getValues();
    var cfHeaders = cfValues[0];
    var idIdx = cfHeaders.indexOf('careform_id');
    var answersIdx = cfHeaders.indexOf('answers_json');
    if (idIdx === -1 || answersIdx === -1) {
      var errCols = new Error('careforms missing careform_id/answers_json');
      errCols.code = 'CONFIG';
      throw errCols;
    }

    var planned = [];
    var col = [];
    var written = 0;
    for (var r = 1; r < cfValues.length; r++) {
      var cid = String(cfValues[r][idIdx] || '').trim();
      var patch = byId[cid];
      if (!patch) {
        col.push([cfValues[r][answersIdx]]);
        continue;
      }
      var answers = {};
      try {
        answers = MissedVisitStampHelper.parseAnswersJson(cfValues[r][answersIdx]) || {};
      } catch (e) {
        answers = {};
      }
      var before =
        patch.side === 'social' || patch.side === '社政'
          ? String(answers.social_worker_phone || '')
          : String(answers.civil_worker_phone || '');
      if (patch.side === 'social' || patch.side === '社政') {
        answers.social_worker_phone = patch.phone;
      } else {
        answers.civil_worker_phone = patch.phone;
      }
      planned.push({
        careform_id: cid,
        side: patch.side,
        before: before,
        after: patch.phone,
      });
      if (apply) {
        col.push([JSON.stringify(answers)]);
        written++;
      } else {
        col.push([cfValues[r][answersIdx]]);
      }
    }

    if (apply && written > 0) {
      cfSheet.getRange(2, answersIdx + 1, col.length, 1).setValues(col);
      try {
        ReadCache.bump();
      } catch (eBump) {}
    }

    return {
      dry_run: !apply,
      planned_count: planned.length,
      written: written,
      applied: apply,
      rows: planned,
    };
  }

  /**
   * 依 careform_id 合併覆寫 answers_json 欄位（營運修資料用）。
   * data.patches: [{ careform_id, answers: { ...partial }, visit_result?, visit_date? }]
   * visit_date 寫入 answers.visit_date；visit_result 寫入列欄（若有）。
   * data.apply: true 才寫入
   */
  function patchCareformAnswers(data) {
    data = data || {};
    var apply = data.apply === true || data.apply === 'true';
    var patches = data.patches || [];
    if (!patches.length) {
      var err = new Error('patches 不可為空');
      err.code = 'VALIDATION';
      throw err;
    }

    var byId = {};
    patches.forEach(function (p) {
      var id = String((p && p.careform_id) || '').trim();
      if (!id) return;
      byId[id] = {
        answers: (p && p.answers && typeof p.answers === 'object') ? p.answers : {},
        visit_result:
          p && p.visit_result != null && String(p.visit_result).trim() !== ''
            ? String(p.visit_result).trim()
            : null,
      };
    });

    var ids = Object.keys(byId);
    if (!ids.length) {
      var errIds = new Error('patches 缺少有效 careform_id');
      errIds.code = 'VALIDATION';
      throw errIds;
    }

    var cfSheet = SheetHelper.getSheet(Config.SHEET_NAMES.CAREFORMS);
    var cfValues = cfSheet.getDataRange().getValues();
    var cfHeaders = cfValues[0];
    var idIdx = cfHeaders.indexOf('careform_id');
    var answersIdx = cfHeaders.indexOf('answers_json');
    var resultIdx = cfHeaders.indexOf('visit_result');
    if (idIdx === -1 || answersIdx === -1) {
      var errCols = new Error('careforms missing careform_id/answers_json');
      errCols.code = 'SCHEMA';
      throw errCols;
    }

    var planned = [];
    var answersCol = [];
    var resultCol = resultIdx !== -1 ? [] : null;
    var written = 0;
    var found = {};

    for (var r = 1; r < cfValues.length; r++) {
      var cid = String(cfValues[r][idIdx] || '').trim();
      var patch = byId[cid];
      if (!patch) {
        answersCol.push([cfValues[r][answersIdx]]);
        if (resultCol) resultCol.push([cfValues[r][resultIdx]]);
        continue;
      }
      found[cid] = true;
      var answers = {};
      try {
        answers = MissedVisitStampHelper.parseAnswersJson(cfValues[r][answersIdx]) || {};
      } catch (eParse) {
        answers = {};
      }
      var beforeLiving = String(answers.living_address_other || '');
      var beforeNotes = String(answers.visit_notes || '');
      var beforeVisitDate = String(answers.visit_date || '');
      var beforeResult = resultIdx !== -1 ? String(cfValues[r][resultIdx] || '') : '';

      Object.keys(patch.answers).forEach(function (key) {
        answers[key] = patch.answers[key];
      });

      var nextResult = beforeResult;
      if (patch.visit_result != null) nextResult = patch.visit_result;

      planned.push({
        careform_id: cid,
        before: {
          living_address_other: beforeLiving,
          visit_notes: beforeNotes,
          visit_date: beforeVisitDate,
          visit_result: beforeResult,
        },
        after: {
          living_address_other: String(answers.living_address_other || ''),
          visit_notes: String(answers.visit_notes || ''),
          visit_date: String(answers.visit_date || ''),
          visit_result: nextResult,
        },
      });

      if (apply) {
        answersCol.push([JSON.stringify(answers)]);
        if (resultCol) resultCol.push([nextResult]);
        written += 1;
      } else {
        answersCol.push([cfValues[r][answersIdx]]);
        if (resultCol) resultCol.push([cfValues[r][resultIdx]]);
      }
    }

    if (apply && written > 0) {
      cfSheet.getRange(2, answersIdx + 1, answersCol.length, 1).setValues(answersCol);
      if (resultCol && resultIdx !== -1) {
        cfSheet.getRange(2, resultIdx + 1, resultCol.length, 1).setValues(resultCol);
      }
      try {
        ReadCache.bump();
      } catch (eBump) {}
    }

    return {
      dry_run: !apply,
      requested: ids.length,
      found: Object.keys(found).length,
      missing: ids.filter(function (id) {
        return !found[id];
      }),
      written: written,
      applied: apply,
      rows: planned,
    };
  }

  function extractTaiwanIdOps_(raw) {
    var normalized = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    var match = normalized.match(/[A-Z][0-9]{9}/);
    return match ? match[0] : normalized;
  }

  /**
   * 社政志工名冊批次匯入（Excel 去重後）。
   * data.people: [{ name, id_number, phone, email?, gender?, notes? }]
   * data.apply: true 才寫入
   */
  function importSocialVolunteers(data) {
    data = data || {};
    var apply = data.apply === true || data.apply === 'true';
    var people = data.people || [];
    if (!people.length) {
      var err = new Error('people 不可為空');
      err.code = 'VALIDATION';
      throw err;
    }

    SheetHelper.ensureColumns(Config.SHEET_NAMES.VISITORS, [
      'volunteer_group',
      'job_title',
      'gender',
      'department',
      'notes',
    ]);

    var sheet = SheetHelper.getSheet(Config.SHEET_NAMES.VISITORS);
    var existing = SheetHelper.rowsToObjects(sheet);
    var byId = {};
    var emptyIdByName = {};
    existing.forEach(function (row) {
      var id = extractTaiwanIdOps_(row.id_number);
      if (id) byId[id] = row;
      else {
        var nm = String(row.name || '').trim();
        if (nm && !emptyIdByName[nm]) emptyIdByName[nm] = row;
      }
    });

    var toCreate = [];
    var toUpdate = [];
    var skipped = [];
    var now = new Date().toISOString();

    people.forEach(function (raw) {
      var name = String((raw && raw.name) || '').trim();
      var idNumber = extractTaiwanIdOps_(raw && raw.id_number);
      var phone = String((raw && raw.phone) || '').trim();
      if (!name || !idNumber || !phone) {
        skipped.push({ name: name, id_number: idNumber, reason: '缺姓名／證號／電話' });
        return;
      }
      if (!Validation.validateTaiwanId(idNumber)) {
        skipped.push({ name: name, id_number: idNumber, reason: '身分證格式不正確' });
        return;
      }
      var email = String((raw && raw.email) || '').trim().toLowerCase();
      var gender = String((raw && raw.gender) || '').trim();
      var notes = String((raw && raw.notes) || '').trim();
      var payload = {
        name: name,
        id_number: idNumber,
        phone: phone,
        email: email,
        gender: gender,
        volunteer_group: 'social_affairs',
        job_title: '志工',
        department: '志工',
        status: '已核准',
        notes: notes,
        updated_at: now,
      };

      var hit = byId[idNumber];
      if (!hit && emptyIdByName[name]) {
        hit = emptyIdByName[name];
      }
      // 既有民政訪查員（visitor_id 含 CIV）不覆寫成社政志工
      if (hit && hit.visitor_id && String(hit.visitor_id).indexOf('-CIV-') !== -1) {
        skipped.push({
          name: name,
          id_number: idNumber,
          reason: '既有民政訪查員（' + hit.visitor_id + '），略過不改',
          visitor_id: hit.visitor_id,
        });
        return;
      }
      if (hit && String(hit.volunteer_group || '') === 'civil_affairs') {
        skipped.push({
          name: name,
          id_number: idNumber,
          reason: '既有 volunteer_group=civil_affairs，略過不改',
          visitor_id: hit.visitor_id || '',
        });
        return;
      }
      if (hit && hit.visitor_id) {
        toUpdate.push({
          visitor_id: hit.visitor_id,
          before_phone: hit.phone || '',
          before_id: hit.id_number || '',
          patch: payload,
        });
      } else {
        payload.visitor_id =
          'EV-115-YH-SOC-' + String(Utilities.getUuid()).replace(/-/g, '').slice(0, 8).toUpperCase();
        payload.registered_at = now;
        payload.approved_at = now;
        payload.badge_no = 'BADGE-' + payload.visitor_id;
        toCreate.push(payload);
        // 避免同批重複證號
        byId[idNumber] = payload;
      }
    });

    var updated = 0;
    var created = 0;
    if (apply) {
      toUpdate.forEach(function (item) {
        SheetHelper.updateByKey(Config.SHEET_NAMES.VISITORS, 'visitor_id', item.visitor_id, item.patch);
        updated++;
      });
      if (toCreate.length) {
        SheetHelper.appendRows(Config.SHEET_NAMES.VISITORS, toCreate);
        created = toCreate.length;
      }
      try {
        ReadCache.bump();
      } catch (eBump) {}
    }

    return {
      dry_run: !apply,
      planned_update: toUpdate.length,
      planned_create: toCreate.length,
      skipped: skipped.length,
      updated: updated,
      created: created,
      applied: apply,
      update_sample: toUpdate.slice(0, 15).map(function (u) {
        return {
          visitor_id: u.visitor_id,
          name: u.patch.name,
          id_number: u.patch.id_number,
          phone: u.patch.phone,
          before_phone: u.before_phone,
          before_id: u.before_id,
        };
      }),
      create_sample: toCreate.slice(0, 15).map(function (c) {
        return {
          visitor_id: c.visitor_id,
          name: c.name,
          id_number: c.id_number,
          phone: c.phone,
        };
      }),
      skipped_rows: skipped.slice(0, 30),
    };
  }

  /**
   * 刪除指定關懷表＋其稽核列（重複 KEY 清第1筆用）。
   * data.careform_ids: string[]
   * data.apply: true 才刪
   */
  function deleteCareformsByIds(data) {
    data = data || {};
    var apply = data.apply === true || data.apply === 'true';
    var ids = [];
    var seen = {};
    (data.careform_ids || []).forEach(function (id) {
      var key = String(id || '').trim();
      if (!key || seen[key]) return;
      seen[key] = true;
      ids.push(key);
    });
    if (!ids.length) {
      var err = new Error('careform_ids 不可為空');
      err.code = 'VALIDATION';
      throw err;
    }

    var careforms = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.CAREFORMS)
    );
    var audits = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.AUDIT)
    );
    var byCf = {};
    careforms.forEach(function (row) {
      byCf[String(row.careform_id || '').trim()] = row;
    });
    var auditsByCf = {};
    audits.forEach(function (row) {
      var cf = String(row.careform_id || '').trim();
      if (!auditsByCf[cf]) auditsByCf[cf] = [];
      auditsByCf[cf].push(row);
    });

    var planned = ids.map(function (id) {
      var cf = byCf[id] || null;
      var auds = auditsByCf[id] || [];
      return {
        careform_id: id,
        found: Boolean(cf),
        assignment_id: cf ? String(cf.assignment_id || '') : '',
        encoded_id: cf ? String(cf.encoded_id || '') : '',
        visit_result: cf ? String(cf.visit_result || '') : '',
        status: cf ? String(cf.status || '') : '',
        submitted_at: cf ? String(cf.submitted_at || '') : '',
        audit_ids: auds.map(function (a) {
          return String(a.audit_id || '');
        }),
        audit_count: auds.length,
      };
    });

    var deletedCareforms = 0;
    var deletedAudits = 0;
    var annotatedAssignments = 0;
    if (apply) {
      planned.forEach(function (item) {
        if (!item.found) return;
        deletedAudits += SheetHelper.deleteByKey(
          Config.SHEET_NAMES.AUDIT,
          'careform_id',
          item.careform_id
        );
        deletedCareforms += SheetHelper.deleteByKey(
          Config.SHEET_NAMES.CAREFORMS,
          'careform_id',
          item.careform_id
        );
        if (item.assignment_id) {
          try {
            var asg = AssignmentModule.get(item.assignment_id);
            var oldNotes = String((asg && asg.notes) || '');
            var marker = '重複KEY第1筆已刪:' + item.careform_id;
            if (oldNotes.indexOf(marker) === -1) {
              SheetHelper.updateByKey(
                Config.SHEET_NAMES.ASSIGNMENTS,
                'assignment_id',
                item.assignment_id,
                {
                  notes: (oldNotes ? oldNotes + '｜' : '') + marker,
                  updated_at: new Date().toISOString(),
                }
              );
              annotatedAssignments += 1;
            }
          } catch (eAsg) {}
        }
      });
      try {
        ReadCache.bump();
      } catch (eBump) {}
    }

    return {
      dry_run: !apply,
      planned: planned.length,
      found: planned.filter(function (p) {
        return p.found;
      }).length,
      missing: planned
        .filter(function (p) {
          return !p.found;
        })
        .map(function (p) {
          return p.careform_id;
        }),
      deleted_careforms: deletedCareforms,
      deleted_audits: deletedAudits,
      annotated_assignments: annotatedAssignments,
      applied: apply,
      items: planned,
    };
  }

  /**
   * 臨時掃描：同個案＋訪查日期＋訪查開始時間是否在系統內互撞
   * （對齊中央匯入錯誤「該個案於相同訪查日期與時間已有生活關懷表紀錄」）。
   *
   * data.statuses?: string[] 預設 ['已提交','已稽核']
   * data.case_key?: 'national_id' | 'encoded_id' | 'both'（預設 both：身分證優先，否則 encoded_id）
   * data.sample_limit?: number 預設 10
   * data.include_same_date_diff_time?: boolean 預設 true
   */
  function scanDuplicateVisitKeys(data) {
    data = data || {};
    var statusFilter = {};
    var statusList = data.statuses && data.statuses.length
      ? data.statuses
      : ['已提交', '已稽核'];
    statusList.forEach(function (s) {
      statusFilter[String(s)] = true;
    });
    var caseKeyMode = String(data.case_key || 'both').trim() || 'both';
    var sampleLimit = Number(data.sample_limit);
    if (!Number.isFinite(sampleLimit) || sampleLimit <= 0) sampleLimit = 10;
    if (sampleLimit > 30) sampleLimit = 30;
    var includeSameDate =
      data.include_same_date_diff_time !== false &&
      data.include_same_date_diff_time !== 'false';

    function parseAnswers_(raw) {
      if (!raw) return {};
      if (typeof raw === 'object') return raw;
      try {
        return JSON.parse(String(raw));
      } catch (e) {
        return {};
      }
    }

    function normDate_(v) {
      return String(v || '')
        .trim()
        .replace(/-/g, '/')
        .replace(/\s+/g, '');
    }

    function normTime_(v) {
      var t = String(v || '').trim();
      if (!t) return '';
      // Excel serial / Date objects may stringify oddly; keep HH:mm if present
      var m = t.match(/(\d{1,2}):(\d{2})/);
      if (m) {
        return ('0' + m[1]).slice(-2) + ':' + m[2];
      }
      return t;
    }

    function normId_(v) {
      return String(v || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '');
    }

    var careforms = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.CAREFORMS)
    );
    var assignments = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.ASSIGNMENTS)
    );
    var asgById = {};
    assignments.forEach(function (row) {
      asgById[String(row.assignment_id || '').trim()] = row;
    });

    var statusCountsAll = {};
    var statusCountsScoped = {};
    var rows = [];
    var missingDate = 0;
    var missingTime = 0;
    var missingCaseKey = 0;

    careforms.forEach(function (cf) {
      var st = String(cf.status || '').trim() || '(空白)';
      statusCountsAll[st] = (statusCountsAll[st] || 0) + 1;
      if (!statusFilter[st]) return;
      statusCountsScoped[st] = (statusCountsScoped[st] || 0) + 1;

      var answers = parseAnswers_(cf.answers_json);
      var visitDate = normDate_(answers.visit_date);
      var start = normTime_(answers.visit_start_time || answers.visit_time_start);
      var end = normTime_(answers.visit_end_time || answers.visit_time_end);
      var nationalId = normId_(
        answers.national_id || answers.id_number || answers.elder_national_id
      );
      var encodedId = String(cf.encoded_id || '').trim();
      var asg = asgById[String(cf.assignment_id || '').trim()] || {};
      var caseId = String(asg.case_id || '').trim();

      var caseKey = '';
      if (caseKeyMode === 'encoded_id') {
        caseKey = encodedId;
      } else if (caseKeyMode === 'national_id') {
        caseKey = nationalId;
      } else {
        caseKey = nationalId || encodedId;
      }

      if (!visitDate) missingDate += 1;
      if (!start) missingTime += 1;
      if (!caseKey) missingCaseKey += 1;

      rows.push({
        careform_id: String(cf.careform_id || ''),
        assignment_id: String(cf.assignment_id || ''),
        case_id: caseId,
        encoded_id: encodedId,
        national_id: nationalId,
        case_key: caseKey,
        case_key_source: nationalId
          ? 'national_id'
          : encodedId
            ? 'encoded_id'
            : 'none',
        status: st,
        visit_result: String(cf.visit_result || ''),
        visit_status: String(answers.visit_status || ''),
        visit_date: visitDate,
        visit_start_time: start,
        visit_end_time: end,
        name: String(answers.name || ''),
        submitted_at: String(cf.submitted_at || ''),
      });
    });

    function groupDupes_(keyFn) {
      var buckets = {};
      rows.forEach(function (row) {
        var key = keyFn(row);
        if (!key) return;
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(row);
      });
      var groups = [];
      var formCount = 0;
      var caseSet = {};
      Object.keys(buckets).forEach(function (key) {
        var items = buckets[key];
        if (items.length < 2) return;
        formCount += items.length;
        items.forEach(function (it) {
          if (it.case_key) caseSet[it.case_key] = true;
        });
        groups.push({
          key: key,
          count: items.length,
          case_key: items[0].case_key,
          encoded_id: items[0].encoded_id,
          national_id: items[0].national_id,
          name: items[0].name,
          visit_date: items[0].visit_date,
          visit_start_time: items[0].visit_start_time,
          visit_end_time: items[0].visit_end_time,
          careform_ids: items.map(function (it) {
            return it.careform_id;
          }),
          statuses: items.map(function (it) {
            return it.status;
          }),
          visit_results: items.map(function (it) {
            return it.visit_result;
          }),
        });
      });
      groups.sort(function (a, b) {
        return b.count - a.count;
      });
      return {
        duplicate_groups: groups.length,
        duplicate_forms: formCount,
        affected_cases: Object.keys(caseSet).length,
        sample: groups.slice(0, sampleLimit),
      };
    }

    // 主鍵：個案 + 訪查日期 + 開始時間（中央錯誤文案）
    var exactStart = groupDupes_(function (row) {
      if (!row.case_key || !row.visit_date || !row.visit_start_time) return '';
      return row.case_key + '|' + row.visit_date + '|' + row.visit_start_time;
    });

    // 同個案 + 同日 + 同開始 + 同結束
    var exactStartEnd = groupDupes_(function (row) {
      if (!row.case_key || !row.visit_date || !row.visit_start_time) return '';
      return (
        row.case_key +
        '|' +
        row.visit_date +
        '|' +
        row.visit_start_time +
        '|' +
        (row.visit_end_time || '')
      );
    });

    // 同個案 + 同日（時間可不同）
    var sameDate = includeSameDate
      ? groupDupes_(function (row) {
          if (!row.case_key || !row.visit_date) return '';
          return row.case_key + '|' + row.visit_date;
        })
      : null;

    // 同個案 + 同日，但開始時間不同（從 sameDate 組內再拆）
    var sameDateDiffTime = { duplicate_groups: 0, duplicate_forms: 0, affected_cases: 0, sample: [] };
    if (sameDate) {
      var byCaseDate = {};
      rows.forEach(function (row) {
        if (!row.case_key || !row.visit_date) return;
        var k = row.case_key + '|' + row.visit_date;
        if (!byCaseDate[k]) byCaseDate[k] = [];
        byCaseDate[k].push(row);
      });
      var diffGroups = [];
      var diffForms = 0;
      var diffCases = {};
      Object.keys(byCaseDate).forEach(function (k) {
        var items = byCaseDate[k];
        if (items.length < 2) return;
        var times = {};
        items.forEach(function (it) {
          var t = it.visit_start_time || '(空白)';
          times[t] = true;
        });
        if (Object.keys(times).length < 2) return; // all same time → covered by exactStart
        diffForms += items.length;
        diffCases[items[0].case_key] = true;
        diffGroups.push({
          key: k,
          count: items.length,
          case_key: items[0].case_key,
          encoded_id: items[0].encoded_id,
          national_id: items[0].national_id,
          name: items[0].name,
          visit_date: items[0].visit_date,
          distinct_start_times: Object.keys(times),
          careform_ids: items.map(function (it) {
            return it.careform_id;
          }),
          start_times: items.map(function (it) {
            return it.visit_start_time || '';
          }),
          statuses: items.map(function (it) {
            return it.status;
          }),
        });
      });
      diffGroups.sort(function (a, b) {
        return b.count - a.count;
      });
      sameDateDiffTime = {
        duplicate_groups: diffGroups.length,
        duplicate_forms: diffForms,
        affected_cases: Object.keys(diffCases).length,
        sample: diffGroups.slice(0, sampleLimit),
      };
    }

    return {
      dedupe_key:
        'case_key(national_id||encoded_id) + visit_date + visit_start_time',
      case_key_mode: caseKeyMode,
      statuses_scoped: statusList,
      careform_total: careforms.length,
      scoped_total: rows.length,
      status_counts_all: statusCountsAll,
      status_counts_scoped: statusCountsScoped,
      missing: {
        visit_date: missingDate,
        visit_start_time: missingTime,
        case_key: missingCaseKey,
      },
      exact_case_date_start: exactStart,
      exact_case_date_start_end: exactStartEnd,
      same_case_date_any_time: sameDate,
      same_case_date_diff_start: sameDateDiffTime,
      note:
        '中央匯入錯誤文案不在本 repo；此掃描依 MOHW 欄位訪查日期*＋訪查開始時間*＋個案身分對齊。',
    };
  }

  /**
   * 依 careform_id 讀取關懷表摘要（比對重複 KEY 用）。
   * data.careform_ids: string[]
   */
  /**
   * 依身分證字號（answers.national_id／id_number）找出關懷表。
   * data.national_ids: string[]
   */
  function findCareformsByNationalIds(data) {
    data = data || {};
    var want = {};
    (data.national_ids || []).forEach(function (id) {
      var key = String(id || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '');
      if (key) want[key] = true;
    });
    var ids = Object.keys(want);
    if (!ids.length) {
      var err = new Error('national_ids 不可為空');
      err.code = 'VALIDATION';
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
    var careforms = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.CAREFORMS)
    );
    var out = [];
    careforms.forEach(function (cf) {
      var answers = parseAnswers_(cf.answers_json);
      var nid = String(answers.national_id || answers.id_number || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '');
      if (!want[nid]) return;
      out.push({
        careform_id: String(cf.careform_id || ''),
        encoded_id: String(cf.encoded_id || ''),
        status: String(cf.status || ''),
        visit_result: String(cf.visit_result || ''),
        national_id: nid,
        name: String(answers.name || ''),
        visit_date: String(answers.visit_date || ''),
        visit_start_time: String(answers.visit_start_time || answers.visit_time_start || ''),
        help_sources_flag: String(answers.help_sources_flag || ''),
        help_sources_has: String(answers.help_sources_has || ''),
        living_city: String(answers.living_city || ''),
        living_district: String(answers.living_district || ''),
      });
    });
    return { count: out.length, items: out };
  }

  function peekCareformsByIds(data) {
    data = data || {};
    var wanted = {};
    (data.careform_ids || []).forEach(function (id) {
      var key = String(id || '').trim();
      if (key) wanted[key] = true;
    });
    var ids = Object.keys(wanted);
    if (!ids.length) {
      var err = new Error('careform_ids 不可為空');
      err.code = 'VALIDATION';
      throw err;
    }

    var careforms = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.CAREFORMS)
    );
    var assignments = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.ASSIGNMENTS)
    );
    var asgById = {};
    assignments.forEach(function (row) {
      asgById[String(row.assignment_id || '').trim()] = row;
    });

    function parseAnswers_(raw) {
      if (!raw) return {};
      if (typeof raw === 'object') return raw;
      try {
        return JSON.parse(String(raw));
      } catch (e) {
        return {};
      }
    }

    var out = [];
    careforms.forEach(function (cf) {
      var id = String(cf.careform_id || '').trim();
      if (!wanted[id]) return;
      var answers = parseAnswers_(cf.answers_json);
      var asg = asgById[String(cf.assignment_id || '').trim()] || {};
      out.push({
        careform_id: id,
        assignment_id: String(cf.assignment_id || ''),
        encoded_id: String(cf.encoded_id || ''),
        visitor_id: String(cf.visitor_id || ''),
        status: String(cf.status || ''),
        visit_result: String(cf.visit_result || ''),
        submitted_at: String(cf.submitted_at || ''),
        consent_signed: cf.consent_signed,
        validation_ok: cf.validation_ok,
        completion_pct: cf.completion_pct,
        assignment_status: String(asg.status || ''),
        assignment_due_date: String(asg.due_date || ''),
        assignment_notes: String(asg.notes || ''),
        answers: {
          name: answers.name || '',
          id_number: answers.id_number || '',
          visit_date: answers.visit_date || '',
          visit_status: answers.visit_status || '',
          visit_start_time: answers.visit_start_time || answers.visit_time_start || '',
          visit_end_time: answers.visit_end_time || answers.visit_time_end || '',
          visit_time_start: answers.visit_time_start || answers.visit_start_time || '',
          visit_time_end: answers.visit_time_end || answers.visit_end_time || '',
          living_village: answers.living_village || '',
          living_address: answers.living_address || '',
          living_address_type: answers.living_address_type || '',
          living_address_other: String(answers.living_address_other || '').slice(0, 500),
          visit_notes: String(answers.visit_notes || '').slice(0, 500),
          notes: String(answers.notes || '').slice(0, 300),
          living_status: answers.living_status || '',
          civil_worker_name: answers.civil_worker_name || '',
          civil_worker_role: answers.civil_worker_role || '',
          civil_worker_national_id: answers.civil_worker_national_id || '',
          civil_worker_phone: answers.civil_worker_phone || '',
          civil_worker_date: answers.civil_worker_date || '',
          social_worker_name: answers.social_worker_name || '',
          social_worker_role: answers.social_worker_role || '',
          social_worker_national_id: answers.social_worker_national_id || '',
          social_worker_phone: answers.social_worker_phone || '',
          social_worker_date: answers.social_worker_date || '',
        },
      });
    });

    return { count: out.length, items: out };
  }

  /**
   * 營運搜尋：在 careforms.answers_json 的備註／居住其他說明找關鍵字。
   * data.needles: string[]（任一命中）
   * data.visit_result?: 過濾列上 visit_result
   * data.limit?: 最多回傳筆數（預設 50、上限 200）
   */
  function scanCareformNotes(data) {
    data = data || {};
    var needles = [];
    (data.needles || []).forEach(function (n) {
      var text = String(n || '').trim();
      if (text) needles.push(text);
    });
    if (!needles.length) {
      var err = new Error('needles 不可為空');
      err.code = 'VALIDATION';
      throw err;
    }
    var visitResultFilter =
      data.visit_result != null && String(data.visit_result).trim() !== ''
        ? String(data.visit_result).trim()
        : '';
    var limit = Number(data.limit);
    if (!Number.isFinite(limit) || limit <= 0) limit = 50;
    if (limit > 200) limit = 200;

    var careforms = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.CAREFORMS)
    );
    var out = [];
    for (var i = 0; i < careforms.length; i++) {
      var cf = careforms[i];
      var rowResult = String(cf.visit_result || '').trim();
      if (visitResultFilter && rowResult !== visitResultFilter) continue;
      var answers = {};
      try {
        answers = MissedVisitStampHelper.parseAnswersJson(cf.answers_json) || {};
      } catch (eParse) {
        answers = {};
      }
      var blob = [
        answers.visit_notes,
        answers.living_address_other,
        answers.notes,
      ].join(' ');
      var hit = null;
      for (var n = 0; n < needles.length; n++) {
        if (blob.indexOf(needles[n]) !== -1) {
          hit = needles[n];
          break;
        }
      }
      if (!hit) continue;
      out.push({
        careform_id: String(cf.careform_id || ''),
        assignment_id: String(cf.assignment_id || ''),
        encoded_id: String(cf.encoded_id || ''),
        visitor_id: String(cf.visitor_id || ''),
        visit_result: rowResult,
        submitted_at: String(cf.submitted_at || ''),
        matched_needle: hit,
        name: answers.name || '',
        visit_date: answers.visit_date || '',
        visit_start_time: answers.visit_start_time || answers.visit_time_start || '',
        visit_status: answers.visit_status || '',
        visit_notes: String(answers.visit_notes || '').slice(0, 500),
        living_address_other: String(answers.living_address_other || '').slice(0, 500),
      });
      if (out.length >= limit) break;
    }
    return { count: out.length, items: out, limited: out.length >= limit };
  }

  /**
   * 掃描：某一側有填日期（*_date）卻缺該側人員姓名（*_name）。
   * 擇一規則：另一側完整仍算該側異常（側內不一致）。
   * 無獨立 worker time 欄位；「有時間」＝ social_worker_date / civil_worker_date 非空。
   *
   * data.statuses?: string[] 預設 ['已提交','已稽核']
   * data.sample_limit?: number 預設 10、上限 50
   * data.require_national_id?: boolean 預設 false；true 時「有人員」需 name+national_id
   */
  function scanMissingWorkerWithTime(data) {
    data = data || {};
    var statusFilter = {};
    var statusList = data.statuses && data.statuses.length
      ? data.statuses
      : ['已提交', '已稽核'];
    statusList.forEach(function (s) {
      statusFilter[String(s)] = true;
    });
    var sampleLimit = Number(data.sample_limit);
    if (!Number.isFinite(sampleLimit) || sampleLimit <= 0) sampleLimit = 10;
    if (sampleLimit > 50) sampleLimit = 50;
    var includeClearPlan =
      data.include_clear_plan === true || data.include_clear_plan === 'true';
    var requireNid =
      data.require_national_id === true || data.require_national_id === 'true';

    function parseAnswers_(raw) {
      if (!raw) return {};
      if (typeof raw === 'object') return raw;
      try {
        return JSON.parse(String(raw));
      } catch (e) {
        return {};
      }
    }

    function hasPerson_(name, nationalId) {
      if (!hasVal_(name)) return false;
      if (requireNid && !hasVal_(nationalId)) return false;
      return true;
    }

    var careforms = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.CAREFORMS)
    );
    var assignments = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.ASSIGNMENTS)
    );
    var cases = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.CASES)
    );
    var asgById = {};
    assignments.forEach(function (row) {
      asgById[String(row.assignment_id || '').trim()] = row;
    });
    var caseById = {};
    cases.forEach(function (row) {
      caseById[String(row.case_id || '').trim()] = row;
    });

    var statusCountsAll = {};
    var statusCountsScoped = {};
    var byStatus = {};
    var byVillage = {};
    var socialOnly = [];
    var civilOnly = [];
    var bothSides = [];
    var eitherComplete = 0;
    var neitherPersonWithAnyDate = 0;
    var neitherPersonWithBothDates = 0;
    var socialDateNoPerson = 0;
    var civilDateNoPerson = 0;
    var socialComplete = 0;
    var civilComplete = 0;
    var bothComplete = 0;
    var scopedTotal = 0;
    var withAnyAnswers = 0;
    // 側內 name×date 矩陣（person＝name；與 has_person 定義一致）
    var socialNameDate = 0;
    var socialNameNoDate = 0;
    var socialNeither = 0;
    var civilNameDate = 0;
    var civilNameNoDate = 0;
    var civilNeither = 0;
    var eitherNameAndDate = 0;
    var nameNoDateSample = [];
    var anomalyByStatusSocial = {};
    var anomalyByStatusCivil = {};
    var clearPlan = includeClearPlan ? [] : null;

    careforms.forEach(function (cf) {
      var st = String(cf.status || '').trim() || '(空白)';
      statusCountsAll[st] = (statusCountsAll[st] || 0) + 1;
      if (!statusFilter[st]) return;
      statusCountsScoped[st] = (statusCountsScoped[st] || 0) + 1;
      scopedTotal += 1;

      var answers = parseAnswers_(cf.answers_json);
      if (answers && typeof answers === 'object' && Object.keys(answers).length) {
        withAnyAnswers += 1;
      }

      var socialDate = String(answers.social_worker_date || '').trim();
      var civilDate = String(answers.civil_worker_date || '').trim();
      var socialName = String(answers.social_worker_name || '').trim();
      var civilName = String(answers.civil_worker_name || '').trim();
      var socialNid = String(answers.social_worker_national_id || '').trim();
      var civilNid = String(answers.civil_worker_national_id || '').trim();
      var hasSocialPerson = hasPerson_(socialName, socialNid);
      var hasCivilPerson = hasPerson_(civilName, civilNid);
      var hasSocialDate = hasVal_(socialDate);
      var hasCivilDate = hasVal_(civilDate);

      if (hasSocialPerson) socialComplete += 1;
      if (hasCivilPerson) civilComplete += 1;
      if (hasSocialPerson && hasCivilPerson) bothComplete += 1;
      if (hasSocialPerson || hasCivilPerson) eitherComplete += 1;

      if (hasSocialPerson && hasSocialDate) socialNameDate += 1;
      else if (hasSocialPerson && !hasSocialDate) {
        socialNameNoDate += 1;
        if (nameNoDateSample.length < sampleLimit) {
          nameNoDateSample.push({
            careform_id: String(cf.careform_id || ''),
            status: st,
            side: '社政',
            name: socialName,
            date: socialDate,
          });
        }
      } else if (!hasSocialPerson && !hasSocialDate) socialNeither += 1;

      if (hasCivilPerson && hasCivilDate) civilNameDate += 1;
      else if (hasCivilPerson && !hasCivilDate) {
        civilNameNoDate += 1;
        if (nameNoDateSample.length < sampleLimit) {
          nameNoDateSample.push({
            careform_id: String(cf.careform_id || ''),
            status: st,
            side: '民政',
            name: civilName,
            date: civilDate,
          });
        }
      } else if (!hasCivilPerson && !hasCivilDate) civilNeither += 1;

      if (
        (hasSocialPerson && hasSocialDate) ||
        (hasCivilPerson && hasCivilDate)
      ) {
        eitherNameAndDate += 1;
      }

      var socialAnom = hasSocialDate && !hasSocialPerson;
      var civilAnom = hasCivilDate && !hasCivilPerson;
      if (socialAnom) {
        socialDateNoPerson += 1;
        anomalyByStatusSocial[st] = (anomalyByStatusSocial[st] || 0) + 1;
      }
      if (civilAnom) {
        civilDateNoPerson += 1;
        anomalyByStatusCivil[st] = (anomalyByStatusCivil[st] || 0) + 1;
      }

      if (!hasSocialPerson && !hasCivilPerson) {
        if (hasSocialDate || hasCivilDate) neitherPersonWithAnyDate += 1;
        if (hasSocialDate && hasCivilDate) neitherPersonWithBothDates += 1;
      }

      if (!socialAnom && !civilAnom) return;

      var asg = asgById[String(cf.assignment_id || '').trim()] || {};
      var caseRow = caseById[String(asg.case_id || '').trim()] || {};
      var village =
        String(answers.living_village || '').trim() ||
        String(caseRow.visit_village || '').trim() ||
        String(caseRow.village || '').trim() ||
        '(未填村里)';

      byStatus[st] = (byStatus[st] || 0) + 1;
      byVillage[village] = (byVillage[village] || 0) + 1;

      var sample = {
        careform_id: String(cf.careform_id || ''),
        status: st,
        name: String(answers.name || caseRow.name || '').trim(),
        village: village,
        anomaly_side:
          socialAnom && civilAnom ? '兩邊' : socialAnom ? '社政' : '民政',
        social_has_date: hasSocialDate,
        social_date: socialDate,
        social_has_person: hasSocialPerson,
        social_worker_name: socialName,
        civil_has_date: hasCivilDate,
        civil_date: civilDate,
        civil_has_person: hasCivilPerson,
        civil_worker_name: civilName,
        other_side_has_person: socialAnom
          ? hasCivilPerson
          : hasSocialPerson,
      };

      if (socialAnom && civilAnom) {
        bothSides.push(sample);
      } else if (socialAnom) {
        socialOnly.push(sample);
      } else {
        civilOnly.push(sample);
      }

      if (clearPlan) {
        var answersPatch = {};
        // 只清「有日無名」；有 name 側絕不清 date（與 has_person＝name 定義一致）
        if (hasSocialDate && !hasVal_(socialName)) {
          answersPatch.social_worker_date = '';
        }
        if (hasCivilDate && !hasVal_(civilName)) {
          answersPatch.civil_worker_date = '';
        }
        if (Object.keys(answersPatch).length) {
          clearPlan.push({
            careform_id: String(cf.careform_id || ''),
            answers: answersPatch,
          });
        }
      }
    });

    function villageTop_(map, n) {
      return Object.keys(map)
        .map(function (k) {
          return { village: k, count: map[k] };
        })
        .sort(function (a, b) {
          return b.count - a.count;
        })
        .slice(0, n || 15);
    }

    var unionAnomaly = socialOnly.length + civilOnly.length + bothSides.length;

    return {
      definitions: {
        has_time: 'social_worker_date / civil_worker_date 任一非空（無獨立 worker time 欄）',
        has_person: requireNid
          ? '*_name 與 *_national_id 皆非空'
          : '*_name 非空（不要求 national_id）',
        anomaly:
          '某一側有 date 卻缺該側人員；即使另一側完整仍算該側異常（側內不一致）',
        either_rule: '擇一填寫即可；本掃描不把「只填一側」當異常',
      },
      statuses_scoped: statusList,
      require_national_id: requireNid,
      careform_total: careforms.length,
      scoped_total: scopedTotal,
      with_any_answers: withAnyAnswers,
      status_counts_all: statusCountsAll,
      status_counts_scoped: statusCountsScoped,
      counts: {
        social_date_no_person: socialDateNoPerson,
        civil_date_no_person: civilDateNoPerson,
        both_sides_anomaly: bothSides.length,
        union_anomaly_forms: unionAnomaly,
        social_only_anomaly: socialOnly.length,
        civil_only_anomaly: civilOnly.length,
      },
      contrast: {
        either_side_complete: eitherComplete,
        social_complete: socialComplete,
        civil_complete: civilComplete,
        both_sides_complete: bothComplete,
        neither_person_but_any_date: neitherPersonWithAnyDate,
        neither_person_but_both_dates: neitherPersonWithBothDates,
        note:
          'desk 常預填兩邊 *_date；「兩邊皆無人員但有日期」多半是擇一未填完或僅預填日期',
      },
      // 側內 name×date：名日皆有 / 有名無日 / 有日無名 / 皆無
      matrix: {
        social: {
          name_and_date: socialNameDate,
          name_no_date: socialNameNoDate,
          date_no_name: socialDateNoPerson,
          neither: socialNeither,
        },
        civil: {
          name_and_date: civilNameDate,
          name_no_date: civilNameNoDate,
          date_no_name: civilDateNoPerson,
          neither: civilNeither,
        },
        either_name_and_date: eitherNameAndDate,
        projected_after_clear_orphan_dates: {
          social: {
            name_and_date: socialNameDate,
            name_no_date: socialNameNoDate,
            date_no_name: 0,
            neither: socialNeither + socialDateNoPerson,
          },
          civil: {
            name_and_date: civilNameDate,
            name_no_date: civilNameNoDate,
            date_no_name: 0,
            neither: civilNeither + civilDateNoPerson,
          },
          either_name_and_date: eitherNameAndDate,
          note:
            '只清「有日無名」之 *_date；名日皆有／有名無日不變；either_name_and_date 亦不變（不誤清有名側）',
        },
      },
      by_status: byStatus,
      anomaly_by_status: {
        social_date_no_person: anomalyByStatusSocial,
        civil_date_no_person: anomalyByStatusCivil,
      },
      by_village_top: villageTop_(byVillage, 20),
      sample: {
        social_only: socialOnly.slice(0, sampleLimit),
        civil_only: civilOnly.slice(0, sampleLimit),
        both_sides: bothSides.slice(0, sampleLimit),
        mixed_10: socialOnly
          .concat(civilOnly)
          .concat(bothSides)
          .slice(0, sampleLimit),
        name_no_date: nameNoDateSample,
      },
      clear_plan: clearPlan,
      clear_plan_count: clearPlan ? clearPlan.length : 0,
    };
  }

  /**
   * 清空「有日無名」之 social_worker_date / civil_worker_date。
   * 只改 date；有 name 的側絕不清除。apply=true 才寫入。
   * limit>0 時只處理前 N 筆需清關懷表（smoke 用）。
   */
  function clearOrphanWorkerDates(data) {
    data = data || {};
    var apply = data.apply === true || data.apply === 'true';
    var statusFilter = {};
    var statusList = data.statuses && data.statuses.length
      ? data.statuses
      : ['已提交', '已稽核'];
    statusList.forEach(function (s) {
      statusFilter[String(s)] = true;
    });
    var limit = Number(data.limit);
    if (!Number.isFinite(limit) || limit < 0) limit = 0;
    var onlyIds = null;
    if (data.careform_ids && data.careform_ids.length) {
      onlyIds = {};
      data.careform_ids.forEach(function (id) {
        var key = String(id || '').trim();
        if (key) onlyIds[key] = true;
      });
    }

    var cfSheet = SheetHelper.getSheet(Config.SHEET_NAMES.CAREFORMS);
    var cfValues = cfSheet.getDataRange().getValues();
    var cfHeaders = cfValues[0];
    var idIdx = cfHeaders.indexOf('careform_id');
    var statusIdx = cfHeaders.indexOf('status');
    var answersIdx = cfHeaders.indexOf('answers_json');
    if (idIdx === -1 || answersIdx === -1) {
      var errCols = new Error('careforms missing careform_id/answers_json');
      errCols.code = 'SCHEMA';
      throw errCols;
    }

    var answersCol = [];
    var cleared = [];
    var socialCleared = 0;
    var civilCleared = 0;
    var formsTouched = 0;
    var written = 0;
    var skippedNamed = 0;

    for (var r = 1; r < cfValues.length; r++) {
      var cid = String(cfValues[r][idIdx] || '').trim();
      var st = statusIdx !== -1 ? String(cfValues[r][statusIdx] || '').trim() : '';
      var rawAnswers = cfValues[r][answersIdx];
      var answers = {};
      try {
        answers = MissedVisitStampHelper.parseAnswersJson(rawAnswers) || {};
      } catch (eParse) {
        answers = {};
      }

      var inScope = statusFilter[st];
      if (onlyIds) inScope = inScope && !!onlyIds[cid];

      var socialName = String(answers.social_worker_name || '').trim();
      var civilName = String(answers.civil_worker_name || '').trim();
      var socialDate = String(answers.social_worker_date || '').trim();
      var civilDate = String(answers.civil_worker_date || '').trim();
      var clearSocial = inScope && hasVal_(socialDate) && !hasVal_(socialName);
      var clearCivil = inScope && hasVal_(civilDate) && !hasVal_(civilName);

      // 有名側防護：即使誤傳也不清
      if (hasVal_(socialName) && clearSocial) {
        clearSocial = false;
        skippedNamed += 1;
      }
      if (hasVal_(civilName) && clearCivil) {
        clearCivil = false;
        skippedNamed += 1;
      }

      var willTouch = clearSocial || clearCivil;
      if (willTouch && limit > 0 && formsTouched >= limit) {
        willTouch = false;
        clearSocial = false;
        clearCivil = false;
      }

      if (willTouch) {
        formsTouched += 1;
        var before = {
          social_worker_date: socialDate,
          civil_worker_date: civilDate,
          social_worker_name: socialName,
          civil_worker_name: civilName,
        };
        if (clearSocial) {
          answers.social_worker_date = '';
          socialCleared += 1;
        }
        if (clearCivil) {
          answers.civil_worker_date = '';
          civilCleared += 1;
        }
        cleared.push({
          careform_id: cid,
          status: st,
          cleared_social_date: clearSocial,
          cleared_civil_date: clearCivil,
          before: before,
          after: {
            social_worker_date: String(answers.social_worker_date || ''),
            civil_worker_date: String(answers.civil_worker_date || ''),
            social_worker_name: String(answers.social_worker_name || ''),
            civil_worker_name: String(answers.civil_worker_name || ''),
          },
        });
        if (apply) {
          answersCol.push([JSON.stringify(answers)]);
          written += 1;
        } else {
          answersCol.push([rawAnswers]);
        }
      } else {
        answersCol.push([rawAnswers]);
      }
    }

    if (apply && written > 0) {
      cfSheet.getRange(2, answersIdx + 1, answersCol.length, 1).setValues(answersCol);
      try {
        ReadCache.bump();
      } catch (eBump) {}
    }

    return {
      dry_run: !apply,
      applied: apply,
      statuses_scoped: statusList,
      limit: limit || null,
      social_cleared: socialCleared,
      civil_cleared: civilCleared,
      forms_touched: formsTouched,
      written: written,
      skipped_named_guard: skippedNamed,
      sample: cleared.slice(0, 10),
      cleared_ids: cleared.map(function (row) {
        return row.careform_id;
      }),
    };
  }

  /**
   * 資料品質掃描（分析用，不改資料）：
   * 1) 未遇／查無此人卻勾與他人同住或同住者為子女／兒子
   * 2) 訪視狀態「住址不詳」卻仍有居住地址欄
   * 3) 訪視成功但時長 < 5 分（另計 =1 分）
   * 4) 訪視起迄或未遇戳記時間不在 08:00–20:00
   * 5) 同個案 ≥3 張關懷表
   */
  function scanDataQualityIssues(data) {
    data = data || {};
    var statusFilter = {};
    var statusList = data.statuses && data.statuses.length
      ? data.statuses
      : ['已提交', '已稽核'];
    statusList.forEach(function (s) {
      statusFilter[String(s)] = true;
    });
    var sampleLimit = Number(data.sample_limit);
    if (!Number.isFinite(sampleLimit) || sampleLimit <= 0) sampleLimit = 8;
    if (sampleLimit > 20) sampleLimit = 20;
    var windowStart = 8 * 60;
    var windowEnd = 20 * 60;

    function parseAnswers_(raw) {
      if (!raw) return {};
      if (typeof raw === 'object') return raw;
      try {
        return JSON.parse(String(raw));
      } catch (e) {
        return {};
      }
    }

    function normTime_(v) {
      var t = String(v || '').trim();
      if (!t) return '';
      var m = t.match(/(\d{1,2}):(\d{2})/);
      if (!m) return '';
      return ('0' + m[1]).slice(-2) + ':' + m[2];
    }

    function timeToMinutes_(hhmm) {
      var t = normTime_(hhmm);
      if (!t) return null;
      var parts = t.split(':');
      var h = Number(parts[0]);
      var m = Number(parts[1]);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return h * 60 + m;
    }

    function outsideWindow_(hhmm) {
      var mins = timeToMinutes_(hhmm);
      if (mins == null) return false;
      return mins < windowStart || mins > windowEnd;
    }

    function durationMinutes_(start, end) {
      var a = timeToMinutes_(start);
      var b = timeToMinutes_(end);
      if (a == null || b == null) return null;
      var d = b - a;
      if (d < 0) d += 24 * 60;
      return d;
    }

    function isMissed_(answers, visitStatus) {
      var status = String(visitStatus || '').trim();
      if (status === '查無此人' || status === '住址不詳') return true;
      if (String(answers.living_address_type || '').trim() === '查無此人') return true;
      var blob =
        String(answers.living_address_other || '') +
        '|' +
        String(answers.visit_notes || '') +
        '|' +
        String(answers.notes || '');
      if (blob.indexOf('訪視未遇') !== -1) return true;
      return false;
    }

    function hasSonOrCohabit_(answers) {
      var livingStatus = String(answers.living_status || '').trim();
      var relation = String(answers.cohabitant_relation || '').trim();
      var withOthers = livingStatus === '與他人同住';
      var sonLike =
        relation.indexOf('子') !== -1 ||
        relation.indexOf('兒') !== -1 ||
        relation.indexOf('女') !== -1;
      return {
        with_others: withOthers,
        son_like_relation: Boolean(relation) && sonLike,
        relation: relation,
        living_status: livingStatus,
        hit: withOthers || (Boolean(relation) && sonLike),
      };
    }

    function hasLivingAddressFilled_(answers) {
      var fields = [
        answers.living_address,
        answers.living_city,
        answers.living_district,
        answers.living_village,
        answers.living_neighborhood,
        answers.living_lane,
        answers.living_alley,
        answers.living_number,
        answers.living_floor,
      ];
      for (var i = 0; i < fields.length; i++) {
        if (hasVal_(fields[i])) return true;
      }
      var note = String(answers.living_address_note || '').trim();
      if (note && note !== '同戶籍' && note.indexOf('同戶籍') === -1) {
        if (note.length >= 4) return true;
      }
      return false;
    }

    function extractMissedStampTimes_(answers) {
      var blob =
        String(answers.living_address_other || '') +
        '；' +
        String(answers.visit_notes || '') +
        '；' +
        String(answers.notes || '');
      var out = [];
      var re = /(\d{1,2}\/\d{1,2})\s+(\d{1,2}:\d{2})訪視未遇/g;
      var m;
      while ((m = re.exec(blob))) {
        out.push(normTime_(m[2]));
      }
      return out;
    }

    function pushSample_(arr, row) {
      if (arr.length < sampleLimit) arr.push(row);
    }

    var careforms = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.CAREFORMS)
    );
    var assignments = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.ASSIGNMENTS)
    );
    var asgById = {};
    assignments.forEach(function (row) {
      asgById[String(row.assignment_id || '').trim()] = row;
    });

    var scopedTotal = 0;
    var statusCountsScoped = {};
    var missedWithCohabit = [];
    var missedStatusWithCohabit = 0;
    var livingTypeMissedWithCohabit = 0;
    var noteMissedWithCohabit = 0;
    var addressUnknownWithAddress = [];
    var successShortDuration = [];
    var successOneMinute = [];
    var outsideHoursVisit = [];
    var outsideHoursMissedStamp = [];
    var byCase = {};
    var exactlyThreeCases = 0;
    var moreThanThreeCases = 0;

    careforms.forEach(function (cf) {
      var st = String(cf.status || '').trim() || '(空白)';
      if (!statusFilter[st]) return;
      statusCountsScoped[st] = (statusCountsScoped[st] || 0) + 1;
      scopedTotal += 1;

      var answers = parseAnswers_(cf.answers_json);
      var visitStatus = String(answers.visit_status || '').trim();
      var start = normTime_(answers.visit_start_time || answers.visit_time_start);
      var end = normTime_(answers.visit_end_time || answers.visit_time_end);
      var nationalId = String(
        answers.national_id || answers.id_number || answers.elder_national_id || ''
      )
        .trim()
        .toUpperCase();
      var encodedId = String(cf.encoded_id || '').trim();
      var asg = asgById[String(cf.assignment_id || '').trim()] || {};
      var caseKey = nationalId || encodedId || String(asg.case_id || '').trim();
      var name = String(answers.name || cf.name || '').trim();
      var base = {
        careform_id: String(cf.careform_id || ''),
        status: st,
        name: name,
        encoded_id: encodedId,
        visit_status: visitStatus,
        visit_date: String(answers.visit_date || '').trim(),
        visit_start_time: start,
        visit_end_time: end,
      };

      if (caseKey) {
        if (!byCase[caseKey]) byCase[caseKey] = [];
        byCase[caseKey].push({
          careform_id: base.careform_id,
          name: name,
          encoded_id: encodedId,
          status: st,
          visit_status: visitStatus,
          visit_date: base.visit_date,
          visit_start_time: start,
        });
      }

      var missed = isMissed_(answers, visitStatus);
      var cohabit = hasSonOrCohabit_(answers);
      if (missed && cohabit.hit) {
        var livingType = String(answers.living_address_type || '').trim();
        var statusMissed =
          visitStatus === '查無此人' || visitStatus === '住址不詳';
        var typeMissed = livingType === '查無此人';
        var noteMissed =
          (
            String(answers.living_address_other || '') +
            String(answers.visit_notes || '') +
            String(answers.notes || '')
          ).indexOf('訪視未遇') !== -1;
        if (statusMissed) missedStatusWithCohabit += 1;
        else if (typeMissed) livingTypeMissedWithCohabit += 1;
        else if (noteMissed) noteMissedWithCohabit += 1;
        var row1 = Object.assign({}, base, {
          living_status: cohabit.living_status,
          cohabitant_relation: cohabit.relation,
          living_address_type: livingType,
          with_others: cohabit.with_others,
          son_like_relation: cohabit.son_like_relation,
          missed_via_status: statusMissed,
          missed_via_living_type: typeMissed && !statusMissed,
        });
        missedWithCohabit.push(row1);
      }

      if (visitStatus === '住址不詳' && hasLivingAddressFilled_(answers)) {
        addressUnknownWithAddress.push(
          Object.assign({}, base, {
            living_address_type: String(answers.living_address_type || '').trim(),
            living_address: String(answers.living_address || '').slice(0, 80),
            living_city: String(answers.living_city || '').trim(),
            living_district: String(answers.living_district || '').trim(),
            living_village: String(answers.living_village || '').trim(),
          })
        );
      }

      if (visitStatus === '已完成') {
        var dur = durationMinutes_(start, end);
        if (dur != null && dur < 5) {
          var shortRow = Object.assign({}, base, { duration_minutes: dur });
          successShortDuration.push(shortRow);
          if (dur === 1) successOneMinute.push(shortRow);
        }
      }

      var outTimes = [];
      if (outsideWindow_(start)) outTimes.push({ field: 'start', time: start });
      if (outsideWindow_(end)) outTimes.push({ field: 'end', time: end });
      if (outTimes.length) {
        outsideHoursVisit.push(
          Object.assign({}, base, { outside: outTimes })
        );
      }

      var stampTimes = extractMissedStampTimes_(answers);
      var badStamps = [];
      stampTimes.forEach(function (t) {
        if (outsideWindow_(t)) badStamps.push(t);
      });
      if (badStamps.length) {
        outsideHoursMissedStamp.push(
          Object.assign({}, base, {
            bad_stamp_times: badStamps,
            all_stamp_times: stampTimes,
          })
        );
      }
    });

    var tripleOrMoreCases = [];
    var tripleOrMoreCareforms = 0;
    Object.keys(byCase).forEach(function (key) {
      var list = byCase[key];
      if (list.length >= 3) {
        tripleOrMoreCases.push({
          case_key: key,
          count: list.length,
          name: list[0].name,
          encoded_id: list[0].encoded_id,
          careforms: list,
        });
        tripleOrMoreCareforms += list.length;
        if (list.length === 3) exactlyThreeCases += 1;
        else moreThanThreeCases += 1;
      }
    });
    tripleOrMoreCases.sort(function (a, b) {
      return b.count - a.count;
    });

    var missedWithOthers = 0;
    var missedWithSonRelation = 0;
    missedWithCohabit.forEach(function (row) {
      if (row.with_others) missedWithOthers += 1;
      if (row.son_like_relation) missedWithSonRelation += 1;
    });

    return {
      scoped_total: scopedTotal,
      status_counts: statusCountsScoped,
      definitions: {
        missed:
          'visit_status∈{查無此人,住址不詳} 或 living_address_type=查無此人 或 備註含「訪視未遇」',
        cohabit_or_son: 'living_status=與他人同住 或 cohabitant_relation 含 子/兒/女',
        address_unknown_with_address:
          'visit_status=住址不詳 且 living_address／縣市區里等居住欄有值',
        short_success: 'visit_status=已完成 且 結束-開始 < 5 分鐘',
        outside_hours: '訪視起或迄 或 未遇戳記時間 不在 08:00–20:00（含界）',
        triple: '同個案鍵（national_id 優先否則 encoded_id）≥3 張關懷表',
      },
      issue1_missed_with_cohabit: {
        count: missedWithCohabit.length,
        with_others_count: missedWithOthers,
        son_like_relation_count: missedWithSonRelation,
        via_visit_status_count: missedStatusWithCohabit,
        via_living_type_only_count: livingTypeMissedWithCohabit,
        via_note_only_count: noteMissedWithCohabit,
        sample: missedWithCohabit.slice(0, sampleLimit),
        all: data.include_all ? missedWithCohabit : undefined,
      },
      issue2_address_unknown_with_address: {
        count: addressUnknownWithAddress.length,
        sample: addressUnknownWithAddress.slice(0, sampleLimit),
      },
      issue3_success_short_duration: {
        under_5_min_count: successShortDuration.length,
        exactly_1_min_count: successOneMinute.length,
        sample_under_5: successShortDuration.slice(0, sampleLimit),
        sample_1_min: successOneMinute.slice(0, sampleLimit),
        all: data.include_all ? successShortDuration : undefined,
      },
      issue4_outside_hours: {
        visit_start_or_end_count: outsideHoursVisit.length,
        missed_stamp_count: outsideHoursMissedStamp.length,
        union_careform_ids: (function () {
          var map = {};
          outsideHoursVisit.forEach(function (r) {
            map[r.careform_id] = true;
          });
          outsideHoursMissedStamp.forEach(function (r) {
            map[r.careform_id] = true;
          });
          return Object.keys(map).length;
        })(),
        sample_visit: outsideHoursVisit.slice(0, sampleLimit),
        sample_missed_stamp: outsideHoursMissedStamp.slice(0, sampleLimit),
        all_visit: data.include_all ? outsideHoursVisit : undefined,
        all_missed_stamp: data.include_all ? outsideHoursMissedStamp : undefined,
      },
      issue5_triple_or_more_careforms: {
        case_count: tripleOrMoreCases.length,
        exactly_3_case_count: exactlyThreeCases,
        more_than_3_case_count: moreThanThreeCases,
        careform_count: tripleOrMoreCareforms,
        sample: tripleOrMoreCases.slice(0, sampleLimit),
        all_cases: data.include_all ? tripleOrMoreCases : undefined,
      },
    };
  }

  function pad2Ops_(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function minutesToHhmm_(total) {
    if (!isFinite(total)) return '';
    var t = ((Math.floor(total) % (24 * 60)) + 24 * 60) % (24 * 60);
    return pad2Ops_(Math.floor(t / 60)) + ':' + pad2Ops_(t % 60);
  }

  function hhmmToMinutes_(hhmm) {
    var m = String(hhmm || '')
      .trim()
      .match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function clampVisitWindow_(start, end, minDuration, windowStart, windowEnd) {
    var s = hhmmToMinutes_(start);
    var e = hhmmToMinutes_(end);
    if (s == null) s = windowStart;
    if (e == null) e = s + (minDuration || 5);
    if (e < s) e += 24 * 60;
    var dur = e - s;
    if (minDuration && dur < minDuration) {
      dur = minDuration;
      e = s + dur;
    }
    if (dur > windowEnd - windowStart) {
      dur = windowEnd - windowStart;
    }
    if (s < windowStart) s = windowStart;
    if (s > windowEnd - dur) s = windowEnd - dur;
    if (s < windowStart) s = windowStart;
    e = s + dur;
    if (e > windowEnd) {
      e = windowEnd;
      s = e - dur;
      if (s < windowStart) s = windowStart;
    }
    return {
      start: minutesToHhmm_(s),
      end: minutesToHhmm_(e),
      duration: e - s,
    };
  }

  function scoreCareformKeep_(cf) {
    var vs = String(cf.visit_status || '');
    var s = 0;
    if (vs === '已完成') s += 100;
    else if (vs === '無法溝通') s += 40;
    else if (vs === '拒絕訪視') s += 30;
    else if (vs === '查無此人' || vs === '住址不詳') s += 20;
    if (String(cf.status || '') === '已稽核') s += 10;
    else if (String(cf.status || '') === '已提交') s += 5;
    var d = String(cf.visit_date || '').replace(/\D/g, '');
    var t = String(cf.visit_start_time || '').replace(/\D/g, '');
    s += (Number(d) || 0) / 1e6;
    s += (Number(t) || 0) / 1e10;
    // stable tie-break
    s += String(cf.careform_id || '').length * 1e-12;
    return s;
  }

  /**
   * 分析「已完成 + living_address_type=查無此人」特例：問卷填寫深度 → 建議 A/B/C。
   */
  function classifyCompletedWithMissingPersonType(data) {
    data = data || {};
    var statusFilter = {};
    var statusList = data.statuses && data.statuses.length
      ? data.statuses
      : ['已提交', '已稽核'];
    statusList.forEach(function (s) {
      statusFilter[String(s)] = true;
    });
    var sampleLimit = Number(data.sample_limit);
    if (!Number.isFinite(sampleLimit) || sampleLimit <= 0) sampleLimit = 8;
    if (sampleLimit > 20) sampleLimit = 20;

    function parseAnswers_(raw) {
      if (!raw) return {};
      if (typeof raw === 'object') return raw;
      try {
        return JSON.parse(String(raw));
      } catch (e) {
        return {};
      }
    }

    var questionnaireKeys = [
      'housing_type',
      'economic_status',
      'self_care_ability',
      'health_status',
      'medical_care',
      'social_participation',
      'meal_status',
      'emergency_contact_name',
      'emergency_contact_phone',
      'worries',
      'service_needs',
      'observer_appearance',
      'observer_environment',
    ];

    var careforms = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.CAREFORMS)
    );
    var rows = [];
    careforms.forEach(function (cf) {
      var st = String(cf.status || '').trim();
      if (!statusFilter[st]) return;
      var answers = parseAnswers_(cf.answers_json);
      var visitStatus = String(answers.visit_status || '').trim();
      var livingType = String(answers.living_address_type || '').trim();
      if (visitStatus !== '已完成') return;
      if (livingType !== '查無此人') return;

      var filledQ = 0;
      var filledList = [];
      questionnaireKeys.forEach(function (k) {
        if (hasVal_(answers[k])) {
          filledQ += 1;
          filledList.push(k);
        }
      });
      var blob =
        String(answers.living_address_other || '') +
        '|' +
        String(answers.visit_notes || '') +
        '|' +
        String(answers.notes || '');
      var hasMissedStamp = blob.indexOf('訪視未遇') !== -1;
      var livingStatus = String(answers.living_status || '').trim();
      var relation = String(answers.cohabitant_relation || '').trim();
      var otherNote = String(answers.living_address_other || '').trim();
      // 其他說明若幾乎只有未遇戳／往生，不算「有實訪問卷」
      var otherNoteMeaningful =
        otherNote &&
        otherNote.replace(/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}訪視未遇[；;。.\s]*/g, '').trim()
          .length >= 4;

      var suggest = 'C';
      // A: 問卷有一定填寫 → 像真的訪到，地址類型誤標
      // B: 幾乎無問卷 + 有未遇戳／其他說明像未遇 → 應改查無此人
      // C: 中間地帶
      if (filledQ >= 3 && !hasMissedStamp) suggest = 'A';
      else if (filledQ >= 5) suggest = 'A';
      else if (filledQ <= 1 && hasMissedStamp) suggest = 'B';
      else if (filledQ === 0 && (hasMissedStamp || otherNoteMeaningful)) suggest = 'B';
      else if (filledQ === 0 && !hasMissedStamp) suggest = 'C';
      else suggest = 'C';

      rows.push({
        careform_id: String(cf.careform_id || ''),
        status: st,
        name: String(answers.name || ''),
        encoded_id: String(cf.encoded_id || ''),
        visit_date: String(answers.visit_date || ''),
        visit_start_time: String(answers.visit_start_time || answers.visit_time_start || ''),
        living_status: livingStatus,
        cohabitant_relation: relation,
        living_address_other: otherNote.slice(0, 120),
        has_missed_stamp: hasMissedStamp,
        questionnaire_filled_count: filledQ,
        questionnaire_filled_keys: filledList,
        other_note_meaningful: Boolean(otherNoteMeaningful),
        suggest: suggest,
      });
    });

    var bySuggest = { A: 0, B: 0, C: 0 };
    rows.forEach(function (r) {
      bySuggest[r.suggest] = (bySuggest[r.suggest] || 0) + 1;
    });
    var withQ = rows.filter(function (r) {
      return r.questionnaire_filled_count > 0;
    }).length;
    var withStamp = rows.filter(function (r) {
      return r.has_missed_stamp;
    }).length;
    var qHist = {};
    rows.forEach(function (r) {
      var k = String(r.questionnaire_filled_count);
      qHist[k] = (qHist[k] || 0) + 1;
    });

    return {
      total: rows.length,
      with_any_questionnaire: withQ,
      with_missed_stamp: withStamp,
      suggest_counts: bySuggest,
      questionnaire_fill_histogram: qHist,
      sample_A: rows
        .filter(function (r) {
          return r.suggest === 'A';
        })
        .slice(0, sampleLimit),
      sample_B: rows
        .filter(function (r) {
          return r.suggest === 'B';
        })
        .slice(0, sampleLimit),
      sample_C: rows
        .filter(function (r) {
          return r.suggest === 'C';
        })
        .slice(0, sampleLimit),
      all: data.include_all ? rows : undefined,
      rule:
        'A=問卷≥3且無未遇戳（或問卷≥5）；B=問卷≤1且有未遇戳／說明；其餘C。問卷鍵含居住經濟健康社交緊急聯絡觀察等。',
    };
  }

  /**
   * 第 3／4 類修正；第 5 類 plan／void；第 1／2 類 plan12／fix12。
   * modes: fix3 | fix4 | plan5 | void5 | plan12 | fix12
   */
  function remediateDataQualityIssues(data) {
    data = data || {};
    var mode = String(data.mode || '').trim();
    var apply = data.apply === true || data.apply === 'true';
    var windowStart = 8 * 60;
    var windowEnd = 20 * 60;

    function parseAnswers_(raw) {
      if (!raw) return {};
      if (typeof raw === 'object') return raw;
      try {
        return JSON.parse(String(raw));
      } catch (e) {
        return {};
      }
    }

    function normTime_(v) {
      var t = String(v || '').trim();
      var m = t.match(/(\d{1,2}):(\d{2})/);
      if (!m) return '';
      return pad2Ops_(Number(m[1])) + ':' + m[2];
    }

    function hasLivingAddressFilledPlan_(answers) {
      var fields = [
        answers.living_address,
        answers.living_city,
        answers.living_district,
        answers.living_village,
        answers.living_neighborhood,
        answers.living_lane,
        answers.living_alley,
        answers.living_number,
        answers.living_floor,
      ];
      for (var i = 0; i < fields.length; i++) {
        if (hasVal_(fields[i])) return true;
      }
      var note = String(answers.living_address_note || '').trim();
      if (note && note.indexOf('同戶籍') === -1 && note.length >= 4) return true;
      return false;
    }

    function buildIssue12Plans_() {
      var statusFilter = { 已提交: true, 已稽核: true };
      var cohabitKeys = [
        'living_status',
        'cohabitation_status',
        'cohabitant_relation',
        'cohabitant_age',
        'cohabitant_no_care_capacity_note',
      ];
      var livingDetailKeys = [
        'living_address',
        'living_city',
        'living_district',
        'living_village',
        'living_neighborhood',
        'living_lane',
        'living_alley',
        'living_number',
        'living_floor',
        'living_address_note',
        'living_address_type',
      ];
      var careforms = SheetHelper.rowsToObjects(
        SheetHelper.getSheet(Config.SHEET_NAMES.CAREFORMS)
      );
      var issue1Main = [];
      var issue1SpecialB = [];
      var issue2 = [];
      var byId = {};

      function ensurePlan_(cf, answers, bucket, reason) {
        var id = String(cf.careform_id || '').trim();
        if (!id) return null;
        if (!byId[id]) {
          byId[id] = {
            careform_id: id,
            status: String(cf.status || ''),
            name: String(answers.name || ''),
            encoded_id: String(cf.encoded_id || ''),
            national_id: String(
              answers.national_id || answers.id_number || ''
            ).trim(),
            visit_date: String(answers.visit_date || ''),
            visit_start_time: String(
              answers.visit_start_time || answers.visit_time_start || ''
            ),
            visit_status_before: String(answers.visit_status || ''),
            living_address_type_before: String(answers.living_address_type || ''),
            living_status_before: String(answers.living_status || ''),
            cohabitant_relation_before: String(answers.cohabitant_relation || ''),
            living_address_before: String(answers.living_address || '').slice(0, 80),
            living_address_other_before: String(answers.living_address_other || '').slice(
              0,
              100
            ),
            reasons: [],
            answers_patch: {},
          };
        }
        var plan = byId[id];
        if (plan.reasons.indexOf(reason) === -1) plan.reasons.push(reason);
        bucket.push(plan);
        return plan;
      }

      careforms.forEach(function (cf) {
        var st = String(cf.status || '').trim();
        if (!statusFilter[st]) return;
        var answers = parseAnswers_(cf.answers_json);
        var visitStatus = String(answers.visit_status || '').trim();
        var livingType = String(answers.living_address_type || '').trim();

        // 第1類特例 B：已完成 + 地址類型查無此人
        if (visitStatus === '已完成' && livingType === '查無此人') {
          var pB = ensurePlan_(cf, answers, issue1SpecialB, 'issue1_special_B');
          pB.answers_patch.visit_status = '查無此人';
          cohabitKeys.forEach(function (k) {
            if (hasVal_(answers[k])) pB.answers_patch[k] = '';
          });
        }

        // 第1類主軸：查無此人／住址不詳 → 清同住問卷
        if (visitStatus === '查無此人' || visitStatus === '住址不詳') {
          var hasCohabit = false;
          cohabitKeys.forEach(function (k) {
            if (hasVal_(answers[k])) hasCohabit = true;
          });
          if (hasCohabit) {
            var p1 = ensurePlan_(cf, answers, issue1Main, 'issue1_main_clear_cohabit');
            cohabitKeys.forEach(function (k) {
              if (hasVal_(answers[k])) p1.answers_patch[k] = '';
            });
          }
        }

        // 第2類：住址不詳 + 有居住明細 → 清居住明細（保留戶籍、保留 living_address_other）
        if (visitStatus === '住址不詳' && hasLivingAddressFilledPlan_(answers)) {
          var p2 = ensurePlan_(cf, answers, issue2, 'issue2_clear_living_details');
          livingDetailKeys.forEach(function (k) {
            if (hasVal_(answers[k])) p2.answers_patch[k] = '';
          });
        }
      });

      // unique lists (ensurePlan may push same plan ref multiple times)
      function uniqPlans_(arr) {
        var seen = {};
        var out = [];
        arr.forEach(function (p) {
          if (seen[p.careform_id]) return;
          seen[p.careform_id] = true;
          out.push(p);
        });
        return out;
      }

      var allPlans = [];
      Object.keys(byId).forEach(function (id) {
        allPlans.push(byId[id]);
      });

      return {
        issue1_main: uniqPlans_(issue1Main),
        issue1_special_B: uniqPlans_(issue1SpecialB),
        issue2: uniqPlans_(issue2),
        all_unique: allPlans,
      };
    }

    if (mode === 'plan12' || mode === 'fix12') {
      var packed = buildIssue12Plans_();
      var patches = packed.all_unique.map(function (p) {
        return {
          careform_id: p.careform_id,
          answers: p.answers_patch,
          visit_result:
            p.answers_patch.visit_status === '查無此人' ? '未遇' : undefined,
        };
      });
      if (mode === 'plan12') {
        return {
          mode: 'plan12',
          apply: false,
          counts: {
            issue1_main: packed.issue1_main.length,
            issue1_special_B: packed.issue1_special_B.length,
            issue2: packed.issue2.length,
            unique_careforms: packed.all_unique.length,
          },
          issue1_main: packed.issue1_main,
          issue1_special_B: packed.issue1_special_B,
          issue2: packed.issue2,
          rules: {
            issue1_main: 'visit_status∈{查無此人,住址不詳} → 清空同住問卷欄',
            issue1_special_B:
              '已完成+living_address_type=查無此人 → visit_status改查無此人 + 清同住',
            issue2: '住址不詳且有居住明細 → 清空居住地址明細／類型（戶籍與 living_address_other 保留）',
          },
        };
      }
      if (!apply) {
        return {
          mode: 'fix12',
          apply: false,
          patch_count: patches.length,
          counts: {
            issue1_main: packed.issue1_main.length,
            issue1_special_B: packed.issue1_special_B.length,
            issue2: packed.issue2.length,
            unique_careforms: packed.all_unique.length,
          },
          sample: packed.all_unique.slice(0, 10),
        };
      }
      var applied12 = patchCareformAnswers({ apply: true, patches: patches });
      return {
        mode: 'fix12',
        apply: true,
        patch_count: patches.length,
        counts: {
          issue1_main: packed.issue1_main.length,
          issue1_special_B: packed.issue1_special_B.length,
          issue2: packed.issue2.length,
          unique_careforms: packed.all_unique.length,
        },
        applied: applied12,
      };
    }

    if (mode === 'plan5' || mode === 'void5') {
      var scan = scanDataQualityIssues({
        statuses: data.statuses || ['已提交', '已稽核'],
        include_all: true,
        sample_limit: 5,
      });
      var cases = (scan.issue5_triple_or_more_careforms &&
        scan.issue5_triple_or_more_careforms.all_cases) ||
        [];
      var plans = cases.map(function (c) {
        var list = (c.careforms || []).slice().sort(function (a, b) {
          return scoreCareformKeep_(b) - scoreCareformKeep_(a);
        });
        var keep = list[0];
        var voidList = list.slice(1);
        return {
          case_key: c.case_key,
          name: c.name,
          encoded_id: c.encoded_id,
          count: c.count,
          keep_careform_id: keep ? keep.careform_id : '',
          keep: keep,
          void_careform_ids: voidList.map(function (x) {
            return x.careform_id;
          }),
          void_rows: voidList,
        };
      });
      if (mode === 'plan5') {
        return {
          mode: 'plan5',
          case_count: plans.length,
          void_count: plans.reduce(function (n, p) {
            return n + p.void_careform_ids.length;
          }, 0),
          plans: plans,
        };
      }

      var voidIds = [];
      if (data.careform_ids && data.careform_ids.length) {
        voidIds = data.careform_ids.map(String);
      } else {
        plans.forEach(function (p) {
          p.void_careform_ids.forEach(function (id) {
            voidIds.push(id);
          });
        });
      }
      var sheet = SheetHelper.getSheet(Config.SHEET_NAMES.CAREFORMS);
      var values = sheet.getDataRange().getValues();
      var headers = values[0].map(String);
      var idIdx = headers.indexOf('careform_id');
      var statusIdx = headers.indexOf('status');
      var updatedIdx = headers.indexOf('updated_at');
      if (idIdx < 0 || statusIdx < 0) {
        throw new Error('careforms 缺少 careform_id／status');
      }
      var want = {};
      voidIds.forEach(function (id) {
        want[String(id).trim()] = true;
      });
      var changed = [];
      var now = new Date().toISOString();
      for (var r = 1; r < values.length; r++) {
        var id = String(values[r][idIdx] || '').trim();
        if (!want[id]) continue;
        var before = String(values[r][statusIdx] || '');
        if (before === '作廢') {
          changed.push({ careform_id: id, before: before, after: '作廢', skipped: true });
          continue;
        }
        if (apply) {
          sheet.getRange(r + 1, statusIdx + 1).setValue('作廢');
          if (updatedIdx >= 0) sheet.getRange(r + 1, updatedIdx + 1).setValue(now);
        }
        changed.push({ careform_id: id, before: before, after: '作廢', skipped: false });
      }
      try {
        ReadCache.bump();
      } catch (e1) {}
      return {
        mode: 'void5',
        apply: apply,
        planned_void: voidIds.length,
        changed_count: changed.filter(function (x) {
          return !x.skipped;
        }).length,
        changed: changed.slice(0, 50),
        note: 'status→作廢 後不在 VisitRecordIndex.ELIGIBLE，匯出不會帶出',
      };
    }

    if (mode !== 'fix3' && mode !== 'fix4') {
      throw new Error('mode 需為 fix3｜fix4｜plan5｜void5｜plan12｜fix12');
    }

    var careforms = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.CAREFORMS)
    );
    var statusFilter = { 已提交: true, 已稽核: true };
    var patches = [];

    careforms.forEach(function (cf) {
      var st = String(cf.status || '').trim();
      if (!statusFilter[st]) return;
      var answers = parseAnswers_(cf.answers_json);
      var visitStatus = String(answers.visit_status || '').trim();
      var startKey = answers.visit_start_time != null ? 'visit_start_time' : 'visit_time_start';
      var endKey = answers.visit_end_time != null ? 'visit_end_time' : 'visit_time_end';
      if (answers.visit_start_time == null && answers.visit_time_start == null) {
        startKey = 'visit_start_time';
      }
      if (answers.visit_end_time == null && answers.visit_time_end == null) {
        endKey = 'visit_end_time';
      }
      var start = normTime_(answers.visit_start_time || answers.visit_time_start);
      var end = normTime_(answers.visit_end_time || answers.visit_time_end);
      var nextAnswers = {};
      var touched = false;

      if (mode === 'fix3' || mode === 'fix4') {
        var sMin = hhmmToMinutes_(start);
        var eMin = hhmmToMinutes_(end);
        var dur = null;
        if (sMin != null && eMin != null) {
          dur = eMin - sMin;
          if (dur < 0) dur += 24 * 60;
        }

        if (mode === 'fix3') {
          if (visitStatus !== '已完成') return;
          if (dur == null || dur >= 5) return;
          var fixed3 = clampVisitWindow_(start, end, 5, windowStart, windowEnd);
          // 第 3 類：優先 start 不變，end=start+5；若會跨日再交給 clamp
          var preferEnd = minutesToHhmm_((sMin != null ? sMin : windowStart) + 5);
          if (sMin != null && sMin + 5 <= windowEnd && sMin >= windowStart) {
            nextAnswers[endKey] = preferEnd;
            if (answers[startKey] !== undefined || true) nextAnswers[startKey] = start;
          } else {
            nextAnswers[startKey] = fixed3.start;
            nextAnswers[endKey] = fixed3.end;
          }
          touched = true;
        }

        if (mode === 'fix4') {
          var needVisit =
            (start && (sMin < windowStart || sMin > windowEnd)) ||
            (end && (eMin < windowStart || (eMin > windowEnd && !(dur != null && dur >= 0 && eMin < sMin))));
          // simpler outside check
          var startOut = start && (sMin < windowStart || sMin > windowEnd);
          var endOut = end && (eMin < windowStart || eMin > windowEnd);
          var blob =
            String(answers.living_address_other || '') +
            '｜' +
            String(answers.visit_notes || '') +
            '｜' +
            String(answers.notes || '');
          var stamps = MissedVisitStampHelper.parseStamps(blob);
          var badStamps = stamps.filter(function (stmp) {
            var tm = hhmmToMinutes_(stmp.time);
            return tm != null && (tm < windowStart || tm > windowEnd);
          });
          if (!startOut && !endOut && !badStamps.length) return;

          var minDur = visitStatus === '已完成' ? 5 : Math.max(dur || 5, 1);
          if (startOut || endOut || !start || !end) {
            var fixed4 = clampVisitWindow_(
              start || '08:00',
              end || start || '08:05',
              visitStatus === '已完成' ? Math.max(minDur, 5) : Math.max(dur || 5, 1),
              windowStart,
              windowEnd
            );
            nextAnswers[startKey] = fixed4.start;
            nextAnswers[endKey] = fixed4.end;
            touched = true;
          }

          if (badStamps.length) {
            var occupied = {};
            stamps.forEach(function (stmp) {
              var tm = hhmmToMinutes_(stmp.time);
              var t2 = stmp.time;
              if (tm != null && (tm < windowStart || tm > windowEnd)) {
                if (tm < windowStart) t2 = '08:00';
                else t2 = '20:00';
              }
              // uniquify within note
              var base = hhmmToMinutes_(t2);
              var guard = 0;
              while (occupied[stmp.monthDay + ' ' + t2] && guard < 40) {
                base = Math.min(windowEnd, (base == null ? windowStart : base) + 10);
                if (base > windowEnd) base = windowStart;
                t2 = minutesToHhmm_(base);
                guard++;
              }
              occupied[stmp.monthDay + ' ' + t2] = true;
              stmp._next = t2;
            });
            function rewriteNote_(text) {
              var raw = String(text || '');
              if (raw.indexOf('訪視未遇') === -1) return raw;
              return raw.replace(
                /(\d{1,2}\/\d{1,2})\s+(\d{1,2}:\d{2})訪視未遇/g,
                function (full, md, tm) {
                  for (var i = 0; i < stamps.length; i++) {
                    if (
                      stamps[i].monthDay === String(md).trim() &&
                      stamps[i].time === normTime_(tm) &&
                      stamps[i]._next
                    ) {
                      var nextT = stamps[i]._next;
                      stamps[i]._next = ''; // consume once
                      return String(md).trim() + ' ' + nextT + '訪視未遇';
                    }
                  }
                  return full;
                }
              );
            }
            var living = rewriteNote_(answers.living_address_other);
            var notes = rewriteNote_(answers.visit_notes);
            var notes2 = rewriteNote_(answers.notes);
            if (living !== String(answers.living_address_other || '')) {
              nextAnswers.living_address_other = living;
              touched = true;
            }
            if (notes !== String(answers.visit_notes || '')) {
              nextAnswers.visit_notes = notes;
              touched = true;
            }
            if (answers.notes != null && notes2 !== String(answers.notes || '')) {
              nextAnswers.notes = notes2;
              touched = true;
            }
          }
        }
      }

      if (!touched) return;
      patches.push({
        careform_id: String(cf.careform_id || ''),
        name: String(answers.name || ''),
        encoded_id: String(cf.encoded_id || ''),
        before: {
          visit_status: visitStatus,
          start: start,
          end: end,
        },
        answers: nextAnswers,
      });
    });

    var result = {
      mode: mode,
      apply: apply,
      patch_count: patches.length,
      sample: patches.slice(0, 15),
    };
    if (!apply) return result;

    var applied = patchCareformAnswers({
      apply: true,
      patches: patches.map(function (p) {
        return { careform_id: p.careform_id, answers: p.answers };
      }),
    });
    result.applied = applied;
    return result;
  }

  return {
    clearVisitTestData: clearVisitTestData,
    repairDuplicateMissedStamps: repairDuplicateMissedStamps,
    findMissingWorkerNationalIds: findMissingWorkerNationalIds,
    patchWorkerNationalIdsByName: patchWorkerNationalIdsByName,
    auditWorkerIdentityByName: auditWorkerIdentityByName,
    auditAllWorkerIdentities: auditAllWorkerIdentities,
    patchWorkerPhoneByCareformIds: patchWorkerPhoneByCareformIds,
    importSocialVolunteers: importSocialVolunteers,
    findCareformsByNationalIds: findCareformsByNationalIds,
    peekCareformsByIds: peekCareformsByIds,
    scanCareformNotes: scanCareformNotes,
    scanDuplicateVisitKeys: scanDuplicateVisitKeys,
    scanMissingWorkerWithTime: scanMissingWorkerWithTime,
    clearOrphanWorkerDates: clearOrphanWorkerDates,
    scanDataQualityIssues: scanDataQualityIssues,
    classifyCompletedWithMissingPersonType: classifyCompletedWithMissingPersonType,
    remediateDataQualityIssues: remediateDataQualityIssues,
    deleteCareformsByIds: deleteCareformsByIds,
    patchCareformAnswers: patchCareformAnswers,
  };
})();

/**
 * clasp run repairDuplicateMissedStampsDryRun
 * clasp run repairDuplicateMissedStampsApply
 */
function repairDuplicateMissedStampsDryRun() {
  return OpsModule.repairDuplicateMissedStamps({ dry_run: true });
}

function repairDuplicateMissedStampsApply() {
  return OpsModule.repairDuplicateMissedStamps({ apply: true });
}
