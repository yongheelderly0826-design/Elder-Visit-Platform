# 衛福部生活關懷表：GAS「組合匯出資料」→「產生 XLSX」

擷取時間：2026-10-11  
用途：對照匯入範本欄位／日期／產檔流程時自行檢查。

## 流程概觀

```
ExportModule.exportLifeCareXlsx
  ├─ 依 case_ids 組 payloads（caseRow + careform）
  ├─ MohwLifeCareMapper.buildWorkbookRows(payloads)  ← 組合 103 欄列
  ├─ MohwLifeCareValidator.validateBatch(...)         ← 嚴格模式可擋下
  └─ MohwLifeCareExporter.createXlsxFile(rows, fileName)  ← 產生 XLSX 到 Drive
```

相關原始檔：

- `gas/src/modules/ExportModule.gs` — `exportLifeCareXlsx`
- `gas/src/utils/MohwLifeCareMapper.gs` — `mergeInputs` / `buildRow` / `buildWorkbookRows` / 日期電話格式
- `gas/src/utils/MohwLifeCareExporter.gs` — `createXlsxFile` / `createNamedXlsxFile`

表頭來源：`MohwOfficialTemplate.HEADERS`（對齊 `sheets/templates/生活關懷表匯入範本.xlsx`）。

---

## 1. ExportModule：組合資料 → 驗證 → 呼叫產檔

來源：`gas/src/modules/ExportModule.gs`

```javascript
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
      return MohwLifeCareMapper.mergeInputs(payload);
    });
    var registryIds = payloads.map(function (payload) {
      var caseRow = payload.caseRow || {};
      return caseRow.id_number || caseRow.national_id || '';
    });

    var batch = MohwLifeCareValidator.validateBatch(answerRows, 2, registryIds);
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
```

---

## 2. MohwLifeCareMapper：合併答案、組 103 欄列

來源：`gas/src/utils/MohwLifeCareMapper.gs`  
（自 `mergeInputs` 到 `buildWorkbookRows`；含民國日期 `yyy/MM/dd`、電話前導 0）

