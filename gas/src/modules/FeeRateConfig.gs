/**
 * 計費參數 Sheet reader + seed (live truth for fee rates).
 * Typed fallbacks mirror lib/domain/fee-rate-card.ts
 */
var FeeRateConfig = (function () {
  var SHEET = Config.SHEET_NAMES.FEE_RATE_PARAMS;
  var HEADERS = ['key', 'value', 'unit', 'note', 'updated_at', 'updated_by', 'effective_from', 'rate_card_version'];

  var SEEDS = [
    ['fee.rate_card.version', '2026-YH-official-v1', 'version', '費率卡版本'],
    ['fee.rate_card.effective_from', '2026-01-01', 'date', '生效起日'],
    ['fee.visit.success', '180', 'NT$', '實地訪視費・成功'],
    ['fee.visit.missed', '100', 'NT$', '實地訪視費・未遇'],
    ['fee.visit.refused', '30', 'NT$', '實地訪視費・拒訪'],
    ['fee.visit.not_found', '100', 'NT$', '查無・預設＝未遇'],
    ['fee.visit.addr_unknown', '100', 'NT$', '住址不詳・預設＝未遇'],
    ['fee.builder.success', '30', 'NT$', '建檔費・成功（只給建檔人）'],
    ['fee.builder.missed', '20', 'NT$', '建檔費・未遇'],
    ['fee.builder.refused', '20', 'NT$', '建檔費・拒訪'],
    ['fee.builder.not_found', '20', 'NT$', '查無・建檔費'],
    ['fee.builder.addr_unknown', '20', 'NT$', '住址不詳・建檔費'],
    ['fee.builder.builder_only_fallback', '20', 'NT$', '僅建檔無結果時'],
    ['fee.audit.success', '40', 'NT$', '行政稽核費・成功'],
    ['fee.audit.missed', '30', 'NT$', '行政稽核費・未遇'],
    ['fee.audit.refused', '10', 'NT$', '行政稽核費・拒訪'],
    ['fee.audit.not_found', '30', 'NT$', '查無・稽核費'],
    ['fee.audit.addr_unknown', '30', 'NT$', '住址不詳・稽核費'],
    ['fee.audit.payee_name', '沈煒庭', 'text', '稽核費受款人（可改課長）'],
    ['fee.audit.payee_role', '審', 'text', '稽核費受款角色提示'],
    ['rule.dual_civil_social', 'each_full_visit_fee', 'enum', '社政＋民政各發'],
    ['rule.builder_fee_only_to_builder', 'true', 'bool', '建檔費只給建檔人'],
    ['fee.require_audit_pass', 'false', 'bool', '稽核通過才計費（預設關）'],
    ['rule.cap.solo_visit_case', '250', 'NT$', '獨訪參考上限（僅警示）'],
    ['rule.cap.joint_visit_case', '500', 'NT$', '共同訪視參考上限（僅警示）'],
    ['rule.cap.overrun_mode', 'soft_warn_only', 'enum', '超額不砍不擋'],
  ];

  function ensureSeeded_() {
    var sheet = SheetHelper.ensureSheet(SHEET, HEADERS);
    if (sheet.getLastRow() > 1) return sheet;
    var now = new Date().toISOString();
    var version = '2026-YH-official-v1';
    var effective = '2026-01-01';
    var rows = SEEDS.map(function (s) {
      return [s[0], s[1], s[2], s[3], now, 'system-seed', effective, version];
    });
    if (rows.length) {
      sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
    }
    return sheet;
  }

  function num_(map, key, fallback) {
    if (!Object.prototype.hasOwnProperty.call(map, key)) return fallback;
    var n = Number(map[key]);
    return Number.isFinite(n) ? n : fallback;
  }

  function bool_(map, key, fallback) {
    if (!Object.prototype.hasOwnProperty.call(map, key)) return fallback;
    var v = String(map[key]).trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes') return true;
    if (v === 'false' || v === '0' || v === 'no') return false;
    return fallback;
  }

  function getActiveCard() {
    ensureSeeded_();
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    var map = {};
    rows.forEach(function (r) {
      var k = String(r.key || '').trim();
      if (!k) return;
      map[k] = String(r.value != null ? r.value : '').trim();
    });
    var hasAny = Object.keys(map).length > 0;
    return {
      version: map['fee.rate_card.version'] || '2026-YH-official-v1',
      effectiveFrom: map['fee.rate_card.effective_from'] || '2026-01-01',
      visit: {
        success: num_(map, 'fee.visit.success', 180),
        missed: num_(map, 'fee.visit.missed', 100),
        refused: num_(map, 'fee.visit.refused', 30),
        not_found: num_(map, 'fee.visit.not_found', 100),
        addr_unknown: num_(map, 'fee.visit.addr_unknown', 100),
      },
      builder: {
        success: num_(map, 'fee.builder.success', 30),
        missed: num_(map, 'fee.builder.missed', 20),
        refused: num_(map, 'fee.builder.refused', 20),
        not_found: num_(map, 'fee.builder.not_found', 20),
        addr_unknown: num_(map, 'fee.builder.addr_unknown', 20),
      },
      audit: {
        success: num_(map, 'fee.audit.success', 40),
        missed: num_(map, 'fee.audit.missed', 30),
        refused: num_(map, 'fee.audit.refused', 10),
        not_found: num_(map, 'fee.audit.not_found', 30),
        addr_unknown: num_(map, 'fee.audit.addr_unknown', 30),
      },
      builderOnlyFallback: num_(map, 'fee.builder.builder_only_fallback', 20),
      auditPayeeName: map['fee.audit.payee_name'] || '沈煒庭',
      auditPayeeRole: map['fee.audit.payee_role'] || '審',
      dualCivilSocial: map['rule.dual_civil_social'] || 'each_full_visit_fee',
      builderFeeOnlyToBuilder: bool_(map, 'rule.builder_fee_only_to_builder', true),
      requireAuditPass: bool_(map, 'fee.require_audit_pass', false),
      capSolo: num_(map, 'rule.cap.solo_visit_case', 250),
      capJoint: num_(map, 'rule.cap.joint_visit_case', 500),
      overrunMode: map['rule.cap.overrun_mode'] || 'soft_warn_only',
      source: hasAny ? 'sheet' : 'fallback',
    };
  }

  function listParams() {
    ensureSeeded_();
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    return {
      sheet: SHEET,
      rows: rows.map(function (r) {
        return {
          key: String(r.key || ''),
          value: String(r.value != null ? r.value : ''),
          unit: String(r.unit || ''),
          note: String(r.note || ''),
          updated_at: String(r.updated_at || ''),
          updated_by: String(r.updated_by || ''),
          effective_from: String(r.effective_from || ''),
          rate_card_version: String(r.rate_card_version || ''),
        };
      }),
      card: getActiveCard(),
    };
  }

  /**
   * patches: [{ key, value }] — updates existing keys; does not rename keys.
   */
  function upsertParams(body) {
    body = body || {};
    var patches = body.patches || body.rows || [];
    if (!Array.isArray(patches) || !patches.length) {
      throw new Error('patches required');
    }
    ensureSeeded_();
    var sheet = SheetHelper.getSheet(SHEET);
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var keyIdx = headers.indexOf('key');
    var valueIdx = headers.indexOf('value');
    var updatedAtIdx = headers.indexOf('updated_at');
    var updatedByIdx = headers.indexOf('updated_by');
    if (keyIdx < 0 || valueIdx < 0) throw new Error('計費參數 schema missing key/value');

    var byKey = {};
    for (var r = 1; r < data.length; r++) {
      byKey[String(data[r][keyIdx] || '').trim()] = r + 1; // 1-based sheet row
    }

    var now = new Date().toISOString();
    var by = String(body.updated_by || 'manager-ui').trim() || 'manager-ui';
    var written = [];
    var missing = [];

    patches.forEach(function (p) {
      var k = String((p && p.key) || '').trim();
      if (!k) return;
      var v = p.value != null ? String(p.value) : '';
      var rowNum = byKey[k];
      if (!rowNum) {
        missing.push(k);
        return;
      }
      sheet.getRange(rowNum, valueIdx + 1).setValue(v);
      if (updatedAtIdx >= 0) sheet.getRange(rowNum, updatedAtIdx + 1).setValue(now);
      if (updatedByIdx >= 0) sheet.getRange(rowNum, updatedByIdx + 1).setValue(by);
      written.push({ key: k, value: v });
    });

    return {
      written: written.length,
      missing: missing,
      card: getActiveCard(),
      listed: listParams(),
    };
  }

  return {
    ensureSeeded: ensureSeeded_,
    getActiveCard: getActiveCard,
    listParams: listParams,
    upsertParams: upsertParams,
  };
})();
