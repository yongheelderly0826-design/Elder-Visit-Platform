/**
 * 去識別化編碼
 * 格式：YH-115-A001, YH-115-A002, ...
 */

var IdEncoder = (function () {
  function nextEncodedId() {
    var prefix = Config.ENCODE_PREFIX();
    var cases = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.CASES)
    );
    var maxNum = 0;
    cases.forEach(function (c) {
      if (c.encoded_id && c.encoded_id.indexOf(prefix) === 0) {
        var num = parseInt(c.encoded_id.split('-').pop(), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    var next = maxNum + 1;
    return prefix + '-A' + String(next).padStart(3, '0');
  }

  function assignEncodedIds(caseIds) {
    var results = [];
    caseIds.forEach(function (caseId) {
      var encoded = nextEncodedId();
      results.push({ case_id: caseId, encoded_id: encoded });
    });
    return results;
  }

  return {
    nextEncodedId: nextEncodedId,
    assignEncodedIds: assignEncodedIds,
  };
})();
