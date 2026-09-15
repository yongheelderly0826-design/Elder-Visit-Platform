/**
 * 訪員註冊與帳號管理。敏感欄位只由受 GAS_API_TOKEN 保護的 Next server 呼叫。
 * 密碼雜湊與 raw token 均在 Next Node 產生；Sheet 僅保存 hash。
 */
var UserAccountModule = (function () {
  var REGISTRATIONS = Config.SHEET_NAMES.REGISTRATIONS;
  var ACCOUNTS = Config.SHEET_NAMES.VISITOR_ACCOUNTS;
  var VISITORS = Config.SHEET_NAMES.VISITORS;
  var REGISTRATION_HEADERS = [
    'request_id', 'account_id', 'email', 'full_name', 'requested_unit_name',
    'requested_workspace_id', 'requested_workspace_name', 'requested_role_key',
    'status', 'review_note', 'submitted_at', 'reviewed_at', 'visitor_id',
    'profile_json', 'created_at', 'updated_at',
  ];
  var ACCOUNT_HEADERS = [
    'account_id', 'email', 'visitor_id', 'full_name', 'role_key', 'status',
    'password_hash', 'password_salt', 'password_params', 'invite_token_hash',
    'invite_expires_at', 'reset_token_hash', 'reset_expires_at',
    'password_updated_at', 'last_login_at', 'created_at', 'updated_at',
  ];

  function ensureSchema_() {
    SheetHelper.ensureSheet(REGISTRATIONS, REGISTRATION_HEADERS);
    SheetHelper.ensureSheet(ACCOUNTS, ACCOUNT_HEADERS);
  }

  function normalizeEmail_(value) {
    return String(value || '').trim().toLowerCase();
  }

  function now_() {
    return new Date().toISOString();
  }

  function error_(code, message) {
    var err = new Error(message);
    err.code = code;
    return err;
  }

  function withLock_(callback) {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      ensureSchema_();
      return callback();
    } finally {
      lock.releaseLock();
    }
  }

  function parseProfile_(row) {
    if (!row || !row.profile_json) return {};
    try {
      return JSON.parse(String(row.profile_json));
    } catch (e) {
      return {};
    }
  }

  function publicRegistration_(row) {
    if (!row) return null;
    return {
      id: String(row.request_id || ''),
      account_id: String(row.account_id || '') || null,
      email: normalizeEmail_(row.email),
      full_name: String(row.full_name || ''),
      requested_unit_name: String(row.requested_unit_name || ''),
      requested_workspace_id: String(row.requested_workspace_id || '') || null,
      requested_workspace_name: String(row.requested_workspace_name || ''),
      requested_role_key: String(row.requested_role_key || 'visitor'),
      status: String(row.status || 'pending_workspace_review'),
      review_note: String(row.review_note || '') || null,
      submitted_at: String(row.submitted_at || ''),
      reviewed_at: String(row.reviewed_at || '') || null,
      visitor_id: String(row.visitor_id || '') || null,
      profile: parseProfile_(row),
    };
  }

  function findOne_(sheetName, key, value) {
    var rows = SheetHelper.findByKey(sheetName, key, value);
    return rows[0] || null;
  }

  function findAccountByEmail_(email) {
    var normalized = normalizeEmail_(email);
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(ACCOUNTS));
    for (var i = 0; i < rows.length; i++) {
      if (normalizeEmail_(rows[i].email) === normalized) return rows[i];
    }
    return null;
  }

  function persistDataImage_(dataUrl, fileName) {
    var value = String(dataUrl || '');
    var match = value.match(/^data:(image\/[A-Za-z0-9.+-]+);base64,(.+)$/);
    if (!match) return value;
    var folders = DriveApp.getFoldersByName('_訪員註冊證件照');
    var folder = folders.hasNext()
      ? folders.next()
      : DriveApp.getRootFolder().createFolder('_訪員註冊證件照');
    var extension = match[1].indexOf('png') >= 0 ? 'png' : 'jpg';
    var blob = Utilities.newBlob(
      Utilities.base64Decode(match[2]),
      match[1],
      fileName + '.' + extension
    );
    return folder.createFile(blob).getUrl();
  }

  function persistProfileImages_(profile, requestId) {
    var stored = {};
    Object.keys(profile || {}).forEach(function (key) { stored[key] = profile[key]; });
    if (stored.headshotOriginalUrl) {
      stored.headshotOriginalUrl = persistDataImage_(
        stored.headshotOriginalUrl,
        requestId + '-original'
      );
    }
    if (stored.headshotProcessedUrl) {
      stored.headshotProcessedUrl = persistDataImage_(
        stored.headshotProcessedUrl,
        requestId + '-processed'
      );
    }
    return stored;
  }

  function listRegistrations(params) {
    ensureSchema_();
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(REGISTRATIONS));
    if (params && params.status) {
      rows = rows.filter(function (row) {
        return String(row.status) === String(params.status);
      });
    }
    return rows.map(publicRegistration_).sort(function (a, b) {
      return String(b.submitted_at).localeCompare(String(a.submitted_at));
    });
  }

  function getRegistration(requestId) {
    ensureSchema_();
    return publicRegistration_(findOne_(REGISTRATIONS, 'request_id', requestId));
  }

  function createRegistration(data) {
    return withLock_(function () {
      data = data || {};
      var email = normalizeEmail_(data.email);
      if (!email || !data.full_name) {
        throw error_('VALIDATION_ERROR', '註冊資料缺少 Email 或姓名。');
      }

      var requestId = String(data.request_id || Utilities.getUuid());
      var existingById = findOne_(REGISTRATIONS, 'request_id', requestId);
      if (existingById) return publicRegistration_(existingById);

      var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(REGISTRATIONS));
      for (var i = 0; i < rows.length; i++) {
        if (
          normalizeEmail_(rows[i].email) === email &&
          String(rows[i].status) !== 'rejected'
        ) {
          throw error_('DUPLICATE_REGISTRATION', '此 Email 已有待審或已通過申請，請勿重複送出。');
        }
      }

      var submittedAt = String(data.submitted_at || now_());
      var storedProfile = persistProfileImages_(data.profile || {}, requestId);
      var saved = SheetHelper.appendRow(REGISTRATIONS, {
        request_id: requestId,
        account_id: '',
        email: email,
        full_name: String(data.full_name),
        requested_unit_name: String(data.requested_unit_name || ''),
        requested_workspace_id: String(data.requested_workspace_id || Config.WORKSPACE_ID()),
        requested_workspace_name: String(data.requested_workspace_name || ''),
        requested_role_key: String(data.requested_role_key || 'visitor'),
        status: String(data.status || 'pending_social_bureau_review'),
        review_note: String(data.review_note || ''),
        submitted_at: submittedAt,
        reviewed_at: '',
        visitor_id: '',
        profile_json: JSON.stringify(storedProfile),
        created_at: submittedAt,
        updated_at: submittedAt,
      });
      return publicRegistration_(saved);
    });
  }

  function visitorIdFor_(request) {
    var profile = parseProfile_(request);
    var workerCode = profile.workerGroup === 'social_affairs' ? 'SOC' : 'CIV';
    var seed = String(request.request_id || '').replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase();
    return 'EV-' + Config.FISCAL_YEAR() + '-YH-' + workerCode + '-' + (seed || String(Date.now()).slice(-6));
  }

  function reviewUnlocked_(data) {
    data = data || {};
    var current = findOne_(REGISTRATIONS, 'request_id', data.request_id);
    if (!current) throw error_('NOT_FOUND', '找不到這筆註冊申請。');
    if (String(current.status) === 'approved' || String(current.status) === 'rejected') {
      return { registration: publicRegistration_(current), previously_completed: true };
    }

    var approved = String(data.decision) === 'approve';
    var now = now_();
    var status = approved ? 'approved' : 'rejected';
    var profile = parseProfile_(current);
    profile.socialBureauReviewStatus = status;
    profile.socialBureauReviewedAt = now;
    profile.socialBureauReviewNote = String(data.note || '');
    profile.profileReviewedAt = now;
    profile.profileCompletionStatus = approved
      ? String(profile.profileCompletionStatus || 'submitted')
      : 'returned';
    profile.profileReturnReason = approved ? null : String(data.note || '');

    var visitorId = String(current.visitor_id || '');
    var accountId = String(current.account_id || '');
    if (approved) {
      visitorId = visitorId || visitorIdFor_(current);
      accountId = accountId || 'acct_' + Utilities.getUuid();
      profile.visitorCode = visitorId;
      profile.qrCodePayload = profile.qrCodePayload || '';

      var visitor = findOne_(VISITORS, 'visitor_id', visitorId);
      var visitorPatch = {
        visitor_id: visitorId,
        name: String(current.full_name || ''),
        id_number: String(profile.nationalId || ''),
        phone: String(profile.phone || ''),
        email: normalizeEmail_(current.email),
        service_areas: String(profile.rootUnitName || ''),
        volunteer_group: String(profile.workerGroup || ''),
        status: '已核准',
        badge_no: String((visitor && visitor.badge_no) || ('BADGE-' + visitorId)),
        photo_url: String(profile.headshotProcessedUrl || ''),
        registered_at: String((visitor && visitor.registered_at) || current.submitted_at || now),
        approved_at: now,
        updated_at: now,
      };
      if (visitor) SheetHelper.updateByKey(VISITORS, 'visitor_id', visitorId, visitorPatch);
      else SheetHelper.appendRow(VISITORS, visitorPatch);

      var account = findAccountByEmail_(current.email);
      var accountPatch = {
        account_id: String((account && account.account_id) || accountId),
        email: normalizeEmail_(current.email),
        visitor_id: visitorId,
        full_name: String(current.full_name || ''),
        role_key: String(data.role_key || current.requested_role_key || 'visitor'),
        status: String((account && account.status) || 'pending_activation'),
        password_hash: String((account && account.password_hash) || ''),
        password_salt: String((account && account.password_salt) || ''),
        password_params: String((account && account.password_params) || ''),
        invite_token_hash: String((account && account.invite_token_hash) || ''),
        invite_expires_at: String((account && account.invite_expires_at) || ''),
        reset_token_hash: String((account && account.reset_token_hash) || ''),
        reset_expires_at: String((account && account.reset_expires_at) || ''),
        password_updated_at: String((account && account.password_updated_at) || ''),
        last_login_at: String((account && account.last_login_at) || ''),
        created_at: String((account && account.created_at) || now),
        updated_at: now,
      };
      accountId = accountPatch.account_id;
      if (account) SheetHelper.updateByKey(ACCOUNTS, 'account_id', account.account_id, accountPatch);
      else SheetHelper.appendRow(ACCOUNTS, accountPatch);
    }

    var updated = SheetHelper.updateByKey(REGISTRATIONS, 'request_id', current.request_id, {
      account_id: accountId,
      requested_workspace_id: String(data.workspace_id || current.requested_workspace_id || ''),
      requested_role_key: String(data.role_key || current.requested_role_key || 'visitor'),
      status: status,
      review_note: String(data.note || (approved ? '承辦管理者已核准加入。' : '承辦管理者已退回申請。')),
      reviewed_at: now,
      visitor_id: visitorId,
      profile_json: JSON.stringify(profile),
      updated_at: now,
    });
    return { registration: publicRegistration_(updated), previously_completed: false };
  }

  function reviewRegistration(data) {
    return withLock_(function () { return reviewUnlocked_(data); });
  }

  function batchReview(data) {
    return withLock_(function () {
      var ids = (data && data.request_ids) || [];
      var results = [];
      for (var i = 0; i < ids.length; i++) {
        try {
          results.push(reviewUnlocked_({
            request_id: ids[i],
            decision: data.decision || 'approve',
            role_key: data.role_key || 'visitor',
            workspace_id: data.workspace_id,
            note: data.note,
          }));
        } catch (e) {
          results.push({ request_id: ids[i], error: e.message, code: e.code || 'INTERNAL_ERROR' });
        }
      }
      return results;
    });
  }

  function getAuthByEmail(email) {
    ensureSchema_();
    var account = findAccountByEmail_(email);
    if (!account) return null;
    return {
      account_id: String(account.account_id || ''),
      email: normalizeEmail_(account.email),
      visitor_id: String(account.visitor_id || ''),
      full_name: String(account.full_name || ''),
      role_key: String(account.role_key || 'visitor'),
      status: String(account.status || ''),
      password_hash: String(account.password_hash || ''),
      password_salt: String(account.password_salt || ''),
      password_params: String(account.password_params || ''),
    };
  }

  function issueToken(data) {
    return withLock_(function () {
      data = data || {};
      var registration = findOne_(REGISTRATIONS, 'request_id', data.request_id);
      if (!registration || String(registration.status) !== 'approved') {
        throw error_('ACCOUNT_NOT_APPROVED', '此訪員尚未核准或找不到帳號資料。');
      }
      var account = findAccountByEmail_(registration.email);
      if (!account) throw error_('ACCOUNT_NOT_FOUND', '核准資料尚未建立訪員帳號。');
      var mode = String(data.mode || 'invite');
      if (mode === 'recovery' && String(account.status) !== 'active') {
        throw error_('ACCOUNT_NOT_ACTIVATED', '此訪員帳號尚未啟用，請先產生設定密碼連結。');
      }
      if (!data.token_hash || !data.expires_at || !data.setup_url) {
        throw error_('VALIDATION_ERROR', '缺少 token hash、期限或設定密碼網址。');
      }
      var patch = { updated_at: now_() };
      if (mode === 'recovery') {
        patch.reset_token_hash = String(data.token_hash);
        patch.reset_expires_at = String(data.expires_at);
      } else {
        patch.invite_token_hash = String(data.token_hash);
        patch.invite_expires_at = String(data.expires_at);
      }
      SheetHelper.updateByKey(ACCOUNTS, 'account_id', account.account_id, patch);

      var profile = parseProfile_(registration);
      if (mode === 'invite') {
        profile.authInviteStatus = 'sent';
        profile.authInvitedAt = now_();
        profile.authInviteSentCount = Number(profile.authInviteSentCount || 0) + 1;
        SheetHelper.updateByKey(REGISTRATIONS, 'request_id', registration.request_id, {
          profile_json: JSON.stringify(profile),
          updated_at: now_(),
        });
      }
      var subject = mode === 'recovery'
        ? '永和區訪查平台－重設密碼'
        : '永和區訪查平台－設定登入密碼';
      var actionLabel = mode === 'recovery' ? '重設密碼' : '設定密碼';
      try {
        MailApp.sendEmail({
          to: normalizeEmail_(registration.email),
          subject: subject,
          body: [
            String(registration.full_name || '') + ' 您好：',
            '',
            '請在 30 分鐘內開啟下列一次性連結' + actionLabel + '：',
            String(data.setup_url),
            '',
            '若您未提出這項要求，請忽略此信。',
          ].join('\n'),
        });
      } catch (mailError) {
        throw error_('EMAIL_SEND_FAILED', '密碼連結已建立，但 Email 寄送失敗；請重新產生連結。');
      }
      return {
        request_id: String(registration.request_id),
        email: normalizeEmail_(registration.email),
        full_name: String(registration.full_name || ''),
        mode: mode,
        expires_at: String(data.expires_at),
      };
    });
  }

  function setPassword(data) {
    return withLock_(function () {
      data = data || {};
      var mode = String(data.mode || 'invite');
      var hashField = mode === 'recovery' ? 'reset_token_hash' : 'invite_token_hash';
      var expiryField = mode === 'recovery' ? 'reset_expires_at' : 'invite_expires_at';
      var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(ACCOUNTS));
      var account = null;
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][hashField] || '') === String(data.token_hash || '')) {
          account = rows[i];
          break;
        }
      }
      if (!account || !data.token_hash) throw error_('TOKEN_INVALID', '設定密碼連結無效或已使用。');
      var expiry = new Date(String(account[expiryField] || '')).getTime();
      if (!expiry || expiry <= Date.now()) throw error_('TOKEN_EXPIRED', '設定密碼連結已過期，請請管理者重新產生。');
      if (!data.password_hash || !data.password_salt || !data.password_params) {
        throw error_('VALIDATION_ERROR', '缺少密碼雜湊資料。');
      }
      var now = now_();
      var patch = {
        password_hash: String(data.password_hash),
        password_salt: String(data.password_salt),
        password_params: String(data.password_params),
        status: 'active',
        password_updated_at: now,
        invite_token_hash: '',
        invite_expires_at: '',
        reset_token_hash: '',
        reset_expires_at: '',
        updated_at: now,
      };
      SheetHelper.updateByKey(ACCOUNTS, 'account_id', account.account_id, patch);

      var registrations = SheetHelper.rowsToObjects(SheetHelper.getSheet(REGISTRATIONS));
      for (var r = 0; r < registrations.length; r++) {
        if (normalizeEmail_(registrations[r].email) !== normalizeEmail_(account.email)) continue;
        var profile = parseProfile_(registrations[r]);
        profile.authInviteStatus = 'activated';
        profile.authActivatedAt = now;
        SheetHelper.updateByKey(REGISTRATIONS, 'request_id', registrations[r].request_id, {
          profile_json: JSON.stringify(profile),
          updated_at: now,
        });
      }
      return {
        account_id: String(account.account_id),
        email: normalizeEmail_(account.email),
        visitor_id: String(account.visitor_id || ''),
        full_name: String(account.full_name || ''),
        role_key: String(account.role_key || 'visitor'),
        status: 'active',
      };
    });
  }

  function markLogin(data) {
    return withLock_(function () {
      var account = findAccountByEmail_(data && data.email);
      if (!account) return false;
      SheetHelper.updateByKey(ACCOUNTS, 'account_id', account.account_id, {
        last_login_at: now_(),
        updated_at: now_(),
      });
      return true;
    });
  }

  return {
    registrations: {
      list: listRegistrations,
      get: getRegistration,
      create: createRegistration,
      review: reviewRegistration,
      batchReview: batchReview,
    },
    accounts: {
      getAuthByEmail: getAuthByEmail,
      issueToken: issueToken,
      setPassword: setPassword,
      markLogin: markLogin,
    },
  };
})();
