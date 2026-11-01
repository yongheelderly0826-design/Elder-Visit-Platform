var CareFormModule = (function () {
  var SHEET = Config.SHEET_NAMES.CAREFORMS;
  var MISSED_SHEET = Config.SHEET_NAMES.MISSED;
  var MISSED_SLOTS = ['上午', '中午', '下午', '傍晚', '夜間'];
  /** 未遇佐證照片下限；0＝暫不強制（一張紙＋三次時間寫備註）。 */
  var MISSED_MIN_SLOTS = 0;

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
    var savedDraft = SheetHelper.appendRow(SHEET, record);
    ReadCache.bump();
    return savedDraft;
  }

  function slotFromLabel_(label) {
    var text = String(label || '').split('：')[0].trim();
    return MISSED_SLOTS.indexOf(text) >= 0 ? text : '';
  }

  function countMissedSlots_(photos) {
    var seen = {};
    var count = 0;
    (photos || []).forEach(function (item) {
      var slot = '';
      if (item && typeof item === 'object') {
        slot = String(item.slot || '');
      } else {
        slot = slotFromLabel_(item);
      }
      if (slot && MISSED_SLOTS.indexOf(slot) >= 0 && !seen[slot]) {
        seen[slot] = true;
        count += 1;
      }
    });
    return count;
  }

  function persistMissedPhoto_(dataUrl, careformId, slot) {
    var value = String(dataUrl || '');
    if (!value) return '';
    var match = value.match(/^data:(image\/[A-Za-z0-9.+-]+);base64,(.+)$/);
    if (!match) return value;
    var folders = DriveApp.getFoldersByName('_未遇時段佐證');
    var folder = folders.hasNext()
      ? folders.next()
      : DriveApp.getRootFolder().createFolder('_未遇時段佐證');
    var extension = match[1].indexOf('png') >= 0 ? 'png' : 'jpg';
    var safeSlot = String(slot || '時段').replace(/[\\/:*?"<>|]/g, '-');
    var blob = Utilities.newBlob(
      Utilities.base64Decode(match[2].replace(/\s/g, '')),
      match[1],
      careformId + '-' + safeSlot + '.' + extension
    );
    return folder.createFile(blob).getUrl();
  }

  function normalizeMissedPhotos_(data, careformId) {
    var stored = [];
    var payload = data.missed_visit_photos || [];
    if (payload && payload.length) {
      payload.forEach(function (item) {
        if (!item) return;
        var slot = String(item.slot || '');
        if (MISSED_SLOTS.indexOf(slot) < 0) return;
        var url = persistMissedPhoto_(item.dataUrl || item.data_url || '', careformId, slot);
        stored.push({
          slot: slot,
          fileName: item.fileName || item.file_name || '',
          url: url || '',
        });
      });
      return stored;
    }

    (data.photos || []).forEach(function (name) {
      var slot = slotFromLabel_(name);
      if (!slot) return;
      stored.push({
        slot: slot,
        fileName: String(name || ''),
        url: '',
      });
    });
    return stored;
  }

  function caseRowForAssignment_(assignmentId) {
    try {
      var assignment = AssignmentModule.get(assignmentId);
      if (!assignment || !assignment.case_id) return null;
      return CaseModule.get(assignment.case_id);
    } catch (e) {
      return null;
    }
  }

  function listMissedStamps(params) {
    params = params || {};
    var visitorIds = [];
    if (params.visitor_ids && params.visitor_ids.length) {
      visitorIds = params.visitor_ids.map(function (id) {
        return String(id || '').trim();
      }).filter(Boolean);
    } else if (params.visitor_id) {
      visitorIds = [String(params.visitor_id).trim()].filter(Boolean);
    }
    var excludeCareformId = String(params.exclude_careform_id || '').trim();
    var excludeAssignmentId = String(params.exclude_assignment_id || '').trim();
    if (!visitorIds.length) {
      return { stamp_keys: [], scanned: 0, matched: 0 };
    }

    var careforms = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    var assignments = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.ASSIGNMENTS)
    );
    var assignmentById = {};
    assignments.forEach(function (row) {
      assignmentById[String(row.assignment_id || '')] = row;
    });

    var occupied = {};
    var matched = 0;
    careforms.forEach(function (careform) {
      var careformId = String(careform.careform_id || '').trim();
      var assignmentId = String(careform.assignment_id || '').trim();
      if (excludeCareformId && careformId === excludeCareformId) return;
      if (excludeAssignmentId && assignmentId === excludeAssignmentId) return;

      var team = MissedVisitStampHelper.teamVisitorIdsFromAssignment(
        assignmentById[assignmentId] || { visitor_id: careform.visitor_id }
      );
      if (!team.length) {
        var vid = String(careform.visitor_id || '').trim();
        if (vid) team = [vid];
      }
      if (!MissedVisitStampHelper.intersects(visitorIds, team)) return;

      var texts = MissedVisitStampHelper.noteTextsFromCareform(careform);
      var stamps = [];
      texts.forEach(function (text) {
        MissedVisitStampHelper.parseStamps(text).forEach(function (stamp) {
          stamps.push(stamp);
        });
      });
      if (!stamps.length) return;
      matched += 1;
      stamps.forEach(function (stamp) {
        occupied[stamp.key] = true;
      });
    });

    return {
      stamp_keys: Object.keys(occupied),
      scanned: careforms.length,
      matched: matched,
    };
  }

  /**
   * 未遇送出：若 living_address_other／visit_notes／notes 戳記與同訪查員衝突，自動 +10 解衝突。
   */
  function autoResolveMissedStampConflicts_(data, answers) {
    var assignment = null;
    try {
      assignment = AssignmentModule.get(data.assignment_id);
    } catch (eAsg) {}
    var team = MissedVisitStampHelper.teamVisitorIdsFromAssignment(
      assignment || { visitor_id: data.visitor_id }
    );
    if (!team.length && data.visitor_id) team = [String(data.visitor_id)];
    var listed = listMissedStamps({
      visitor_ids: team,
      exclude_assignment_id: data.assignment_id,
    });
    var occupied = {};
    (listed.stamp_keys || []).forEach(function (key) {
      occupied[key] = true;
    });

    var living = String(answers.living_address_other || '');
    var visitNotes = String(answers.visit_notes || '');
    var notes = String(data.notes || '');
    var blob = [living, visitNotes, notes].join('｜');
    if (blob.indexOf('訪視未遇') === -1) {
      return { answers: answers, notes: notes, changed: false };
    }

    var resolvedLiving = MissedVisitStampHelper.uniquifyNote(living, occupied);
    resolvedLiving.stamps.forEach(function (stamp) {
      occupied[stamp.key] = true;
    });
    // visit_notes／notes 常鏡像同一段；若已改 living，同步替換同原文。
    var nextVisitNotes = visitNotes;
    var nextNotes = notes;
    if (resolvedLiving.changed && living && visitNotes.indexOf(living) !== -1) {
      nextVisitNotes = visitNotes.split(living).join(resolvedLiving.note);
    } else {
      var resolvedVisit = MissedVisitStampHelper.uniquifyNote(visitNotes, occupied);
      nextVisitNotes = resolvedVisit.note;
      resolvedVisit.stamps.forEach(function (stamp) {
        occupied[stamp.key] = true;
      });
    }
    if (resolvedLiving.changed && living && notes.indexOf(living) !== -1) {
      nextNotes = notes.split(living).join(resolvedLiving.note);
    } else {
      var resolvedNotes = MissedVisitStampHelper.uniquifyNote(nextNotes, occupied);
      nextNotes = resolvedNotes.note;
    }

    var nextAnswers = answers;
    var changed =
      resolvedLiving.changed ||
      nextVisitNotes !== visitNotes ||
      nextNotes !== notes;
    if (changed) {
      nextAnswers = Object.assign({}, answers, {
        living_address_other: resolvedLiving.note || answers.living_address_other,
        visit_notes: nextVisitNotes || answers.visit_notes,
      });
    }
    return { answers: nextAnswers, notes: nextNotes, changed: changed };
  }

  function submit(data) {
    Validation.requireFields(data, ['assignment_id', 'visitor_id', 'encoded_id']);
    var isMissed = data.visit_result === '未遇';
    var answers = data.answers || {};

    if (isMissed) {
      if (MISSED_MIN_SLOTS > 0) {
        var slotSource = (data.missed_visit_photos && data.missed_visit_photos.length)
          ? data.missed_visit_photos
          : data.photos;
        if (countMissedSlots_(slotSource) < MISSED_MIN_SLOTS) {
          var serr = new Error('未遇需至少 ' + MISSED_MIN_SLOTS + ' 個不同時段的佐證照片');
          serr.code = 'VALIDATION_ERROR';
          throw serr;
        }
      }
      var resolvedMissed = autoResolveMissedStampConflicts_(data, answers);
      answers = resolvedMissed.answers;
      data.answers = answers;
      if (resolvedMissed.notes != null) data.notes = resolvedMissed.notes;
    } else if (!data.answers) {
      var aerr = new Error('answers required');
      aerr.code = 'VALIDATION_ERROR';
      throw aerr;
    }

    var submitValidation = { ok: true, errorLines: [], errors: [] };
    if (!isMissed) {
      var caseRow = caseRowForAssignment_(data.assignment_id);
      var registryNationalId = (caseRow && (caseRow.id_number || caseRow.national_id)) || '';
      var mergedAnswers = MohwLifeCareMapper.mergeInputs({
        mohwAnswers: answers,
        caseRow: caseRow || {}
      });
      var noteBlob = String(data.notes || '');
      try {
        var asg = AssignmentModule.get(data.assignment_id);
        if (asg && asg.notes) noteBlob += '|' + String(asg.notes);
      } catch (eNotes) {}
      var deskPaper =
        noteBlob.indexOf('公所代填') !== -1 ||
        noteBlob.indexOf('紙本') !== -1 ||
        noteBlob.indexOf('desk') !== -1;
      submitValidation = MohwLifeCareValidator.validateRow(mergedAnswers, data.row || 2, {
        registryNationalId: registryNationalId,
        allowMissingWorkerNationalId: deskPaper
      });
      if (!submitValidation.ok) {
        var verr = new Error(submitValidation.errorLines.join('；'));
        verr.code = 'MOHW_VALIDATION_ERROR';
        verr.errors = submitValidation.errors;
        verr.errorLines = submitValidation.errorLines;
        throw verr;
      }
    }

    // 同派案已有「已提交／待補件／草稿」時就地覆寫，避免稽核進表修正（如 CW2）產生重複關懷表與佇列。
    var existing = get(data.assignment_id);
    var existingStatus = existing ? String(existing.status || '') : '';
    var replaceExisting =
      Boolean(existing && existing.careform_id) &&
      (existingStatus === '已提交' ||
        existingStatus === '待補件' ||
        existingStatus === '草稿');
    var careformId = replaceExisting
      ? String(existing.careform_id)
      : 'CF-' + Utilities.getUuid().slice(0, 8);
    var photoRecords = isMissed
      ? normalizeMissedPhotos_(data, careformId)
      : (data.photos || []);

    var record = {
      careform_id: careformId,
      assignment_id: data.assignment_id,
      encoded_id: data.encoded_id,
      visitor_id: data.visitor_id,
      visit_result: data.visit_result || '完成訪視',
      completion_pct: data.completion_pct || (isMissed ? 0 : 100),
      answers_json: JSON.stringify(answers),
      consent_signed: data.consent_signed || false,
      photo_urls: JSON.stringify(photoRecords),
      status: '已提交',
      submitted_at: new Date().toISOString(),
      audited_at: '',
      validation_ok: submitValidation.ok ? 'true' : 'false',
      validation_error_lines: JSON.stringify((submitValidation.errorLines || []).slice(0, 12)),
      validated_at: new Date().toISOString(),
    };
    SheetHelper.ensureColumns(SHEET, [
      'validation_ok',
      'validation_error_lines',
      'validated_at',
    ]);
    if (replaceExisting) {
      var updated = SheetHelper.updateByKey(SHEET, 'careform_id', careformId, record);
      if (updated) record = updated;
    } else {
      SheetHelper.appendRow(SHEET, record);
    }

    if (isMissed && !replaceExisting) {
      SheetHelper.appendRow(MISSED_SHEET, {
        missed_visit_id: 'MV-' + Utilities.getUuid().slice(0, 8),
        assignment_id: data.assignment_id,
        encoded_id: data.encoded_id,
        visitor_id: data.visitor_id,
        photo_urls: JSON.stringify({
          slots: photoRecords,
          gps_lat: data.gps_lat || '',
          gps_lng: data.gps_lng || '',
        }),
        notes: data.notes || '',
        recorded_at: new Date().toISOString(),
      });
    }

    // 更新派案狀態
    AssignmentModule.confirm({
      assignment_id: data.assignment_id,
      status: isMissed ? '空訪' : '已完成',
    });

    // 加入稽核佇列
    AuditModule.enqueue(record.careform_id);

    var highCare = null;
    if (!isMissed) {
      highCare = HighCareModule.upsertFromSubmit({
        answers: answers,
        careform_id: record.careform_id,
        assignment_id: record.assignment_id,
        encoded_id: record.encoded_id,
        elder_name: answers.name || '',
        case_id: data.case_id || '',
      });
    }

    ReadCache.bump();
    var assignment = AssignmentModule.get(data.assignment_id);
    ReportModule.scheduleDailyVisitSnapshot(
      String((assignment && assignment.due_date) || '').slice(0, 10) ||
        Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd')
    );
    return {
      careform: record,
      validation: submitValidation,
      highCare: highCare,
      missed_photo_count: isMissed ? photoRecords.length : 0,
    };
  }

  function validate(data) {
    data = data || {};
    var caseRow = data.assignment_id ? caseRowForAssignment_(data.assignment_id) : null;
    var merged = MohwLifeCareMapper.mergeInputs({
      mohwAnswers: data.answers || {},
      caseRow: caseRow || {}
    });
    var options = data.assignment_id
      ? { registryNationalId: (caseRow && (caseRow.id_number || caseRow.national_id)) || '' }
      : undefined;
    return MohwLifeCareValidator.validateRow(merged, data.row || 2, options);
  }

  return {
    get: get,
    saveDraft: saveDraft,
    submit: submit,
    validate: validate,
    listMissedStamps: listMissedStamps,
  };
})();
