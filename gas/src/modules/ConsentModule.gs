var ConsentModule = (function () {
  var SHEET = Config.SHEET_NAMES.CONSENTS;
  var MAX_SIGNATURE_BYTES = 750000;
  var MAX_LIST_RECORDS = 200;
  var HEADERS = [
    'consent_id', 'template_id', 'template_version', 'title', 'signer_name', 'signer_role',
    'visitor_id', 'case_id', 'schedule_id', 'external_ref', 'signature_file_id',
    'signature_file_url', 'signature_mime_type', 'signature_file_name', 'signed_at',
    'is_test', 'field_values_json', 'metadata_json',
  ];
  var TEMPLATE_IDS = {
    gov_personal_data_consent_115: true,
    gov_social_worker_confidentiality_115: true,
    gov_civil_affairs_confidentiality_115: true,
  };

  function fail_(code, message) {
    var error = new Error(message);
    error.code = code;
    throw error;
  }

  function ensureSchema_() {
    SheetHelper.ensureSheet(SHEET, HEADERS);
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

  function getSignatureFolder_() {
    var props = PropertiesService.getScriptProperties();
    var folderId = props.getProperty('CONSENT_SIGNATURE_FOLDER_ID');
    if (folderId) {
      try {
        return DriveApp.getFolderById(folderId);
      } catch (e) {
        // Recreate when the configured folder was removed.
      }
    }
    var parentId = props.getProperty('MOHW_EXPORT_FOLDER_ID');
    var parent = parentId ? DriveApp.getFolderById(parentId) : DriveApp.getRootFolder();
    var folders = parent.getFoldersByName('電子同意書簽名');
    var folder = folders.hasNext() ? folders.next() : parent.createFolder('電子同意書簽名');
    props.setProperty('CONSENT_SIGNATURE_FOLDER_ID', folder.getId());
    return folder;
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
    if (!data || !TEMPLATE_IDS[data.template_id]) fail_('VALIDATION_ERROR', '同意書模板不存在');
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

  function sign(data) {
    ensureSchema_();
    validate_(data);
    var signature = decodeSignature_(data.signature_data_url);
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var existing = findByExternalRef_(String(data.external_ref || ''));
      if (existing) return normalize_(existing, true);

      var consentId = 'CONSENT-' + Utilities.getUuid();
      var safeTemplate = String(data.template_id).replace(/[^A-Za-z0-9_-]/g, '_');
      var fileName = safeTemplate + '_' + consentId + '.' + signature.extension;
      var blob = Utilities.newBlob(signature.bytes, signature.mimeType, fileName);
      var file = getSignatureFolder_().createFile(blob);
      // Intentionally do not call setSharing: Drive's inherited private access is retained.
      var row = {
        consent_id: consentId,
        template_id: String(data.template_id),
        template_version: String(data.template_version || ''),
        title: String(data.title || ''),
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
      };
      try {
        SheetHelper.appendRow(SHEET, row);
      } catch (error) {
        file.setTrashed(true);
        throw error;
      }
      return normalize_(row, true);
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
  };
})();
