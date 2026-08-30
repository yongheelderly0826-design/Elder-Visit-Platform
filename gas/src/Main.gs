/**
 * Web App 入口 — doGet / doPost
 * 永和區獨居長者訪查管理平台
 */

function doGet(e) {
  return handleRequest_(e, 'GET');
}

function doPost(e) {
  return handleRequest_(e, 'POST');
}

function handleRequest_(e, method) {
  try {
    SessionAuth.validateToken_(e);

    var action = (e.parameter && e.parameter.action) || '';
    var body = {};

    if (method === 'POST' && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    var result = ApiRouter.dispatch(action, e.parameter || {}, body);
    return jsonResponse_({ ok: true, data: result, error: null });
  } catch (err) {
    var code = err.code || 'INTERNAL_ERROR';
    return jsonResponse_({
      ok: false,
      data: null,
      error: { code: code, message: err.message || String(err) },
    });
  }
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 初始化試算表結構（clasp run initSpreadsheet）
 */
function initSpreadsheet() {
  SheetHelper.initAllSheets();
  Logger.log('Spreadsheet initialized.');
}
