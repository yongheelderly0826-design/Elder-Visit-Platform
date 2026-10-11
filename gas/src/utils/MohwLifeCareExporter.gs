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
    // 日期、時間、電話皆使用文字；數字欄與範本示例一致保留数字文字。
    range.setNumberFormat('@');
    // 以 rich text 字串寫入：保留民國日期與前導 0，不附加單引號。
    range.setRichTextValues(rows.map(function (row) {
      return row.map(function (value) {
        return SpreadsheetApp.newRichTextValue()
          .setText(value == null ? '' : String(value)).build();
      });
    }));
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
