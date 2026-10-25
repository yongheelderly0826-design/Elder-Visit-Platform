/**
 * 台灣手機正規化：去掉 - 空白等分隔符，缺前導 0 時補上。
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
    var digits = toHalfWidthDigits_(String(input).trim()).replace(/[^\d]/g, '');
    if (!digits) return '';
    if (/^09\d{8}$/.test(digits)) return digits;
    if (/^9\d{8}$/.test(digits)) return '0' + digits;
    return digits;
  }

  return {
    normalizeMobile: normalizeMobile,
  };
})();
