/**
 * 去識別化編碼
 * 格式：YH-115-A001, YH-115-A002, ...
 *
 * 注意：不可用 parseInt('A001')（會得到 NaN）；必須抓 A 後的數字。
 * 批次分配時必須用記憶體計數器，不可每筆都只讀 sheet（否則會全部變成同一個 next）。
 */

var IdEncoder = (function () {
  function prefix_() {
    return Config.ENCODE_PREFIX();
  }

  function parseSuffixNum_(encodedId) {
    var match = String(encodedId || '').match(/A(\d+)$/i);
    if (!match) return NaN;
    return parseInt(match[1], 10);
  }

  function formatId_(prefix, num) {
    return prefix + '-A' + String(num).padStart(3, '0');
  }

  function maxFromCases_(cases, prefix) {
    var maxNum = 0;
    (cases || []).forEach(function (c) {
      var encoded = String(c.encoded_id || '');
      if (!encoded || encoded.indexOf(prefix) !== 0) return;
      var num = parseSuffixNum_(encoded);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    });
    return maxNum;
  }

  /**
   * 建立可連續取號的分配器（含已占用集合，避免重複）。
   */
  function createAllocator(existingCases) {
    var prefix = prefix_();
    var used = {};
    var maxNum = 0;
    (existingCases || []).forEach(function (c) {
      var encoded = String(c.encoded_id || '').trim();
      if (!encoded) return;
      used[encoded] = true;
      if (encoded.indexOf(prefix) === 0) {
        var num = parseSuffixNum_(encoded);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    var nextNum = maxNum;

    function tryReserve(encodedId) {
      var encoded = String(encodedId || '').trim();
      if (!encoded) return false;
      if (used[encoded]) return false;
      used[encoded] = true;
      if (encoded.indexOf(prefix) === 0) {
        var num = parseSuffixNum_(encoded);
        if (!isNaN(num) && num > nextNum) nextNum = num;
      }
      return true;
    }

    function next() {
      var candidate;
      do {
        nextNum += 1;
        candidate = formatId_(prefix, nextNum);
      } while (used[candidate]);
      used[candidate] = true;
      return candidate;
    }

    return {
      tryReserve: tryReserve,
      next: next,
      prefix: prefix,
    };
  }

  function nextEncodedId() {
    var cases = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.CASES)
    );
    return createAllocator(cases).next();
  }

  function assignEncodedIds(caseIds) {
    var cases = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.CASES)
    );
    var allocator = createAllocator(cases);
    var results = [];
    (caseIds || []).forEach(function (caseId) {
      results.push({ case_id: caseId, encoded_id: allocator.next() });
    });
    return results;
  }

  return {
    nextEncodedId: nextEncodedId,
    assignEncodedIds: assignEncodedIds,
    createAllocator: createAllocator,
    parseSuffixNum: parseSuffixNum_,
    formatId: formatId_,
    maxFromCases: maxFromCases_,
  };
})();
