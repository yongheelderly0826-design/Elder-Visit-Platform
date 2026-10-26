/**
 * 台灣手機正規化：去掉 - 空白等分隔符，缺前導 0 時補上。
 * 對齊 lib/domain/phone.ts → normalizeTaiwanMobilePhone。
 */
var PhoneUtils = (function () {
  function toHalfWidthDigits_(text) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code >= 0xff10 && code <= 0xff19) {
        out += String.fromCharCode(code - 0xff10 + 0x30);
      } else {
        out += text.charAt(i);
      }
    }
    return out;
  }

  function normalizeMobile(input) {
    if (input == null || input === '') return '';
    // 數字型別會丟前導 0（Sheets／JSON）；一律先當字串再只留數字
    var digits = toHalfWidthDigits_(String(input).trim()).replace(/[^\d]/g, '');
    if (!digits) return '';
    if (/^09\d{8}$/.test(digits)) return digits;
    // 缺前導 0 的 9 碼手機（9 + 8 碼）
    if (/^9\d{8}$/.test(digits)) return '0' + digits;
    // 缺前導 0 的 10 碼（Sheets 吃掉 0 後常見 9123456789）→ 補 0 取前 10
    if (/^9\d{9}$/.test(digits)) return ('0' + digits).slice(0, 10);
    // 多打一碼的 09…（11 碼）→ 取前 10 碼
    if (/^09\d{9}$/.test(digits)) return digits.slice(0, 10);
    return digits;
  }

  return {
    normalizeMobile: normalizeMobile,
  };
})();