```javascript
  function mergeInputs(payload) {
    var answers = payload.mohwAnswers || {};
    var care = parseAnswersJson(payload.careform && payload.careform.answers_json);
    var caseRow = payload.caseRow || {};
    var visitMeta = payload.visitMeta || {};

    if (care.visit_date || care.visit_status || care.national_id) {
      Object.keys(care).forEach(function (key) {
        if (answers[key] === undefined || answers[key] === '') {
          answers[key] = care[key];
        }
      });
    } else {
      Object.keys(NEW_TAIPEI_MAP).forEach(function (src) {
        var dst = NEW_TAIPEI_MAP[src];
        if (answers[dst] !== undefined && answers[dst] !== '') return;
        if (care[src] !== undefined && care[src] !== '') {
          answers[dst] = care[src];
        }
      });
    }

    if (caseRow.name && !answers.name) answers.name = caseRow.name;
    if (caseRow.national_id && !answers.national_id) answers.national_id = caseRow.national_id;
    if (caseRow.id_number && !answers.national_id) answers.national_id = caseRow.id_number;
    if (caseRow.birth_date && !answers.birth_date) answers.birth_date = caseRow.birth_date;
    if (caseRow.phone && !answers.phone) answers.phone = caseRow.phone;
    if (caseRow.mobile && !answers.mobile) answers.mobile = caseRow.mobile;
    if (caseRow.household_city && !answers.household_city) answers.household_city = caseRow.household_city;
    if (caseRow.household_district && !answers.household_district) answers.household_district = caseRow.household_district;
    if (caseRow.household_village && !answers.household_village) answers.household_village = caseRow.household_village;
    if (caseRow.household_address && !answers.household_address) answers.household_address = caseRow.household_address;
    // 個案名冊常用 address，補到戶籍地址以便依地址修正村里
    if (!answers.household_address && caseRow.address) answers.household_address = caseRow.address;
    if (!answers.household_village && caseRow.visit_village) answers.household_village = caseRow.visit_village;

    if (visitMeta.visit_date && !answers.visit_date) answers.visit_date = visitMeta.visit_date;
    if (visitMeta.visit_start_time && !answers.visit_start_time) answers.visit_start_time = visitMeta.visit_start_time;
    if (visitMeta.visit_end_time && !answers.visit_end_time) answers.visit_end_time = visitMeta.visit_end_time;
    if (visitMeta.visit_status && !answers.visit_status) answers.visit_status = visitMeta.visit_status;
    if (visitMeta.notes && !answers.visit_notes) answers.visit_notes = visitMeta.notes;

    if (payload.careform && payload.careform.visit_result && !answers.visit_status) {
      answers.visit_status = mapVisitStatus(payload.careform.visit_result);
    }

    if (typeof MohwOfficialTemplate !== 'undefined' && MohwOfficialTemplate.applyVillageAutoFix) {
      answers = MohwOfficialTemplate.applyVillageAutoFix(answers, {
        visitAddress: caseRow.address || caseRow.visit_address || ''
      });
    }

    return answers;
  }

  function mapVisitStatus(value) {
    var map = {
      '訪視成功': '已完成',
      '完成訪視': '已完成',
      '已完成': '已完成',
      '未遇': '查無此人',
      '拒訪': '拒絕訪視',
      '拒絕訪視': '拒絕訪視',
      '無法溝通': '無法溝通',
      '住址不詳': '住址不詳'
    };
    return map[value] || value;
  }

  function formatCell(value, key) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.join(';');
    if (DATE_KEYS[key] && Object.prototype.toString.call(value) === '[object Date]') {
      return formatRocDate(value);
    }
    var text = String(value).trim();
    if (!text) return '';
    if (DATE_KEYS[key]) {
      return formatRocDate(text);
    }
    if (PHONE_KEYS[key]) {
      return formatPhone(text);
    }
    if (key === 'visit_start_time' || key === 'visit_end_time') {
      return formatTime(text);
    }
    if (text.indexOf(',') > -1 && text.indexOf(';') === -1) {
      return text.split(',').join(';');
    }
    return text;
  }

  /**
   * 民國年 yyy/MM/dd。年 3 碼、月日 2 碼。
   * 接受西元 ISO、Excel 序列、已是民國（含前導 0）。
   * Excel 常把民國 28/5/10 誤讀成 2028/05/10 → 以「西元年 > 今年」還原為 ROC yy。
   */
  function formatRocDate(input) {
    if (input === null || input === undefined || input === '') return '';
    if (Object.prototype.toString.call(input) === '[object Date]') {
      if (isNaN(input.getTime())) return '';
      return toRocParts_(input.getFullYear(), input.getMonth() + 1, input.getDate());
    }
    if (typeof input === 'number' && isFinite(input)) {
      return serialToRoc_(input) || String(input);
    }
    var text = String(input).replace(/^\s+|\s+$/g, '');
    if (!text) return '';
    if (/^\d{4,6}(\.\d+)?$/.test(text)) {
      var fromSerial = serialToRoc_(Number(text));
      if (fromSerial) return fromSerial;
    }

    var iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
      return toRocParts_(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    }

    var slash = text.match(/^(\d{1,4})\/(\d{1,2})\/(\d{1,2})$/);
    if (slash) {
      return toRocParts_(Number(slash[1]), Number(slash[2]), Number(slash[3]));
    }

    return text;
  }

  function serialToRoc_(serial) {
    if (!(serial >= 10000 && serial <= 80000)) return '';
    var utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
    var date = new Date(utc);
    if (isNaN(date.getTime())) return '';
    return toRocParts_(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  function pad_(value, width) {
    var text = String(value);
    while (text.length < width) text = '0' + text;
    return text;
  }

  function toRocParts_(year, month, day) {
    var currentWestern = new Date().getFullYear();
    var rocYear;
    if (year >= 1911) {
      // 未來西元年多半是 Excel 把民國 yy 當成 20yy
      if (year > currentWestern) {
        rocYear = year % 100;
      } else {
        rocYear = year - 1911;
      }
    } else {
      rocYear = year; // 已是民國（Number 會去掉 0115 → 115）
    }
    return pad_(rocYear, 3) + '/' + pad_(month, 2) + '/' + pad_(day, 2);
  }

  /** 還原前導 0：手機 09xxxxxxxx、市話 0xxxxxxxx */
  function formatPhone(input) {
    var text = String(input).trim();
    if (!text) return '';
    var digits = text.replace(/\D/g, '');
    if (!digits) return text;
    if (/^09\d{8}$/.test(digits) || /^0[2-8]\d{7,9}$/.test(digits)) {
      return digits;
    }
    if (/^9\d{8}$/.test(digits)) {
      return '0' + digits;
    }
    if (/^[2-8]\d{7,9}$/.test(digits)) {
      return '0' + digits;
    }
    return text;
  }

  function formatTime(input) {
    var match = String(input).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      return Number(match[1]) + ':' + match[2];
    }
    return String(input).trim();
  }

  function buildRow(payload) {
    var answers = mergeInputs(payload);
    return KEYS.map(function (key) {
      return formatCell(answers[key], key);
    });
  }

  function buildWorkbookRows(rowsPayload) {
    // 表頭一律以官方匯入範本為準，避免與驗證系統欄名一字之差。
    var headerRow =
      typeof MohwOfficialTemplate !== 'undefined' && MohwOfficialTemplate.HEADERS
        ? MohwOfficialTemplate.HEADERS.slice()
        : HEADERS.slice();
    if (
      typeof MohwOfficialTemplate !== 'undefined' &&
      MohwOfficialTemplate.headersMatch &&
      !MohwOfficialTemplate.headersMatch(HEADERS)
    ) {
      // 仍繼續匯出，但以官方表頭寫檔；本地 HEADERS 應儘快對齊。
    }
    var rows = [headerRow];
    rowsPayload.forEach(function (payload) {
      rows.push(buildRow(payload));
    });
    return rows;
  }
```

