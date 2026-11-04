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
    // 暫存試算表標題勿含 .xlsx／勿像成品檔名，避免逾時殘檔被誤開成「空白匯出」。
    var tempTitle = '_TMP_MOHW_請勿開啟_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    return createNamedXlsxFile(rows, fileName, tempTitle);
  }

  /**
   * @param {string[][]} rows
   * @param {string} fileName
   * @param {string} tempTitle
   * @param {{ propertyKey?: string, folderName?: string }=} folderOpts
   */
  function createNamedXlsxFile(rows, fileName, tempTitle, folderOpts) {
    if (!rows || !rows.length || !Array.isArray(rows[0]) || !rows[0].length) {
      throw new Error('MohwLifeCareExporter: empty rows');
    }
    var width = rows[0].length;
    if (rows.some(function (row) { return !Array.isArray(row) || row.length !== width; })) {
      throw new Error('匯出列的欄位數不一致');
    }
    var textRows = rows.map(function (row) {
      return row.map(function (value) { return value == null ? '' : String(value); });
    });
    folderOpts = folderOpts || {};
    // 標題不要用成品檔名或 .xlsx，減少 Drive「最近」誤開暫存。
    var safeTempTitle = String(tempTitle || '').replace(/\.xlsx$/i, '');
    if (!safeTempTitle || /\.xlsx/i.test(safeTempTitle) || safeTempTitle.indexOf('生活關懷表_') === 0) {
      safeTempTitle = '_TMP_MOHW_請勿開啟_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    }
    var ss = SpreadsheetApp.create(safeTempTitle);
    var tempFile = DriveApp.getFileById(ss.getId());
    try {
      var sheet = ss.getSheets()[0];
      var range = sheet.getRange(1, 1, textRows.length, width);
      // 先鎖定文字格式再 setValues（大批次比 setRichTextValues 快很多，仍靠回讀擋型態漂移）。
      range.setNumberFormat('@');
      range.setValues(textRows);
      SpreadsheetApp.flush();

      // 回讀實際值與公式；不只相信寫入前的陣列。
      var saved = range.getValues();
      var formulas = range.getFormulas();
      for (var r = 0; r < textRows.length; r++) {
        for (var c = 0; c < width; c++) {
          var cell = saved[r][c];
          var asText = cell == null ? '' : String(cell);
          if (formulas[r][c] || asText !== textRows[r][c]) {
            throw new Error('儲存格式或內容改變：第 ' + (r + 1) + ' 列、第 ' + (c + 1) + ' 欄');
          }
        }
      }

      // 大批次寫入後稍候再 export，降低 Sheets 匯出服務讀到空複本的機率。
      if (textRows.length > 200) {
        Utilities.sleep(1500);
        SpreadsheetApp.flush();
      }

      var response = UrlFetchApp.fetch(
        'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx', {
          headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
          muteHttpExceptions: true
        });
      if (response.getResponseCode() !== 200) {
        throw new Error('xlsx export HTTP ' + response.getResponseCode());
      }
      var blob = response.getBlob();
      var bytes = blob.getBytes();
      if (bytes.length < 4 || bytes[0] !== 80 || bytes[1] !== 75 || bytes[2] !== 3 || bytes[3] !== 4) {
        throw new Error('匯出回應不是預期的 XLSX ZIP 檔');
      }
      // 空／近空 xlsx（僅 ZIP 骨架）視為失敗，避免寫出「成功但空白」的 Drive 檔。
      if (bytes.length < 2000) {
        throw new Error('xlsx 匯出異常過小（' + bytes.length + ' bytes），疑似空檔');
      }
      var folder = folderOpts.folderName
        ? getOrCreateNamedFolder_(folderOpts.propertyKey, folderOpts.folderName)
        : getOrCreateFolder_();
      var file = folder.createFile(blob.setName(fileName));
      return { fileId: file.getId(), fileUrl: file.getUrl(), fileName: fileName };
    } finally {
      try { tempFile.setTrashed(true); }
      catch (cleanupError) { console.warn('暫存試算表清理失敗：' + ss.getId()); }
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
