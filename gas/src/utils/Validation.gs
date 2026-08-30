/**
 * 資料驗證
 */

var Validation = (function () {
  function validateTaiwanId(id) {
    if (!id || id.length !== 10) return false;
    var letters = 'ABCDEFGHJKLMNPQRSTUVXYWZIO';
    var letterIndex = letters.indexOf(id.charAt(0).toUpperCase());
    if (letterIndex === -1) return false;

    var nums = [Math.floor(letterIndex / 10) + 1, letterIndex % 10];
    for (var i = 1; i < 9; i++) {
      nums.push(parseInt(id.charAt(i), 10));
    }
    var checksum = parseInt(id.charAt(9), 10);
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
    validateTaiwanId: validateTaiwanId,
    requireFields: requireFields,
  };
})();
