var ConsentModule = (function () {
  var SHEET = Config.SHEET_NAMES.CONSENTS;
  var MAX_SIGNATURE_BYTES = 750000;
  var MAX_LIST_RECORDS = 200;
  var TAIPEI_TIME_ZONE = 'Asia/Taipei';
  var DEFAULT_TEMPLATE_SPREADSHEET_ID = '1JhdX3JI9a5_IJlxu0rjGV2RWZGNHFfm05vJy2m__d8s';
  var TEMPLATE_RENDER_VERSION = 'formal-v4';
  var HEADERS = [
    'consent_id', 'template_id', 'template_version', 'title', 'signer_name', 'signer_role',
    'visitor_id', 'case_id', 'schedule_id', 'external_ref', 'signature_file_id',
    'signature_file_url', 'signature_mime_type', 'signature_file_name', 'signed_at',
    'is_test', 'field_values_json', 'metadata_json', 'pdf_file_id', 'pdf_file_url',
    'pdf_file_name', 'pdf_generated_at', 'pdf_template_key',
    'signature_folder_id', 'signature_folder_url', 'pdf_folder_id', 'pdf_folder_url',
  ];
  var DOCUMENTS = {
    gov_personal_data_consent_115: {
      shortName: '個資蒐集同意書',
      title: '壹、個人資料蒐集聲明暨同意書',
      sheetName: '個資蒐集暨健康資料串聯同意書',
      folderName: '個資蒐集暨健康資料串聯同意書',
      pdfFolderProperty: 'CONSENT_PERSONAL_DATA_PDF_FOLDER_ID',
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
      sheetName: '社政訪查人員保密同意書',
      folderName: '社政訪查人員保密同意書',
      pdfFolderProperty: 'CONSENT_SOCIAL_WORKER_PDF_FOLDER_ID',
      identityOptions: ['社會局/處', '社工', '志工', '其他'],
    },
    gov_civil_affairs_confidentiality_115: {
      shortName: '民政保密同意書',
      title: '民政訪查人員受訪資訊保密同意書',
      sheetName: '民政訪查人員保密同意書',
      folderName: '民政訪查人員保密同意書',
      pdfFolderProperty: 'CONSENT_CIVIL_AFFAIRS_PDF_FOLDER_ID',
      identityOptions: ['公所人員', '村里長', '村里幹事'],
    },
  };
  function fail_(code, message) {
    var error = new Error(message);
    error.code = code;
    throw error;
  }

  function ensureSchema_() {
    SheetHelper.ensureSheet(SHEET, HEADERS);
    SheetHelper.ensureColumns(SHEET, HEADERS);
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

  function getFolderFromProperty_(propertyKey) {
    var props = PropertiesService.getScriptProperties();
    var folderId = props.getProperty(propertyKey);
    if (folderId) {
      try {
        return DriveApp.getFolderById(folderId);
      } catch (e) {
        props.deleteProperty(propertyKey);
      }
    }
    return null;
  }

  function getOrCreateChildFolder_(parent, propertyKey, name) {
    var props = PropertiesService.getScriptProperties();
    var configured = getFolderFromProperty_(propertyKey);
    if (configured && configured.getName() === name && folderHasParent_(configured, parent.getId())) {
      return configured;
    }
    var folders = parent.getFoldersByName(name);
    var folder = folders.hasNext() ? folders.next() : parent.createFolder(name);
    props.setProperty(propertyKey, folder.getId());
    return folder;
  }

  function folderHasParent_(folder, parentId) {
    var parents = folder.getParents();
    while (parents.hasNext()) {
      if (parents.next().getId() === parentId) return true;
    }
    return false;
  }

  function getConsentRootFolder_() {
    var props = PropertiesService.getScriptProperties();
    var configured = getFolderFromProperty_('CONSENT_ROOT_FOLDER_ID');
    if (configured && configured.getName() === '電子同意書') return configured;
    var legacy = getFolderFromProperty_('CONSENT_PDF_FOLDER_ID');
    if (legacy && legacy.getName() === '電子同意書') {
      props.setProperty('CONSENT_ROOT_FOLDER_ID', legacy.getId());
      return legacy;
    }
    var parentId = props.getProperty('MOHW_EXPORT_FOLDER_ID');
    var parent = parentId ? DriveApp.getFolderById(parentId) : DriveApp.getRootFolder();
    var folders = parent.getFoldersByName('電子同意書');
    var folder = folders.hasNext() ? folders.next() : parent.createFolder('電子同意書');
    props.setProperty('CONSENT_ROOT_FOLDER_ID', folder.getId());
    props.setProperty('CONSENT_PDF_FOLDER_ID', folder.getId());
    return folder;
  }

  function getSignatureFolder_() {
    return getOrCreateChildFolder_(
      getConsentRootFolder_(),
      'CONSENT_SIGNATURE_FOLDER_ID',
      '簽名檔'
    );
  }

  function getPdfFolder_(templateId) {
    var definition = DOCUMENTS[templateId];
    if (!definition) fail_('VALIDATION_ERROR', '同意書模板不存在');
    return getOrCreateChildFolder_(
      getConsentRootFolder_(),
      definition.pdfFolderProperty,
      definition.folderName
    );
  }

  function folderUrl_(folder) {
    return 'https://drive.google.com/drive/folders/' + folder.getId();
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
    result.pdf_template_key = String(row.pdf_template_key || '');
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

  function rocDateText_(signedAt) {
    var date = new Date(signedAt);
    if (isNaN(date.getTime())) date = new Date();
    var year = parseInt(Utilities.formatDate(date, TAIPEI_TIME_ZONE, 'yyyy'), 10) - 1911;
    var month = parseInt(Utilities.formatDate(date, TAIPEI_TIME_ZONE, 'M'), 10);
    var day = parseInt(Utilities.formatDate(date, TAIPEI_TIME_ZONE, 'd'), 10);
    return '中華民國　' + year + '　年　' + month + '　月　' + day + '　日';
  }

  function templateSpreadsheetId_() {
    return PropertiesService.getScriptProperties().getProperty(
      'CONSENT_TEMPLATE_SPREADSHEET_ID'
    ) || DEFAULT_TEMPLATE_SPREADSHEET_ID;
  }

  function templateSheetName_(templateId) {
    var definition = DOCUMENTS[templateId];
    if (!definition) fail_('VALIDATION_ERROR', '同意書模板不存在');
    return definition.sheetName;
  }

  function templateKey_(templateId) {
    return templateSpreadsheetId_() + ':' + templateSheetName_(templateId) + ':' + TEMPLATE_RENDER_VERSION;
  }

  function findCells_(sheet, pattern) {
    return sheet.createTextFinder(pattern)
      .useRegularExpression(true)
      .matchCase(false)
      .findAll();
  }

  function requireLocatorResult_(result, description) {
    if (!result || (typeof result.length === 'number' && result.length === 0)) {
      fail_('PDF_TEMPLATE_LOCATOR_FAILED', '正式模板定位失敗：找不到' + description);
    }
    return result;
  }

  function findRequiredCell_(sheet, pattern, description) {
    return requireLocatorResult_(findCells_(sheet, pattern), description)[0];
  }

  function effectiveRange_(cell) {
    var merged = cell.getMergedRanges();
    return merged.length ? merged[0] : cell;
  }

  function setCheckboxInCell_(cell, label, checked) {
    var escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return setCheckboxPatternInCell_(cell, escaped, checked);
  }

  function setCheckboxPatternInCell_(cell, labelPattern, checked) {
    var text = String(cell.getDisplayValue() || '');
    var marker = checked ? '■' : '□';
    var before = new RegExp('([□☐☑■▣✓✔])\\s*(' + labelPattern + ')');
    var after = new RegExp('(' + labelPattern + ')\\s*([□☐☑■▣✓✔])');
    if (before.test(text)) {
      cell.setValue(text.replace(before, marker + '$2'));
      return true;
    }
    if (after.test(text)) {
      cell.setValue(text.replace(after, '$1' + marker));
      return true;
    }
    return false;
  }

  function setNearbyCheckbox_(sheet, labelCell, checked) {
    if (setCheckboxInCell_(labelCell, String(labelCell.getDisplayValue()).trim(), checked)) return true;
    var row = labelCell.getRow();
    var column = labelCell.getColumn();
    var marker = checked ? '■' : '□';
    for (var offset = -4; offset <= 4; offset++) {
      if (offset === 0) continue;
      var adjacentColumn = column + offset;
      if (adjacentColumn < 1 || adjacentColumn > sheet.getMaxColumns()) continue;
      var adjacent = sheet.getRange(row, adjacentColumn);
      if (/^[□☐☑■▣✓✔]$/.test(String(adjacent.getDisplayValue()).trim())) {
        adjacent.setValue(marker);
        return true;
      }
    }
    return false;
  }

  function applyBinaryChoice_(sheet, startRow, endRow, selected, description) {
    if (selected !== '同意' && selected !== '不同意') {
      fail_('PDF_TEMPLATE_LOCATOR_FAILED', description + '的值必須是同意或不同意');
    }
    var labels = ['不同意', '同意'];
    var changed = { '同意': false, '不同意': false };
    findCells_(sheet, '不同意').forEach(function (cell) {
      if (cell.getRow() < startRow || cell.getRow() > endRow) return;
      var range = effectiveRange_(cell);
      var text = String(range.getDisplayValue() || cell.getDisplayValue() || '');
      if (!/(^|[^不])同意(?!書)/.test(text)) return;
      text = text.replace(
        /[□☐☑■▣✓✔]?\s*不同意/g,
        (selected === '不同意' ? '■' : '□') + '不同意'
      );
      text = text.replace(
        /(^|[^不])([□☐☑■▣✓✔]?\s*)同意(?!書)/g,
        '$1' + (selected === '同意' ? '■' : '□') + '同意'
      );
      range.setValue(text);
      changed['同意'] = true;
      changed['不同意'] = true;
    });
    labels.forEach(function (label) {
      findCells_(sheet, label).forEach(function (cell) {
        if (cell.getRow() < startRow || cell.getRow() > endRow) return;
        var text = String(cell.getDisplayValue() || '');
        if (label === '同意' && !/(^|[^不])同意(?!書)/.test(text)) return;
        if (
          setCheckboxInCell_(cell, label, selected === label) ||
          setNearbyCheckbox_(sheet, cell, selected === label)
        ) changed[label] = true;
      });
    });
    requireLocatorResult_(changed['同意'] && changed['不同意'] ? [true] : [], description + '的同意／不同意選項');
  }

  function fillDate_(sheet, signedAt) {
    var cells = requireLocatorResult_(
      findCells_(sheet, '中\\s*華\\s*民\\s*國'),
      '中華民國日期欄'
    );
    var target = cells[cells.length - 1];
    var range = effectiveRange_(target);
    var date = new Date(signedAt);
    if (isNaN(date.getTime())) date = new Date();
    var parts = [
      { label: '年', value: Utilities.formatDate(date, TAIPEI_TIME_ZONE, 'yyyy') - 1911 },
      { label: '月', value: Number(Utilities.formatDate(date, TAIPEI_TIME_ZONE, 'M')) },
      { label: '日', value: Number(Utilities.formatDate(date, TAIPEI_TIME_ZONE, 'd')) },
    ];
    range.setValue('中華民國');
    var previous = range;
    parts.forEach(function (part) {
      var markers = findCells_(sheet, '^[\\s　]*' + part.label + '[\\s　]*$').filter(function (cell) {
        return cell.getRow() === target.getRow() && cell.getColumn() > previous.getColumn();
      });
      var marker = requireLocatorResult_(markers, '日期的「' + part.label + '」欄')[0];
      var valueRange = findBlankBetween_(sheet, previous, marker);
      requireLocatorResult_(valueRange ? [valueRange] : [], '日期的「' + part.label + '」數值欄');
      valueRange.setValue(part.value);
      previous = effectiveRange_(marker);
    });
  }

  function fillLabelValue_(sheet, pattern, description, value) {
    var cell = findRequiredCell_(sheet, pattern, description);
    var range = effectiveRange_(cell);
    var text = String(range.getDisplayValue() || cell.getDisplayValue() || '');
    var right = findBlankRightRange_(sheet, range);
    if (right) {
      right.setValue(value);
      return;
    }
    var colon = Math.max(text.indexOf('：'), text.indexOf(':'));
    if (colon !== -1) {
      range.setValue(text.substring(0, colon + 1) + value);
      return;
    }
    requireLocatorResult_(right ? [right] : [], description + '後方填值範圍');
    right.setValue(value);
  }

  function findBlankRightRange_(sheet, labelRange) {
    var row = labelRange.getRow();
    var startColumn = labelRange.getColumn() + labelRange.getNumColumns();
    var seen = {};
    var best = null;
    var bestScore = -1;
    for (var column = startColumn; column <= sheet.getLastColumn(); column++) {
      var candidate = effectiveRange_(sheet.getRange(row, column));
      var key = candidate.getA1Notation();
      if (seen[key]) continue;
      seen[key] = true;
      if (candidate.getRow() !== row || String(candidate.getDisplayValue()).trim()) continue;
      var score = candidate.getNumColumns() * 100 + rangePixelWidth_(sheet, candidate);
      if (candidate.getNumColumns() > 1) score += 10000;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  }

  function findBlankBetween_(sheet, leftRange, rightCell) {
    var row = leftRange.getRow();
    if (rightCell.getRow() !== row) return null;
    var startColumn = leftRange.getColumn() + leftRange.getNumColumns();
    var endColumn = rightCell.getColumn() - 1;
    var seen = {};
    var best = null;
    var bestScore = -1;
    for (var column = startColumn; column <= endColumn; column++) {
      var candidate = effectiveRange_(sheet.getRange(row, column));
      var key = candidate.getA1Notation();
      if (seen[key]) continue;
      seen[key] = true;
      if (
        candidate.getRow() !== row ||
        candidate.getColumn() < startColumn ||
        candidate.getColumn() + candidate.getNumColumns() - 1 > endColumn ||
        String(candidate.getDisplayValue()).trim()
      ) continue;
      var score = candidate.getNumColumns() * 100 + rangePixelWidth_(sheet, candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  }

  function rangePixelWidth_(sheet, range) {
    var width = 0;
    for (var column = range.getColumn(); column < range.getColumn() + range.getNumColumns(); column++) {
      width += sheet.getColumnWidth(column);
    }
    return width;
  }

  function rangePixelHeight_(sheet, range) {
    var height = 0;
    for (var row = range.getRow(); row < range.getRow() + range.getNumRows(); row++) {
      height += sheet.getRowHeight(row);
    }
    return height;
  }

  function putSignature_(sheet, labelPattern, description, signatureFileId, excludePattern, signerName) {
    var cells = requireLocatorResult_(findCells_(sheet, labelPattern), description + '標籤');
    var labelCell = null;
    cells.forEach(function (cell) {
      var text = String(cell.getDisplayValue() || '');
      if (!labelCell && (!excludePattern || !excludePattern.test(text))) labelCell = cell;
    });
    requireLocatorResult_(labelCell ? [labelCell] : [], description + '簽署欄');
    var labelRange = effectiveRange_(labelCell);
    var target = findBlankRightRange_(sheet, labelRange);
    var anchorColumn;
    var maxWidth;
    var maxHeight;
    if (target) {
      if (signerName) target.setValue(signerName);
      anchorColumn = target.getColumn();
      maxWidth = Math.max(40, rangePixelWidth_(sheet, target) - 8);
      maxHeight = Math.max(24, rangePixelHeight_(sheet, target) - 6);
    } else if (labelRange.getNumColumns() >= 8) {
      var offset = Math.max(4, Math.floor(labelRange.getNumColumns() * 0.18));
      anchorColumn = labelRange.getColumn() + Math.min(offset, labelRange.getNumColumns() - 1);
      var remainingColumns = labelRange.getNumColumns() - (anchorColumn - labelRange.getColumn());
      var imageArea = sheet.getRange(labelRange.getRow(), anchorColumn, 1, remainingColumns);
      sheet.setRowHeight(labelRange.getRow(), Math.max(sheet.getRowHeight(labelRange.getRow()), 64));
      maxWidth = Math.max(40, rangePixelWidth_(sheet, imageArea) - 8);
      maxHeight = Math.max(24, sheet.getRowHeight(labelRange.getRow()) - 6);
    } else {
      requireLocatorResult_([], description + '後方空白或寬版簽署範圍');
    }
    var blob = DriveApp.getFileById(String(signatureFileId)).getBlob();
    requireLocatorResult_(blob.getBytes().length ? [blob] : [], description + '簽名圖片');
    var image = sheet.insertImage(blob, anchorColumn, labelRange.getRow());
    var width = image.getWidth();
    var height = image.getHeight();
    var scale = Math.min(maxWidth / width, maxHeight / height, 1);
    image.setWidth(Math.max(1, Math.round(width * scale)));
    image.setHeight(Math.max(1, Math.round(height * scale)));
    if (typeof image.setAnchorCellXOffset === 'function') image.setAnchorCellXOffset(4);
    if (typeof image.setAnchorCellYOffset === 'function') image.setAnchorCellYOffset(3);
    requireLocatorResult_(image ? [image] : [], description + '簽名圖片插入結果');
  }

  function fillConfidentialSigner_(sheet, signerName) {
    var cells = requireLocatorResult_(findCells_(sheet, '立同意書人'), '立同意書人欄');
    var introFilled = false;
    var introCells = requireLocatorResult_(findCells_(sheet, '同意於'), '前言的同意於欄');
    cells.forEach(function (cell) {
      var range = effectiveRange_(cell);
      var text = String(range.getDisplayValue() || cell.getDisplayValue() || '');
      if (!introFilled && /(同意於|參與)/.test(text)) {
        var updated = text.replace(
          /(立同意書人)[\s　＿_：:]*(?=(?:同意於|參與))/,
          '$1　' + signerName + '　'
        );
        if (updated === text) {
          updated = text.replace('立同意書人', '立同意書人　' + signerName + '　');
        }
        range.setValue(updated);
        introFilled = true;
      } else if (!introFilled && text.indexOf('：') === -1 && text.indexOf(':') === -1) {
        introCells.forEach(function (introCell) {
          if (introFilled || introCell.getRow() !== range.getRow()) return;
          var target = findBlankBetween_(sheet, range, introCell);
          if (!target) return;
          target.setValue(signerName);
          introFilled = true;
        });
      }
    });
    requireLocatorResult_(introFilled ? [true] : [], '前言的立同意書人姓名空格');
    findCells_(sheet, '○○縣[／/]市').forEach(function (cell) {
      var range = effectiveRange_(cell);
      range.setValue(String(range.getDisplayValue() || '').replace(/○○縣[／/]市/g, '新北市'));
    });
  }

  function applyIdentity_(sheet, definition, selected) {
    if (definition.identityOptions.indexOf(selected) === -1) {
      fail_('PDF_TEMPLATE_LOCATOR_FAILED', '正式模板填值失敗：身分選項不合法');
    }
    var anchor = findRequiredCell_(sheet, '身分\\s*[：:]?', '身分欄');
    var idCell = findRequiredCell_(sheet, '身分證', '身分證字號欄');
    var startRow = anchor.getRow();
    var endRow = Math.max(startRow, idCell.getRow() - 1);
    definition.identityOptions.forEach(function (option) {
      var found = false;
      var optionPattern = option.replace('/', '\\s*[／/]\\s*');
      findCells_(sheet, optionPattern).forEach(function (cell) {
        if (cell.getRow() < startRow || cell.getRow() > endRow) return;
        if (setCheckboxPatternInCell_(cell, optionPattern, selected === option) ||
            setNearbyCheckbox_(sheet, cell, selected === option)) found = true;
      });
      requireLocatorResult_(found ? [true] : [], '身分選項「' + option + '」');
    });
  }

  function populateTemplate_(sheet, row) {
    var definition = DOCUMENTS[row.template_id];
    var fields = parseJson_(row.field_values_json, {});
    if (row.template_id === 'gov_personal_data_consent_115') {
      var personalAnchor = findRequiredCell_(
        sheet,
        '個人資料.*(?:蒐集|同意)',
        '個人資料同意區段'
      );
      var healthAnchor = findRequiredCell_(
        sheet,
        '(?:健康資料.*串聯|串聯.*健康資料)',
        '健康資料串聯區段'
      );
      requireLocatorResult_(
        healthAnchor.getRow() > personalAnchor.getRow() ? [true] : [],
        '個資與健康資料區段順序'
      );
      applyBinaryChoice_(
        sheet,
        personalAnchor.getRow(),
        healthAnchor.getRow() - 1,
        String(fields.personal_data_use_consent || ''),
        '個人資料使用'
      );
      applyBinaryChoice_(
        sheet,
        healthAnchor.getRow(),
        sheet.getLastRow(),
        String(fields.health_database_link_consent || ''),
        '健康資料串聯'
      );
      putSignature_(sheet, '立書人\\s*[：:]?', '立書人', row.signature_file_id);
    } else {
      fillConfidentialSigner_(sheet, row.signer_name);
      applyIdentity_(sheet, definition, String(fields.identity_type || ''));
      fillLabelValue_(sheet, '身分證(?:字號)?\\s*[：:]?', '身分證字號', String(fields.national_id || ''));
      fillLabelValue_(sheet, '聯絡電話\\s*[：:]?', '聯絡電話', String(fields.phone || ''));
      putSignature_(
        sheet,
        '立同意書人\\s*[：:]',
        '立同意書人',
        row.signature_file_id,
        /(同意於|參與)/,
        row.signer_name
      );
    }
    fillDate_(sheet, row.signed_at);
    SpreadsheetApp.flush();
  }

  function copyTemplateSheet_(row, spreadsheet) {
    var sourceSpreadsheet;
    try {
      sourceSpreadsheet = SpreadsheetApp.openById(templateSpreadsheetId_());
    } catch (error) {
      fail_('PDF_TEMPLATE_OPEN_FAILED', '無法開啟正式同意書模板試算表：' + error.message);
    }
    var sourceSheet = sourceSpreadsheet.getSheetByName(templateSheetName_(row.template_id));
    requireLocatorResult_(sourceSheet ? [sourceSheet] : [], '正式模板分頁「' + templateSheetName_(row.template_id) + '」');
    var copied = sourceSheet.copyTo(spreadsheet);
    spreadsheet.getSheets().forEach(function (sheet) {
      if (sheet.getSheetId() !== copied.getSheetId()) spreadsheet.deleteSheet(sheet);
    });
    copied.setName(sourceSheet.getName());
    spreadsheet.setActiveSheet(copied);
    populateTemplate_(copied, row);
    return { spreadsheetId: spreadsheet.getId(), sheetId: copied.getSheetId() };
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
    return pdfFileNameFromParts_(
      date,
      safeFilePart_(row.signer_name, '未具名'),
      safeFilePart_(DOCUMENTS[row.template_id].shortName, '同意書')
    );
  }

  function pdfFileNameFromParts_(date, signerName, consentName) {
    return [date, signerName, consentName].join('_') + '.pdf';
  }

  function smokeCheck_() {
    var expected = {
      gov_personal_data_consent_115: '個資蒐集暨健康資料串聯同意書',
      gov_social_worker_confidentiality_115: '社政訪查人員保密同意書',
      gov_civil_affairs_confidentiality_115: '民政訪查人員保密同意書',
    };
    Object.keys(expected).forEach(function (templateId) {
      if (DOCUMENTS[templateId].sheetName !== expected[templateId]) {
        throw new Error('Template mapping smoke check failed: ' + templateId);
      }
    });
    var fileName = pdfFileNameFromParts_('2026-09-14', '測試簽署人', '個資蒐集同意書');
    if (fileName !== '2026-09-14_測試簽署人_個資蒐集同意書.pdf') {
      throw new Error('PDF filename smoke check failed');
    }
    var locatorFailed = false;
    try {
      requireLocatorResult_([], '測試必填欄');
    } catch (error) {
      locatorFailed = error.code === 'PDF_TEMPLATE_LOCATOR_FAILED';
    }
    if (!locatorFailed) throw new Error('Required locator fail-fast smoke check failed');
    return { ok: true, mappings: 3, file_name: fileName, locator_fail_fast: true };
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

  function fileIsInFolder_(file, folderId) {
    var parents = file.getParents();
    while (parents.hasNext()) {
      if (parents.next().getId() === folderId) return true;
    }
    return false;
  }

  function archiveSignature_(row) {
    var folder = getSignatureFolder_();
    var file;
    try {
      file = DriveApp.getFileById(String(row.signature_file_id));
    } catch (error) {
      fail_('PDF_GENERATION_FAILED', '簽名圖檔不存在或無權讀取，無法產生 PDF');
    }
    var extension = String(row.signature_mime_type || file.getMimeType()) === 'image/jpeg' ? 'jpg' : 'png';
    var fileName = safeFilePart_(row.signer_name, '未具名') + '_簽名.' + extension;
    if (!fileIsInFolder_(file, folder.getId())) {
      try {
        file.moveTo(folder);
      } catch (moveError) {
        file = file.makeCopy(fileName, folder);
      }
    }
    if (file.getName() !== fileName) file.setName(fileName);
    var patch = {
      signature_file_id: file.getId(),
      signature_file_url: file.getUrl(),
      signature_file_name: fileName,
      signature_folder_id: folder.getId(),
      signature_folder_url: folderUrl_(folder),
    };
    Object.keys(patch).forEach(function (key) { row[key] = patch[key]; });
    var updated = SheetHelper.updateByKey(SHEET, 'consent_id', row.consent_id, patch);
    return updated || row;
  }

  function generatePdfForRow_(row) {
    if (!row || !row.consent_id) fail_('NOT_FOUND', '找不到電子同意書');
    if (!DOCUMENTS[row.template_id]) fail_('VALIDATION_ERROR', '同意書模板不存在');
    if (!row.signature_file_id) fail_('PDF_GENERATION_FAILED', '簽名圖檔不存在，無法產生 PDF');
    var currentTemplateKey = templateKey_(row.template_id);
    if (existingPdfIsReadable_(row) && String(row.pdf_template_key || '') === currentTemplateKey) {
      return normalize_(row, false);
    }

    var tempSpreadsheetFile = null;
    var tempSpreadsheetId = '';
    var pdfFile = null;
    var oldPdfFileId = existingPdfIsReadable_(row) ? String(row.pdf_file_id) : '';
    try {
      row = archiveSignature_(row);
      var tempSpreadsheet = SpreadsheetApp.create('電子同意書暫存-' + row.consent_id);
      tempSpreadsheetId = tempSpreadsheet.getId();
      tempSpreadsheetFile = DriveApp.getFileById(tempSpreadsheetId);
      var temporary = copyTemplateSheet_(row, tempSpreadsheet);
      var folder = getPdfFolder_(row.template_id);
      var fileName = pdfFileName_(row);
      var pdfBlob = exportSpreadsheetPdf_(temporary.spreadsheetId, temporary.sheetId, fileName);
      pdfFile = folder.createFile(pdfBlob);
      var generatedAt = new Date().toISOString();
      var updated = SheetHelper.updateByKey(SHEET, 'consent_id', row.consent_id, {
        pdf_file_id: pdfFile.getId(),
        pdf_file_url: pdfFile.getUrl(),
        pdf_file_name: fileName,
        pdf_generated_at: generatedAt,
        pdf_template_key: currentTemplateKey,
        signature_file_id: row.signature_file_id,
        signature_file_url: row.signature_file_url,
        signature_file_name: row.signature_file_name,
        signature_folder_id: row.signature_folder_id,
        signature_folder_url: row.signature_folder_url,
        pdf_folder_id: folder.getId(),
        pdf_folder_url: folderUrl_(folder),
      });
      if (!updated) {
        pdfFile.setTrashed(true);
        fail_('NOT_FOUND', 'PDF 已產生但找不到同意書列，檔案已移至垃圾桶');
      }
      if (oldPdfFileId && oldPdfFileId !== pdfFile.getId()) {
        try {
          DriveApp.getFileById(oldPdfFileId).setTrashed(true);
        } catch (oldPdfError) {
          Logger.log('Failed to trash superseded PDF: ' + oldPdfError);
        }
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
        existing = generatePdfForRow_(existing);
        return normalize_(existing, true);
      }

      var consentId = 'CONSENT-' + Utilities.getUuid();
      var fileName = safeFilePart_(data.signer_name, '未具名') + '_簽名.' + signature.extension;
      var blob = Utilities.newBlob(signature.bytes, signature.mimeType, fileName);
      var signatureFolder = getSignatureFolder_();
      var file = signatureFolder.createFile(blob);
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
        pdf_template_key: '',
        signature_folder_id: signatureFolder.getId(),
        signature_folder_url: folderUrl_(signatureFolder),
        pdf_folder_id: '',
        pdf_folder_url: '',
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
    smokeCheck: smokeCheck_,
  };
})();
