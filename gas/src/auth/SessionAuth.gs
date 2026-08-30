/**
 * Token 驗證
 */

var SessionAuth = (function () {
  function validateToken_(e) {
    var expected = Config.API_TOKEN();
    if (!expected) return; // 開發模式：未設定 token 則跳過

    var authHeader = (e.parameter && e.parameter.token) ||
      (e.headers && e.headers.Authorization) || '';

    if (authHeader.indexOf('Bearer ') === 0) {
      authHeader = authHeader.slice(7);
    }

    if (authHeader !== expected) {
      var err = new Error('Unauthorized');
      err.code = 'UNAUTHORIZED';
      throw err;
    }
  }

  return { validateToken_: validateToken_ };
})();
