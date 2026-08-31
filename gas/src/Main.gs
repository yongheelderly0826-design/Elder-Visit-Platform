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
    return jsonResponse_({ ok: true, data: result, error: null }, e);
  } catch (err) {
    var code = err.code || 'INTERNAL_ERROR';
    return jsonResponse_({
      ok: false,
      data: null,
      error: { code: code, message: err.message || String(err) },
    }, e);
  }
}

function jsonResponse_(payload, e) {
  var json = JSON.stringify(payload);
  var callback = e && e.parameter && e.parameter.callback;
  if (callback && /^[A-Za-z0-9_]+$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
