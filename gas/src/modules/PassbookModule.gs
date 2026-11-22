/**
 * 公開存摺補件（暫時通道）
 * Sheet：存摺補件；Drive：_訪員存摺補件
 */
var PassbookModule = (function () {
  var SHEET = Config.SHEET_NAMES.PASSBOOK_SUBMISSIONS;
  var HEADERS = [
    'submission_id',
    'visitor_id',
    'name_snapshot',
    'id_masked',
    'account_name',
    'account_number',
    'bank_name',
    'bank_code',
    'passbook_drive_url',
    'status',
    'submitted_at',
    'reviewed_at',
    'reviewed_by',
    'review_note',
    'source',
    'campaign_code',
  ];
  var GENERIC_DENY = '無法確認身分或通道已關閉，請聯絡承辦';
  var CACHE = CacheService.getScriptCache();
  var FAIL_TTL_SEC = 900;
  var FAIL_LIMIT = 8;

  function throwError_(code, message) {
    var err = new Error(message);
    err.code = code;
    throw err;
  }

  function deny_() {
    throwError_('FORBIDDEN', GENERIC_DENY);
  }

  function nowIso_() {
    return new Date().toISOString();
  }

  function taipeiDateText_() {
    return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  }

  function normalizeName_(value) {
    return String(value || '')
      .replace(/\s+/g, '')
      .replace(/　/g, '')
      .trim();
  }

  function extractTaiwanId_(raw) {
    var normalized = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    var match = normalized.match(/[A-Z][0-9]{9}/);
    return match ? match[0] : normalized;
  }

  function phoneDigits_(raw) {
    return String(raw || '').replace(/\D/g, '');
  }

  function phoneLast4_(raw) {
    var digits = phoneDigits_(raw);
    return digits.length >= 4 ? digits.slice(-4) : '';
  }

  function maskId_(idNumber) {
    var id = extractTaiwanId_(idNumber);
    if (id.length < 6) return '****';
    return id.slice(0, 3) + '****' + id.slice(-2);
  }

  function settingValue_(key) {
    var props = PropertiesService.getScriptProperties();
    var fromProps = props.getProperty(key);
    if (fromProps) return String(fromProps).trim();
    try {
      var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(Config.SHEET_NAMES.SETTINGS));
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i].key || '').trim() === key) {
          return String(rows[i].value || '').trim();
        }
      }
    } catch (e) {
      // ignore missing settings sheet
    }
    return '';
  }

  function campaignCode_() {
    return settingValue_('PASSBOOK_CAMPAIGN_CODE');
  }

  function deadlineDate_() {
    return settingValue_('PASSBOOK_DEADLINE') || '2026-12-30';
  }

  function channelOpen_(campaignCode) {
    var today = taipeiDateText_();
    var deadline = deadlineDate_();
    if (today > deadline) return false;
    // Empty / unset PASSBOOK_CAMPAIGN_CODE → open channel (deadline only).
    var expected = campaignCode_();
    if (!expected) return true;
    return String(campaignCode || '').trim() === expected;
  }

  function ensureSchema_() {
    SheetHelper.ensureSheet(SHEET, HEADERS);
    SheetHelper.ensureColumns(SHEET, HEADERS);
    SheetHelper.ensureColumns(Config.SHEET_NAMES.VISITORS, [
      'bank_account',
      'bank_name',
      'bank_code',
      'bank_account_name',
    ]);
  }

  function failKey_(idNumber, ip) {
    return 'pb_fail:' + extractTaiwanId_(idNumber) + ':' + String(ip || 'na').slice(0, 40);
  }

  function checkRateLimit_(idNumber, ip) {
    var key = failKey_(idNumber, ip);
    var raw = CACHE.get(key);
    var count = raw ? parseInt(raw, 10) : 0;
    if (count >= FAIL_LIMIT) deny_();
  }

  function bumpFail_(idNumber, ip) {
    var key = failKey_(idNumber, ip);
    var raw = CACHE.get(key);
    var count = (raw ? parseInt(raw, 10) : 0) + 1;
    CACHE.put(key, String(count), FAIL_TTL_SEC);
  }

  function clearFail_(idNumber, ip) {
    CACHE.remove(failKey_(idNumber, ip));
  }

  function isEligibleStatus_(status) {
    var s = String(status || '').trim();
    return s === '已核准' || s === '待審';
  }

  function findEligibleVisitor_(name, idNumber, phoneLast4) {
    var targetId = extractTaiwanId_(idNumber);
    var targetName = normalizeName_(name);
    var targetLast4 = String(phoneLast4 || '').replace(/\D/g, '').slice(-4);
    if (!targetId || !targetName || targetLast4.length !== 4) return null;

    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(Config.SHEET_NAMES.VISITORS));
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (extractTaiwanId_(row.id_number) !== targetId) continue;
      if (normalizeName_(row.name || row.full_name) !== targetName) continue;
      if (phoneLast4_(row.phone) !== targetLast4) continue;
      if (!isEligibleStatus_(row.status)) continue;
      return row;
    }
    return null;
  }

  function persistPassbookPhoto_(dataUrl, visitorId, submissionId) {
    var value = String(dataUrl || '');
    var match = value.match(/^data:(image\/[A-Za-z0-9.+-]+);base64,(.+)$/);
    if (!match) throwError_('VALIDATION_ERROR', '存摺照片格式不正確');
    var folders = DriveApp.getFoldersByName('_訪員存摺補件');
    var folder = folders.hasNext()
      ? folders.next()
      : DriveApp.getRootFolder().createFolder('_訪員存摺補件');
    var extension = match[1].indexOf('png') >= 0 ? 'png' : 'jpg';
    var blob = Utilities.newBlob(
      Utilities.base64Decode(match[2].replace(/\s/g, '')),
      match[1],
      visitorId + '_' + submissionId + '_passbook.' + extension
    );
    return folder.createFile(blob).getUrl();
  }

  function nextSubmissionId_() {
    var datePart = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd');
    var prefix = 'PB-' + datePart + '-';
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    var maxSeq = 0;
    for (var i = 0; i < rows.length; i++) {
      var id = String(rows[i].submission_id || '');
      if (id.indexOf(prefix) !== 0) continue;
      var seq = parseInt(id.slice(prefix.length), 10);
      if (seq > maxSeq) maxSeq = seq;
    }
    var next = String(maxSeq + 1);
    while (next.length < 3) next = '0' + next;
    return prefix + next;
  }

  /**
   * 公開核對：姓名 + 身分證 + 手機末四碼
   * （活動碼僅在 PASSBOOK_CAMPAIGN_CODE 有設定時才檢查；未設定則開放）
   */
  function verify(data) {
    ensureSchema_();
    data = data || {};
    var campaignCode = String(data.campaign_code || '').trim();
    var name = String(data.name || '').trim();
    var idNumber = extractTaiwanId_(data.id_number);
    var phoneLast4 = String(data.phone_last4 || '').replace(/\D/g, '').slice(-4);
    var ip = String(data.client_ip || '');

    if (!channelOpen_(campaignCode)) deny_();
    checkRateLimit_(idNumber, ip);

    if (!name || !idNumber || phoneLast4.length !== 4) {
      bumpFail_(idNumber, ip);
      deny_();
    }
    if (!Validation.validateTaiwanId(idNumber)) {
      bumpFail_(idNumber, ip);
      deny_();
    }

    var visitor = findEligibleVisitor_(name, idNumber, phoneLast4);
    if (!visitor) {
      bumpFail_(idNumber, ip);
      deny_();
    }

    clearFail_(idNumber, ip);
    return {
      ok: true,
      visitor_id: visitor.visitor_id,
      name: visitor.name || '',
      status: visitor.status || '',
      campaign_code: campaignCode || 'open',
      deadline: deadlineDate_(),
      channel_open: true,
    };
  }

  /**
   * 送出補件（待審）；同一 visitor 的待審列可覆寫
   */
  function submit(data) {
    ensureSchema_();
    data = data || {};
    var campaignCode = String(data.campaign_code || '').trim();
    if (!channelOpen_(campaignCode)) deny_();

    var visitorId = String(data.visitor_id || '').trim();
    var visitor = VisitorModule.get(visitorId);
    if (!visitor || !isEligibleStatus_(visitor.status)) deny_();

    var accountName = String(data.account_name || '').trim();
    var accountNumber = String(data.account_number || '').replace(/\s/g, '').trim();
    var bankName = String(data.bank_name || '').trim();
    var bankCode = String(data.bank_code || '').replace(/\D/g, '').trim();
    var photo = String(data.passbook_data_url || data.passbook_cover_url || '');

    if (!accountName || !accountNumber || !bankName || !bankCode || !photo) {
      throwError_('VALIDATION_ERROR', '請完整填寫帳戶名稱、帳戶號碼、銀行與存摺照片');
    }
    if (accountNumber.length < 8 || accountNumber.length > 20) {
      throwError_('VALIDATION_ERROR', '帳戶號碼長度不正確');
    }

    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    var existingPending = null;
    for (var i = rows.length - 1; i >= 0; i--) {
      if (
        String(rows[i].visitor_id) === visitorId &&
        String(rows[i].status) === '待審'
      ) {
        existingPending = rows[i];
        break;
      }
    }

    var submissionId = existingPending
      ? String(existingPending.submission_id)
      : nextSubmissionId_();
    var driveUrl = persistPassbookPhoto_(photo, visitorId, submissionId);
    var record = {
      submission_id: submissionId,
      visitor_id: visitorId,
      name_snapshot: visitor.name || '',
      id_masked: maskId_(visitor.id_number),
      account_name: accountName,
      account_number: accountNumber,
      bank_name: bankName,
      bank_code: bankCode,
      passbook_drive_url: driveUrl,
      status: '待審',
      submitted_at: nowIso_(),
      reviewed_at: '',
      reviewed_by: '',
      review_note: '',
      source: 'public_passbook',
      campaign_code: campaignCode || 'open',
    };

    if (existingPending) {
      return SheetHelper.updateByKey(SHEET, 'submission_id', submissionId, record);
    }
    return SheetHelper.appendRow(SHEET, record);
  }

  function list(params) {
    ensureSchema_();
    params = params || {};
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    if (params.status) {
      rows = rows.filter(function (r) {
        return String(r.status) === String(params.status);
      });
    }
    rows.sort(function (a, b) {
      return String(b.submitted_at || '').localeCompare(String(a.submitted_at || ''));
    });
    return rows;
  }

  function review(data) {
    ensureSchema_();
    data = data || {};
    Validation.requireFields(data, ['submission_id', 'decision']);
    var decision = String(data.decision || '').trim();
    if (decision !== '已確認' && decision !== '退回') {
      throwError_('VALIDATION_ERROR', 'decision 需為「已確認」或「退回」');
    }

    var found = SheetHelper.findByKey(SHEET, 'submission_id', data.submission_id);
    var row = found[0];
    if (!row) throwError_('NOT_FOUND', '找不到補件紀錄');
    if (String(row.status) !== '待審') {
      throwError_('VALIDATION_ERROR', '此筆已審核，無法重複處理');
    }

    var patch = {
      status: decision,
      reviewed_at: nowIso_(),
      reviewed_by: String(data.reviewed_by || '').trim(),
      review_note: String(data.review_note || '').trim(),
    };
    var updated = SheetHelper.updateByKey(SHEET, 'submission_id', data.submission_id, patch);

    if (decision === '已確認') {
      VisitorModule.update({
        visitor_id: row.visitor_id,
        bank_account: row.account_number,
        bank_name: row.bank_name,
        bank_code: row.bank_code,
        bank_account_name: row.account_name,
      });
    }

    return updated;
  }

  function channelStatus(params) {
    params = params || {};
    var code = String(params.campaign_code || '').trim();
    var open = channelOpen_(code);
    return {
      open: open,
      deadline: deadlineDate_(),
      has_campaign_configured: Boolean(campaignCode_()),
    };
  }

  return {
    verify: verify,
    submit: submit,
    list: list,
    review: review,
    channelStatus: channelStatus,
  };
})();
