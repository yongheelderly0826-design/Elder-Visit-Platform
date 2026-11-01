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

  return {
    clearVisitTestData: clearVisitTestData,
    repairDuplicateMissedStamps: repairDuplicateMissedStamps,
    findMissingWorkerNationalIds: findMissingWorkerNationalIds,
    patchWorkerNationalIdsByName: patchWorkerNationalIdsByName,
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