---

## 3. MohwLifeCareExporter：寫入試算表並匯出 XLSX

來源：`gas/src/utils/MohwLifeCareExporter.gs`（完整模組）

```javascript
/**
 * 衛福部 103 欄 xlsx 產檔（Google Drive）
 */

var MohwLifeCareExporter = (function () {
  var EXPORT_FOLDER_NAME = 'MOHW生活關懷表匯出';

  function getOrCreateFolder_() {
    var props = PropertiesService.getScriptProperties();
    var cachedId = props.getProperty('MOHW_EXPORT_FOLDER_ID');
    if (cachedId) {
      try {
        return DriveApp.getFolderById(cachedId);
      } catch (e) {
        // folder removed — recreate below
      }
    }

    var folders = DriveApp.getFoldersByName(EXPORT_FOLDER_NAME);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(EXPORT_FOLDER_NAME);
    props.setProperty('MOHW_EXPORT_FOLDER_ID', folder.getId());
    return folder;
  }

  /**
   * @param {string[][]} rows header + data rows
   * @param {string} exportId
   * @returns {{ fileId: string, fileUrl: string, fileName: string }}
   */
  function createXlsxFile(rows, exportIdOrFileName) {
    var fileName = String(exportIdOrFileName || '');
    if (!/\.xlsx$/i.test(fileName)) {
      fileName = '生活關懷表_' + fileName + '.xlsx';
    }
    return createNamedXlsxFile(rows, fileName, 'MOHW Export ' + fileName);
  }

  /**
   * @param {string[][]} rows
   * @param {string} fileName
   * @param {string} tempTitle
   * @param {{ propertyKey?: string, folderName?: string }=} folderOpts
   */
  function createNamedXlsxFile(rows, fileName, tempTitle, folderOpts) {
    if (!rows || rows.length === 0) {
      throw new Error('MohwLifeCareExporter: empty rows');
    }

    folderOpts = folderOpts || {};
    var ss = SpreadsheetApp.create(tempTitle || fileName);
    var sheet = ss.getSheets()[0];
    var range = sheet.getRange(1, 1, rows.length, rows[0].length);
    // 整表先設文字。日期樣字串仍可能被 Sheets 吃成日期，下面再逐格用 setValue 強制。
    range.setNumberFormat('@');
    range.setValues(rows);
    writeTextColumns_(sheet, rows);
    SpreadsheetApp.flush();

    var spreadsheetId = ss.getId();
    var tempFile = DriveApp.getFileById(spreadsheetId);
    // getBlob().getAs(xlsx) 常失敗（PDF MIME）；改走 Sheets export API
    var exportUrl =
      'https://docs.google.com/spreadsheets/d/' +
      spreadsheetId +
      '/export?format=xlsx';
    var response = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    });
    if (response.getResponseCode() !== 200) {
      tempFile.setTrashed(true);
      throw new Error(
        'xlsx export HTTP ' + response.getResponseCode() + ': ' + response.getContentText().slice(0, 200)
      );
    }
    var xlsxBlob = response.getBlob().setName(fileName);

    var folder = folderOpts.folderName
      ? getOrCreateNamedFolder_(folderOpts.propertyKey, folderOpts.folderName)
      : getOrCreateFolder_();
    var file = folder.createFile(xlsxBlob);
    tempFile.setTrashed(true);

    return {
      fileId: file.getId(),
      fileUrl: file.getUrl(),
      fileName: fileName,
    };
  }

  function writeTextColumns_(sheet, rows) {
    var textCols = MohwOfficialTemplate.TEXT_COLUMNS || {};
    // 任何已是官方民國日期的欄也強制文字（防 Sheets 匯出時型別漂移）
    var rocRe = /^\d{3}\/\d{2}\/\d{2}$/;
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      for (var c = 0; c < row.length; c++) {
        var text = row[c] == null ? '' : String(row[c]);
        if (!text) continue;
        if (text.charAt(0) === "'") text = text.substring(1);
        var force = !!textCols[c + 1] || rocRe.test(text);
        if (!force) continue;
        var cell = sheet.getRange(r + 1, c + 1);
        cell.setNumberFormat('@');
        cell.setValue("'" + text);
      }
    }
    // 表頭也維持文字，避免星號／空白被改寫
    if (rows[0] && rows[0].length) {
      var headerRange = sheet.getRange(1, 1, 1, rows[0].length);
      headerRange.setNumberFormat('@');
      headerRange.setValues([rows[0]]);
    }
  }

  function getOrCreateNamedFolder_(propertyKey, folderName) {
    var props = PropertiesService.getScriptProperties();
    var key = propertyKey || 'EXPORT_FOLDER_' + folderName;
    var cachedId = props.getProperty(key);
    if (cachedId) {
      try {
        return DriveApp.getFolderById(cachedId);
      } catch (e) {
        // folder removed — recreate below
      }
    }
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    props.setProperty(key, folder.getId());
    return folder;
  }

  return {
    createXlsxFile: createXlsxFile,
    createNamedXlsxFile: createNamedXlsxFile,
    getOrCreateFolder_: getOrCreateFolder_,
  };
})();
```

---

## 檢查時建議對照

1. `buildWorkbookRows` 表頭是否與官方匯入範本 103 欄一字不差  
2. `formatRocDate` / `toRocParts_` 是否輸出 `yyy/MM/dd`（年 3 碼、月日 2 碼）  
3. `writeTextColumns_` 是否把日期／電話欄強制成文字（避免 Sheets 吃掉前導 0）  
4. `strict !== false` 時 `validateBatch` 失敗是否阻止產檔  

