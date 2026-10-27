/**
 * 臨時登打帳號（紙本 KEY 論件計酬）
 * 密碼雜湊由 Next 產生；GAS 只存 hash／salt／params。
 */
var DeskClerkModule = (function () {
  var CLERKS = Config.SHEET_NAMES.DESK_CLERKS;
  var LOGS = Config.SHEET_NAMES.DESK_KEY_LOGS;
  var CLERK_HEADERS = [
    'clerk_id', 'display_name', 'status', 'passcode_hash', 'passcode_salt', 'passcode_params',
    'valid_from', 'valid_until', 'created_at', 'updated_at', 'disabled_at', 'last_login_at',
  ];
  var LOG_HEADERS = [
    'log_id', 'clerk_id', 'display_name', 'assignment_id', 'careform_id', 'case_id',
    'case_label', 'visit_result', 'visit_date', 'keyed_at', 'counts_as_piece', 'created_at',
  ];

  function ensureSchema_() {
    SheetHelper.ensureSheet(CLERKS, CLERK_HEADERS);
    SheetHelper.ensureSheet(LOGS, LOG_HEADERS);
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

  function publicClerk_(row, includeSecrets) {
    if (!row) return null;
    var out = {
      clerk_id: String(row.clerk_id || ''),
      display_name: String(row.display_name || ''),
      status: String(row.status || 'disabled'),
      valid_from: String(row.valid_from || '') || null,
      valid_until: String(row.valid_until || '') || null,
      created_at: String(row.created_at || '') || null,
      updated_at: String(row.updated_at || '') || null,
      disabled_at: String(row.disabled_at || '') || null,
      last_login_at: String(row.last_login_at || '') || null,
    };
    if (includeSecrets) {
      out.passcode_hash = String(row.passcode_hash || '');
      out.passcode_salt = String(row.passcode_salt || '');
      out.passcode_params = String(row.passcode_params || '');
    }
    return out;
  }

  function findClerk_(clerkId) {
    var rows = SheetHelper.findByKey(CLERKS, 'clerk_id', String(clerkId || '').trim().toUpperCase());
    return rows[0] || null;
  }

  function isExpired_(row, nowIso) {
    var until = String(row.valid_until || '').trim();
    if (!until) return false;
    var now = Date.parse(nowIso || now_());
    var end = Date.parse(until);
    if (!isFinite(now) || !isFinite(end)) return false;
    return now > end;
  }

  function listClerks() {
    ensureSchema_();
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(CLERKS));
    return rows
      .map(function (row) { return publicClerk_(row, false); })
      .filter(function (row) { return row && row.clerk_id; })
      .sort(function (a, b) { return String(a.clerk_id).localeCompare(String(b.clerk_id)); });
  }

  function getClerk(clerkId, opts) {
    ensureSchema_();
    opts = opts || {};
    var row = findClerk_(clerkId);
    return publicClerk_(row, Boolean(opts.include_secrets));
  }

  function upsertBatch(data) {
    return withLock_(function () {
      data = data || {};
      var items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) throw error_('VALIDATION_ERROR', '沒有可建立的臨時帳號。');
      var now = now_();
      var saved = [];
      for (var i = 0; i < items.length; i++) {
        var item = items[i] || {};
        var clerkId = String(item.clerk_id || '').trim().toUpperCase();
        if (!/^TEMP-\d{2}$/.test(clerkId)) {
          throw error_('VALIDATION_ERROR', '帳號格式須為 TEMP-01～TEMP-99：' + clerkId);
        }
        if (!item.passcode_hash || !item.passcode_salt || !item.passcode_params) {
          throw error_('VALIDATION_ERROR', clerkId + ' 缺少通行碼雜湊。');
        }
        var existing = findClerk_(clerkId);
        var patch = {
          clerk_id: clerkId,
          display_name: String(item.display_name || (existing && existing.display_name) || ''),
          status: String(item.status || 'active'),
          passcode_hash: String(item.passcode_hash),
          passcode_salt: String(item.passcode_salt),
          passcode_params: String(item.passcode_params),
          valid_from: String(item.valid_from || (existing && existing.valid_from) || now),
          valid_until: item.valid_until != null
            ? String(item.valid_until || '')
            : String((existing && existing.valid_until) || ''),
          updated_at: now,
          disabled_at: String(item.status || 'active') === 'disabled' ? now : '',
        };
        if (existing) {
          SheetHelper.updateByKey(CLERKS, 'clerk_id', clerkId, patch);
        } else {
          patch.created_at = now;
          patch.last_login_at = '';
          SheetHelper.appendRow(CLERKS, patch);
        }
        saved.push(publicClerk_(findClerk_(clerkId), false));
      }
      return { items: saved, count: saved.length };
    });
  }

  function setStatus(data) {
    return withLock_(function () {
      data = data || {};
      var clerkId = String(data.clerk_id || '').trim().toUpperCase();
      var status = String(data.status || '').trim();
      if (!clerkId) throw error_('VALIDATION_ERROR', '缺少 clerk_id。');
      if (status !== 'active' && status !== 'disabled') {
        throw error_('VALIDATION_ERROR', 'status 須為 active 或 disabled。');
      }
      var current = findClerk_(clerkId);
      if (!current) throw error_('NOT_FOUND', '找不到臨時帳號 ' + clerkId);
      var now = now_();
      var patch = {
        status: status,
        updated_at: now,
        disabled_at: status === 'disabled' ? now : '',
      };
      if (data.valid_until !== undefined) {
        patch.valid_until = String(data.valid_until || '');
      }
      if (data.display_name !== undefined) {
        patch.display_name = String(data.display_name || '');
      }
      SheetHelper.updateByKey(CLERKS, 'clerk_id', clerkId, patch);
      return publicClerk_(findClerk_(clerkId), false);
    });
  }

  function setStatusBatch(data) {
    return withLock_(function () {
      data = data || {};
      var status = String(data.status || '').trim();
      if (status !== 'active' && status !== 'disabled') {
        throw error_('VALIDATION_ERROR', 'status 須為 active 或 disabled。');
      }
      var ids = Array.isArray(data.clerk_ids) ? data.clerk_ids : [];
      if (!ids.length) throw error_('VALIDATION_ERROR', '請指定 clerk_ids。');
      var now = now_();
      var updated = [];
      for (var i = 0; i < ids.length; i++) {
        var clerkId = String(ids[i] || '').trim().toUpperCase();
        if (!clerkId) continue;
        var current = findClerk_(clerkId);
        if (!current) continue;
        var patch = {
          status: status,
          updated_at: now,
          disabled_at: status === 'disabled' ? now : '',
        };
        if (data.valid_until !== undefined) {
          patch.valid_until = String(data.valid_until || '');
        }
        SheetHelper.updateByKey(CLERKS, 'clerk_id', clerkId, patch);
        updated.push(publicClerk_(findClerk_(clerkId), false));
      }
      return { items: updated, count: updated.length, status: status };
    });
  }

  function disableAll(data) {
    return withLock_(function () {
      var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(CLERKS));
      var now = now_();
      var count = 0;
      for (var i = 0; i < rows.length; i++) {
        var id = String(rows[i].clerk_id || '').trim();
        if (!id) continue;
        SheetHelper.updateByKey(CLERKS, 'clerk_id', id, {
          status: 'disabled',
          updated_at: now,
          disabled_at: now,
        });
        count += 1;
      }
      return { disabled: count, at: now };
    });
  }

  function markLogin(data) {
    return withLock_(function () {
      var clerkId = String((data && data.clerk_id) || '').trim().toUpperCase();
      var current = findClerk_(clerkId);
      if (!current) throw error_('NOT_FOUND', '找不到臨時帳號 ' + clerkId);
      if (String(current.status) !== 'active') {
        throw error_('DISABLED', '此臨時帳號已停用。');
      }
      if (isExpired_(current)) {
        SheetHelper.updateByKey(CLERKS, 'clerk_id', clerkId, {
          status: 'disabled',
          disabled_at: now_(),
          updated_at: now_(),
        });
        throw error_('EXPIRED', '此臨時帳號已到期，無法登入。');
      }
      var now = now_();
      SheetHelper.updateByKey(CLERKS, 'clerk_id', clerkId, {
        last_login_at: now,
        updated_at: now,
      });
      return publicClerk_(findClerk_(clerkId), false);
    });
  }

  function caseHasMissedPiece_(caseId) {
    var id = String(caseId || '').trim();
    if (!id) return false;
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(LOGS));
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].case_id || '').trim() !== id) continue;
      if (String(rows[i].visit_result || '') !== '未遇') continue;
      if (String(rows[i].counts_as_piece) === '1' || String(rows[i].counts_as_piece) === 'true') {
        return true;
      }
    }
    return false;
  }

  function logKey(data) {
    return withLock_(function () {
      data = data || {};
      var clerkId = String(data.clerk_id || '').trim().toUpperCase();
      if (!clerkId) throw error_('VALIDATION_ERROR', '缺少登打帳號。');
      var clerk = findClerk_(clerkId);
      var displayName = String(
        data.display_name || (clerk && clerk.display_name) || clerkId
      );
      var visitResult = String(data.visit_result || '');
      var caseId = String(data.case_id || '').trim();
      var countsAsPiece = 1;
      if (visitResult === '未遇' && caseHasMissedPiece_(caseId)) {
        countsAsPiece = 0;
      }
      var keyedAt = String(data.keyed_at || now_());
      var row = {
        log_id: 'DKL-' + Utilities.getUuid().slice(0, 8),
        clerk_id: clerkId,
        display_name: displayName,
        assignment_id: String(data.assignment_id || ''),
        careform_id: String(data.careform_id || ''),
        case_id: caseId,
        case_label: String(data.case_label || ''),
        visit_result: visitResult,
        visit_date: String(data.visit_date || ''),
        keyed_at: keyedAt,
        counts_as_piece: String(countsAsPiece),
        created_at: now_(),
      };
      SheetHelper.appendRow(LOGS, row);
      return {
        log: row,
        counts_as_piece: countsAsPiece,
      };
    });
  }

  function listLogs(params) {
    ensureSchema_();
    params = params || {};
    var clerkId = String(params.clerk_id || '').trim().toUpperCase();
    var from = String(params.from || '').trim();
    var to = String(params.to || '').trim();
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(LOGS));
    var items = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (clerkId && String(row.clerk_id || '').toUpperCase() !== clerkId) continue;
      var keyedAt = String(row.keyed_at || '');
      if (from && keyedAt && keyedAt < from) continue;
      if (to && keyedAt && keyedAt > to) continue;
      items.push({
        log_id: String(row.log_id || ''),
        clerk_id: String(row.clerk_id || ''),
        display_name: String(row.display_name || ''),
        assignment_id: String(row.assignment_id || ''),
        careform_id: String(row.careform_id || ''),
        case_id: String(row.case_id || ''),
        case_label: String(row.case_label || ''),
        visit_result: String(row.visit_result || ''),
        visit_date: String(row.visit_date || ''),
        keyed_at: keyedAt,
        counts_as_piece: String(row.counts_as_piece) === '1' || String(row.counts_as_piece) === 'true' ? 1 : 0,
      });
    }
    items.sort(function (a, b) {
      return String(b.keyed_at).localeCompare(String(a.keyed_at));
    });
    return { items: items, total: items.length };
  }

  function stats(params) {
    var logs = listLogs(params).items;
    var byClerk = {};
    logs.forEach(function (row) {
      var id = row.clerk_id || 'UNKNOWN';
      if (!byClerk[id]) {
        byClerk[id] = {
          clerk_id: id,
          display_name: row.display_name || id,
          key_count: 0,
          piece_count: 0,
          last_keyed_at: null,
        };
      }
      byClerk[id].key_count += 1;
      byClerk[id].piece_count += row.counts_as_piece ? 1 : 0;
      if (!byClerk[id].last_keyed_at || row.keyed_at > byClerk[id].last_keyed_at) {
        byClerk[id].last_keyed_at = row.keyed_at;
      }
      if (row.display_name) byClerk[id].display_name = row.display_name;
    });
    var clerks = listClerks();
    clerks.forEach(function (clerk) {
      if (!byClerk[clerk.clerk_id]) {
        byClerk[clerk.clerk_id] = {
          clerk_id: clerk.clerk_id,
          display_name: clerk.display_name || clerk.clerk_id,
          key_count: 0,
          piece_count: 0,
          last_keyed_at: null,
        };
      } else if (clerk.display_name) {
        byClerk[clerk.clerk_id].display_name = clerk.display_name;
      }
      byClerk[clerk.clerk_id].status = clerk.status;
      byClerk[clerk.clerk_id].valid_until = clerk.valid_until;
      byClerk[clerk.clerk_id].last_login_at = clerk.last_login_at;
    });
    var items = Object.keys(byClerk)
      .map(function (id) { return byClerk[id]; })
      .sort(function (a, b) { return String(a.clerk_id).localeCompare(String(b.clerk_id)); });
    var pieceTotal = items.reduce(function (sum, row) { return sum + (row.piece_count || 0); }, 0);
    var keyTotal = items.reduce(function (sum, row) { return sum + (row.key_count || 0); }, 0);
    return {
      items: items,
      piece_total: pieceTotal,
      key_total: keyTotal,
    };
  }

  return {
    list: listClerks,
    get: function (clerkId, opts) { return getClerk(clerkId, opts); },
    upsertBatch: upsertBatch,
    setStatus: setStatus,
    setStatusBatch: setStatusBatch,
    disableAll: disableAll,
    markLogin: markLogin,
    logKey: logKey,
    listLogs: listLogs,
    stats: stats,
  };
})();
