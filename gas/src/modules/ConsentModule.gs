var ConsentModule = (function () {
  var SHEET = Config.SHEET_NAMES.CONSENTS;
  var MAX_SIGNATURE_BYTES = 750000;
  var MAX_LIST_RECORDS = 200;
  var TAIPEI_TIME_ZONE = 'Asia/Taipei';
  var HEADERS = [
    'consent_id', 'template_id', 'template_version', 'title', 'signer_name', 'signer_role',
    'visitor_id', 'case_id', 'schedule_id', 'external_ref', 'signature_file_id',
    'signature_file_url', 'signature_mime_type', 'signature_file_name', 'signed_at',
    'is_test', 'field_values_json', 'metadata_json', 'pdf_file_id', 'pdf_file_url',
    'pdf_file_name', 'pdf_generated_at',
  ];
  var DOCUMENTS = {
    gov_personal_data_consent_115: {
      shortName: '個資蒐集同意書',
      title: '壹、個人資料蒐集聲明暨同意書',
      clauses: [
        '依據衛生福利部擴大獨居老人服務實施計畫辦理。',
        '取得您的個人資料，目的在於瞭解獨居老人的生活情形，並作為推動獨居老人相關政策之參考。',
        '本次蒐集、處理及利用您的個人資料，內容包括姓名、出生年月日、居住狀況、婚姻、家庭、聯絡方式、身體狀況、社會活動等，皆依個人資料保護法及相關法規辦理。',
        '為瞭解縣市獨居老人的生活情形，您同意配合衛生福利部擴大推動獨居老人服務相關政策，處理及使用您的個人資料。',
        '本聲明暨同意書如有未盡事宜，依個人資料保護法或其他相關法律之規定辦理。',
        '您瞭解此同意書符合個人資料保護法及相關法規之要求，具有書面同意衛生福利部及＿＿（縣）市政府蒐集、並依政策執行期間所需處理及使用您個人資料之效果。',
      ],
    },
    gov_social_worker_confidentiality_115: {
      shortName: '社政保密同意書',
      title: '社政訪查人員受訪資訊保密同意書',
      identityOptions: ['社會局/處', '社工', '志工', '其他'],
    },
    gov_civil_affairs_confidentiality_115: {
      shortName: '民政保密同意書',
      title: '民政訪查人員受訪資訊保密同意書',
      identityOptions: ['公所人員', '村里長', '村里幹事'],
    },
  };
  var CONFIDENTIALITY_CLAUSES = [
    '為維護公務機密及相關業務個人資料保護，對於參與獨居老人訪查作業期間接觸相關之個人秘密、隱私及持有之相關資料，負保密之責，不得無故洩露或公開。',
    '遵守「個人資料保護法」法令及各專業服務倫理規定，不私自蒐集任何資訊，不將上開資訊洩漏、複製、轉讓、再使用或交付第三人。',
    '如因違反相關法規所生之損害，本人願負法律上責任，不再擔任獨居老人訪查員後亦同。',
  ];

  function fail_(code, message) {
    var error = new Error(message);
    error.code = code;
    throw error;
  }

  function ensureSchema_() {
    SheetHelper.ensureSheet(SHEET, HEADERS);
    SheetHelper.ensureColumns(SHEET, ['pdf_file_id', 'pdf_file_url', 'pdf_file_name', 'pdf_generated_at']);
  }

  function parseJson_(value, fallback) {
    if (value && typeof value === 'object') return value;
    try {
      return value ? JSON.parse(String(value)) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function asBoolean_(value) {
    return value === true || String(value).toLowerCase() === 'true';
  }

  function getOrCreateFolder_(propertyKey, name) {
    var props = PropertiesService.getScriptProperties();
    var folderId = props.getProperty(propertyKey);
    if (folderId) {
      try {
        return DriveApp.getFolderById(folderId);
      } catch (e) {
        // Recreate when the configured folder was removed.
      }
    }
    var parentId = props.getProperty('MOHW_EXPORT_FOLDER_ID');
    var parent = parentId ? DriveApp.getFolderById(parentId) : DriveApp.getRootFolder();
    var folders = parent.getFoldersByName(name);
    var folder = folders.hasNext() ? folders.next() : parent.createFolder(name);
    props.setProperty(propertyKey, folder.getId());
    return folder;
  }

  function getSignatureFolder_() {
    return getOrCreateFolder_('CONSENT_SIGNATURE_FOLDER_ID', '電子同意書簽名');
  }

  function getPdfFolder_() {
    return getOrCreateFolder_('CONSENT_PDF_FOLDER_ID', '電子同意書');
  }

  function decodeSignature_(dataUrl) {
    var match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
    if (!match) fail_('VALIDATION_ERROR', '簽名必須是 PNG 或 JPEG data URL');
    var bytes;
    try {
      bytes = Utilities.base64Decode(match[2].replace(/\s/g, ''));
    } catch (e) {
      fail_('VALIDATION_ERROR', '簽名圖檔 base64 無法解碼');
    }
    if (!bytes.length) fail_('VALIDATION_ERROR', '簽名圖檔不可為空');
    if (bytes.length > MAX_SIGNATURE_BYTES) fail_('VALIDATION_ERROR', '簽名圖檔超過 750 KB');
    return { bytes: bytes, mimeType: match[1], extension: match[1] === 'image/png' ? 'png' : 'jpg' };
  }

  function validate_(data) {
    if (!data || !DOCUMENTS[data.template_id]) fail_('VALIDATION_ERROR', '同意書模板不存在');
    if (!String(data.signer_name || '').trim()) fail_('VALIDATION_ERROR', '簽署人姓名不可為空');
    if (!String(data.visitor_id || '').trim()) fail_('VALIDATION_ERROR', 'visitor_id 不可為空');
    var isPersonal = data.template_id === 'gov_personal_data_consent_115';
    if (isPersonal && data.signer_role !== 'elder') fail_('VALIDATION_ERROR', '個資同意書須由長者簽署');
    if (!isPersonal && data.signer_role !== 'visitor') fail_('VALIDATION_ERROR', '保密同意書須由訪員簽署');
    if (asBoolean_(data.is_test)) {
      var testMarker = (String(data.signer_name || '') + ' ' + String(data.external_ref || '')).toUpperCase();
      if (testMarker.indexOf('TEST') === -1 && testMarker.indexOf('測試簽署人') === -1) {
        fail_('VALIDATION_ERROR', 'TEST 記錄必須在簽署人或 external_ref 明確標示 TEST');
      }
    }
  }

  function attachSignature_(row) {
    if (!row || !row.signature_file_id) return row;
    try {
      var blob = DriveApp.getFileById(String(row.signature_file_id)).getBlob();
      if (blob.getBytes().length > MAX_SIGNATURE_BYTES) return row;
      row.signature_data_url =
        'data:' + (row.signature_mime_type || blob.getContentType()) + ';base64,' +
        Utilities.base64Encode(blob.getBytes());
    } catch (e) {
      row.signature_data_error = '簽名檔案不存在或無權讀取';
    }
    return row;
  }

  function normalize_(row, includeSignature) {
    var result = {};
    Object.keys(row || {}).forEach(function (key) {
      result[key] = row[key];
    });
    result.signed_at = row.signed_at instanceof Date ? row.signed_at.toISOString() : String(row.signed_at || '');
    result.pdf_generated_at = row.pdf_generated_at instanceof Date ?
      row.pdf_generated_at.toISOString() : String(row.pdf_generated_at || '');
    result.is_test = asBoolean_(row.is_test);
    result.field_values = parseJson_(row.field_values_json, {});
    result.metadata = parseJson_(row.metadata_json, {});
    if (includeSignature) attachSignature_(result);
    return result;
  }

  function findByExternalRef_(externalRef) {
    if (!externalRef) return null;
    var found = SheetHelper.findByKey(SHEET, 'external_ref', externalRef);
    return found.length ? found[0] : null;
  }

  function formatChoice_(selected, label) {
    return (String(selected) === label ? '☑ ' : '☐ ') + label;
  }

  function rocDateText_(signedAt) {
    var date = new Date(signedAt);
    if (isNaN(date.getTime())) date = new Date();
    var year = parseInt(Utilities.formatDate(date, TAIPEI_TIME_ZONE, 'yyyy'), 10) - 1911;
    var month = parseInt(Utilities.formatDate(date, TAIPEI_TIME_ZONE, 'M'), 10);
    var day = parseInt(Utilities.formatDate(date, TAIPEI_TIME_ZONE, 'd'), 10);
    return '中華民國　' + year + '　年　' + month + '　月　' + day + '　日';
  }

  function mergedTextRow_(sheet, rowNumber, text, options) {
    options = options || {};
    var range = sheet.getRange(rowNumber, 1, 1, 8);
    range.merge();
    range.setValue(text)
      .setFontFamily('Noto Serif TC')
      .setFontSize(options.fontSize || 11)
      .setFontWeight(options.bold ? 'bold' : 'normal')
      .setHorizontalAlignment(options.alignment || 'left')
      .setVerticalAlignment('middle')
      .setWrap(true);
    sheet.setRowHeight(rowNumber, options.height || Math.max(24, Math.ceil(String(text).length / 48) * 20));
    return rowNumber + 1;
  }

  function signatureRow_(sheet, rowNumber, row, label, note) {
    sheet.getRange(rowNumber, 1, 1, 2).merge()
      .setValue(label)
      .setFontFamily('Noto Serif TC')
      .setFontSize(12)
      .setHorizontalAlignment('right')
      .setVerticalAlignment('middle');
    sheet.getRange(rowNumber, 3, 1, 6).merge()
      .setBorder(false, false, true, false, false, false);
    sheet.setRowHeight(rowNumber, 76);
    var blob = DriveApp.getFileById(String(row.signature_file_id)).getBlob();
    var image = sheet.insertImage(blob, 3, rowNumber);
    var width = image.getWidth();
    var height = image.getHeight();
    var scale = Math.min(250 / width, 68 / height, 1);
    image.setWidth(Math.max(1, Math.round(width * scale)));
    image.setHeight(Math.max(1, Math.round(height * scale)));
    rowNumber += 1;
    if (note) {
      rowNumber = mergedTextRow_(sheet, rowNumber, note, {
        fontSize: 9,
        alignment: 'center',
        height: 20,
      });
    }
    return rowNumber;
  }

  function buildSpreadsheet_(row, spreadsheet) {
    var definition = DOCUMENTS[row.template_id];
    var fields = parseJson_(row.field_values_json, {});
    var sheet = spreadsheet.getSheets()[0];
    sheet.setName('同意書');
    sheet.setHiddenGridlines(true);
    for (var column = 1; column <= 8; column++) sheet.setColumnWidth(column, 82);
    var currentRow = 1;

    currentRow = mergedTextRow_(sheet, currentRow, '新北市政府', {
      bold: true, fontSize: 12, alignment: 'right', height: 24,
    });
    currentRow = mergedTextRow_(sheet, currentRow, definition.title, {
      bold: true, fontSize: 17, alignment: 'center', height: 34,
    });
    if (asBoolean_(row.is_test)) {
      currentRow = mergedTextRow_(sheet, currentRow, 'TEST 測試資料（不進正式匯出／核銷）', {
        bold: true, fontSize: 10, alignment: 'center', height: 22,
      });
    }

    if (row.template_id === 'gov_personal_data_consent_115') {
      var numbers = ['一', '二', '三', '四', '五', '六'];
      definition.clauses.forEach(function (clause, index) {
        currentRow = mergedTextRow_(sheet, currentRow, numbers[index] + '、' + clause);
      });
      currentRow = mergedTextRow_(sheet, currentRow,
        '我已詳閱本同意書，' +
        formatChoice_(fields.personal_data_use_consent, '同意') + '　' +
        formatChoice_(fields.personal_data_use_consent, '不同意') +
        '　個人資料於上開範圍內使用。'
      );
      currentRow = mergedTextRow_(sheet, currentRow, '貳、請勾健康資料串聯的意願', {
        bold: true, fontSize: 13, height: 26,
      });
      currentRow = mergedTextRow_(sheet, currentRow,
        '我 ' + formatChoice_(fields.health_database_link_consent, '同意') + '　' +
        formatChoice_(fields.health_database_link_consent, '不同意') +
        '　將這次生活關懷表訪查結果，供國家型健康資料庫（如健保資料、長照資料等）分析使用，' +
        '僅作為115-116年度獨居老人政策服務成效評估用途。'
      );
      currentRow = signatureRow_(sheet, currentRow, row, '立書人：', '（須本人簽名、蓋章或手印）');
    } else {
      currentRow = mergedTextRow_(sheet, currentRow,
        '立同意書人　' + row.signer_name +
        '　同意於參與○○縣／市辦理「擴大獨居老人服務計畫」期間，遵守以下事項：'
      );
      var clauseNumbers = ['一', '二', '三'];
      CONFIDENTIALITY_CLAUSES.forEach(function (clause, index) {
        currentRow = mergedTextRow_(sheet, currentRow, clauseNumbers[index] + '、' + clause);
      });
      currentRow = signatureRow_(sheet, currentRow, row, '立同意書人：');
      currentRow = mergedTextRow_(sheet, currentRow,
        '身分：' + definition.identityOptions.map(function (option) {
          return formatChoice_(fields.identity_type, option);
        }).join('　')
      );
      currentRow = mergedTextRow_(sheet, currentRow, '身分證字號：' + String(fields.national_id || ''));
      currentRow = mergedTextRow_(sheet, currentRow, '聯絡電話：' + String(fields.phone || ''));
    }
    currentRow = mergedTextRow_(sheet, currentRow, rocDateText_(row.signed_at), {
      fontSize: 12, alignment: 'center', height: 28,
    });
    currentRow = mergedTextRow_(
      sheet,
      currentRow,
      '紀錄編號：' + row.consent_id + '　版本：' + String(row.template_version || ''),
      { fontSize: 8, height: 20 }
    );
    sheet.getRange(1, 1, currentRow - 1, 8)
      .setBorder(true, true, true, true, false, false, '#222222', SpreadsheetApp.BorderStyle.SOLID);
    spreadsheet.setActiveSheet(sheet);
    SpreadsheetApp.flush();
    return {
      spreadsheetId: spreadsheet.getId(),
      sheetId: sheet.getSheetId(),
    };
  }

  function exportSpreadsheetPdf_(spreadsheetId, sheetId, fileName) {
    var query = [
      'format=pdf',
      'size=A4',
      'portrait=true',
      'scale=4',
      'sheetnames=false',
      'printtitle=false',
      'pagenumbers=false',
      'gridlines=false',
      'fzr=false',
      'top_margin=0.35',
      'bottom_margin=0.35',
      'left_margin=0.45',
      'right_margin=0.45',
      'gid=' + encodeURIComponent(sheetId),
    ].join('&');
    var response = UrlFetchApp.fetch(
      'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(spreadsheetId) + '/export?' + query,
      {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true,
      }
    );
    if (response.getResponseCode() !== 200) {
      fail_(
        'PDF_GENERATION_FAILED',
        'Google Sheets PDF 匯出失敗（HTTP ' + response.getResponseCode() + '），可重試'
      );
    }
    return response.getBlob().setContentType(MimeType.PDF).setName(fileName);
  }

  function safeFilePart_(value, fallback) {
    var clean = String(value || '')
      .replace(/[\\\/:*?"<>|\u0000-\u001f]/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/^\.+|\.+$/g, '')
      .trim()
      .substring(0, 80);
    return clean || fallback;
  }

  function pdfFileName_(row) {
    var signedAt = new Date(row.signed_at);
    if (isNaN(signedAt.getTime())) signedAt = new Date();
    var date = Utilities.formatDate(signedAt, TAIPEI_TIME_ZONE, 'yyyy-MM-dd');
    var shortCode = String(row.consent_id || '').replace(/^CONSENT-/, '').substring(0, 8);
    return [
      date,
      safeFilePart_(row.signer_name, '未具名'),
      safeFilePart_(DOCUMENTS[row.template_id].shortName, '同意書'),
      safeFilePart_(shortCode, 'record'),
    ].join('_') + '.pdf';
  }

  function existingPdfIsReadable_(row) {
    if (!row.pdf_file_id) return false;
    try {
      DriveApp.getFileById(String(row.pdf_file_id)).getId();
      return true;
    } catch (e) {
      return false;
    }
  }

  function generatePdfForRow_(row) {
    if (!row || !row.consent_id) fail_('NOT_FOUND', '找不到電子同意書');
    if (!DOCUMENTS[row.template_id]) fail_('VALIDATION_ERROR', '同意書模板不存在');
    if (!row.signature_file_id) fail_('PDF_GENERATION_FAILED', '簽名圖檔不存在，無法產生 PDF');
    if (existingPdfIsReadable_(row)) return normalize_(row, false);

    var tempSpreadsheetFile = null;
    var tempSpreadsheetId = '';
    var pdfFile = null;
    try {
      var tempSpreadsheet = SpreadsheetApp.create('電子同意書暫存-' + row.consent_id, 40, 8);
      tempSpreadsheetId = tempSpreadsheet.getId();
      tempSpreadsheetFile = DriveApp.getFileById(tempSpreadsheetId);
      var temporary = buildSpreadsheet_(row, tempSpreadsheet);
      var folder = getPdfFolder_();
      var fileName = pdfFileName_(row);
      var pdfBlob = exportSpreadsheetPdf_(temporary.spreadsheetId, temporary.sheetId, fileName);
      pdfFile = folder.createFile(pdfBlob);
      var generatedAt = new Date().toISOString();
      var updated = SheetHelper.updateByKey(SHEET, 'consent_id', row.consent_id, {
        pdf_file_id: pdfFile.getId(),
        pdf_file_url: pdfFile.getUrl(),
        pdf_file_name: fileName,
        pdf_generated_at: generatedAt,
      });
      if (!updated) {
        pdfFile.setTrashed(true);
        fail_('NOT_FOUND', 'PDF 已產生但找不到同意書列，檔案已移至垃圾桶');
      }
      return normalize_(updated, false);
    } catch (error) {
      if (pdfFile) {
        try {
          pdfFile.setTrashed(true);
        } catch (trashError) {
          Logger.log('Failed to trash orphan PDF: ' + trashError);
        }
      }
      if (error && error.code) throw error;
      fail_('PDF_GENERATION_FAILED', '同意書已保存，但 PDF 產生失敗，可用 consent.generatePdf 重試：' + error.message);
    } finally {
      if (tempSpreadsheetFile) {
        try {
          tempSpreadsheetFile.setTrashed(true);
        } catch (tempError) {
          Logger.log('Failed to trash temporary spreadsheet: ' + tempError);
        }
      } else if (tempSpreadsheetId) {
        try {
          DriveApp.getFileById(tempSpreadsheetId).setTrashed(true);
        } catch (lookupError) {
          Logger.log('Failed to find temporary spreadsheet for cleanup: ' + lookupError);
        }
      }
    }
  }

  function generatePdf(data) {
    ensureSchema_();
    data = data || {};
    var consentId = String(data.consent_id || data.id || '');
    if (!consentId) fail_('VALIDATION_ERROR', 'consent_id 不可為空');
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var found = SheetHelper.findByKey(SHEET, 'consent_id', consentId);
      if (!found.length) fail_('NOT_FOUND', '找不到電子同意書');
      return generatePdfForRow_(found[0]);
    } finally {
      lock.releaseLock();
    }
  }

  function sign(data) {
    ensureSchema_();
    validate_(data);
    var signature = decodeSignature_(data.signature_data_url);
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var existing = findByExternalRef_(String(data.external_ref || ''));
      if (existing) {
        if (!existingPdfIsReadable_(existing)) existing = generatePdfForRow_(existing);
        return normalize_(existing, true);
      }

      var consentId = 'CONSENT-' + Utilities.getUuid();
      var safeTemplate = String(data.template_id).replace(/[^A-Za-z0-9_-]/g, '_');
      var fileName = safeTemplate + '_' + consentId + '.' + signature.extension;
      var blob = Utilities.newBlob(signature.bytes, signature.mimeType, fileName);
      var file = getSignatureFolder_().createFile(blob);
      // Do not call setSharing: the folder and files retain private inherited access.
      var row = {
        consent_id: consentId,
        template_id: String(data.template_id),
        template_version: String(data.template_version || ''),
        title: String(data.title || DOCUMENTS[data.template_id].title),
        signer_name: String(data.signer_name || '').trim(),
        signer_role: String(data.signer_role || ''),
        visitor_id: String(data.visitor_id || ''),
        case_id: String(data.case_id || ''),
        schedule_id: String(data.schedule_id || ''),
        external_ref: String(data.external_ref || ''),
        signature_file_id: file.getId(),
        signature_file_url: file.getUrl(),
        signature_mime_type: signature.mimeType,
        signature_file_name: fileName,
        signed_at: new Date().toISOString(),
        is_test: asBoolean_(data.is_test),
        field_values_json: JSON.stringify(data.field_values || {}),
        metadata_json: JSON.stringify(data.metadata || {}),
        pdf_file_id: '',
        pdf_file_url: '',
        pdf_file_name: '',
        pdf_generated_at: '',
      };
      try {
        SheetHelper.appendRow(SHEET, row);
      } catch (error) {
        file.setTrashed(true);
        throw error;
      }
      var generated = generatePdfForRow_(row);
      return normalize_(generated, true);
    } finally {
      lock.releaseLock();
    }
  }

  function list(params) {
    ensureSchema_();
    params = params || {};
    var limit = Math.min(Math.max(parseInt(params.limit || '100', 10) || 100, 1), MAX_LIST_RECORDS);
    var includeSignature = asBoolean_(params.include_signature);
    if (includeSignature) limit = Math.min(limit, 50);
    return SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET))
      .filter(function (row) {
        if (params.template_id && String(row.template_id) !== String(params.template_id)) return false;
        if (params.external_ref && String(row.external_ref) !== String(params.external_ref)) return false;
        if (params.visitor_id && String(row.visitor_id) !== String(params.visitor_id)) return false;
        return true;
      })
      .slice(-limit)
      .reverse()
      .map(function (row) { return normalize_(row, includeSignature); });
  }

  function get(id, params) {
    ensureSchema_();
    var found = SheetHelper.findByKey(SHEET, 'consent_id', id);
    if (!found.length) fail_('NOT_FOUND', '找不到電子同意書');
    return normalize_(found[0], !params || params.include_signature !== 'false');
  }

  return {
    list: list,
    sign: sign,
    get: get,
    generatePdf: generatePdf,
  };
})();
