/**
 * 資料驗證
 */

var Validation = (function () {
  function normalizeTaiwanId(id) {
    return String(id || '')
      .replace(/[\uFF01-\uFF5E]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
      })
      .replace(/^\s+|\s+$/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  function validateTaiwanId(id) {
    var normalized = normalizeTaiwanId(id);
    if (!normalized || normalized.length !== 10) return false;
    var letters = 'ABCDEFGHJKLMNPQRSTUVXYWZIO';
    var letterIndex = letters.indexOf(normalized.charAt(0));
    if (letterIndex === -1) return false;
    if (!/^[A-Z][1289]\d{8}$/.test(normalized)) return false;

    var nums = [Math.floor(letterIndex / 10) + 1, letterIndex % 10];
    for (var i = 1; i < 9; i++) {
      nums.push(parseInt(normalized.charAt(i), 10));
    }
    var checksum = parseInt(normalized.charAt(9), 10);
    var sum = nums[0] + nums[1] * 9;
    for (var j = 2; j < 10; j++) {
      sum += nums[j] * (10 - j);
    }
    return (10 - (sum % 10)) % 10 === checksum;
  }

  function requireFields(obj, fields) {
    var missing = fields.filter(function (f) {
      return obj[f] === undefined || obj[f] === null || obj[f] === '';
    });
    if (missing.length > 0) {
      var err = new Error('Missing required fields: ' + missing.join(', '));
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
  }

  return {
    normalizeTaiwanId: normalizeTaiwanId,
    validateTaiwanId: validateTaiwanId,
    requireFields: requireFields,
  };
})();
