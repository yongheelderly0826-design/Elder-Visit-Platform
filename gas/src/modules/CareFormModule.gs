var CareFormModule = (function () {
  var SHEET = Config.SHEET_NAMES.CAREFORMS;
  var MISSED_SHEET = Config.SHEET_NAMES.MISSED;
  var MISSED_SLOTS = ['上午', '中午', '下午', '傍晚', '夜間'];
  var MISSED_MIN_SLOTS = 3;

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

  function submit(data) {
    Validation.requireFields(data, ['assignment_id', 'visitor_id', 'encoded_id']);
    var isMissed = data.visit_result === '未遇';
    var answers = data.answers || {};

    if (isMissed) {
      var slotSource = (data.missed_visit_photos && data.missed_visit_photos.length)
        ? data.missed_visit_photos
        : data.photos;
      if (countMissedSlots_(slotSource) < MISSED_MIN_SLOTS) {
        var serr = new Error('未遇需至少 ' + MISSED_MIN_SLOTS + ' 個不同時段的佐證照片');
        serr.code = 'VALIDATION_ERROR';
        throw serr;
      }
    } else if (!data.answers) {
      var aerr = new Error('answers required');
      aerr.code = 'VALIDATION_ERROR';
      throw aerr;
    }

    if (!isMissed) {
      var validation = MohwLifeCareValidator.validateRow(answers, data.row || 2);
      if (!validation.ok) {
        var verr = new Error(validation.errorLines.join('；'));
        verr.code = 'MOHW_VALIDATION_ERROR';
        verr.errors = validation.errors;
        verr.errorLines = validation.errorLines;
        throw verr;
      }
    }

    var careformId = 'CF-' + Utilities.getUuid().slice(0, 8);
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
    };
    SheetHelper.appendRow(SHEET, record);

    if (isMissed) {
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
      validation: { ok: true, errorLines: [] },
      highCare: highCare,
      missed_photo_count: isMissed ? photoRecords.length : 0,
    };
  }

  function validate(data) {
    return MohwLifeCareValidator.validateRow((data && data.answers) || {}, (data && data.row) || 2);
  }

  return { get: get, saveDraft: saveDraft, submit: submit, validate: validate };
})();
