/**
 * 訪查員／建檔／稽核計費統計（讀個案進度分桶索引 + 計費參數）
 */
var WorkerFeeStatsModule = (function () {
  var INDEX = Config.SHEET_NAMES.CASE_PROGRESS_BUCKET_INDEX;

  function morphFromStatus_(status, markOutcome) {
    var s = String(status || '').trim();
    if (s === '已完成' || s === '訪視成功' || s === '完成') return 'success';
    if (s === '拒絕訪視' || s === '拒訪') return 'refused';
    if (s === '查無此人' || s === '地址錯誤') return 'not_found';
    if (s === '住址不詳') return 'addr_unknown';
    if (s === '未遇' || s === '空訪' || s.indexOf('未遇') >= 0) return 'missed';
    var o = String(markOutcome || '').trim();
    if (o === '已完成' || o === '訪視成功' || o === '完成' || o === 'success') return 'success';
    if (o === '拒訪' || o === '拒絕訪視' || o === 'refused') return 'refused';
    if (o === '查無此人' || o === 'not_found') return 'not_found';
    if (o === '住址不詳' || o === 'addr_unknown') return 'addr_unknown';
    if (o === '未遇' || o === 'missed') return 'missed';
    return 'missed';
  }

  function emptyCounts_() {
    return { success: 0, missed: 0, refused: 0, not_found: 0, addr_unknown: 0, total_cases: 0 };
  }

  function ensurePerson_(map, key, name, role) {
    if (!map[key]) {
      map[key] = {
        person_key: key,
        name: name,
        role: role,
        counts: emptyCounts_(),
        amounts: { visit: 0, builder: 0, audit: 0, total: 0 },
      };
    }
    return map[key];
  }

  function bump_(person, morph, track, amount) {
    person.counts[morph] = (person.counts[morph] || 0) + 1;
    person.counts.total_cases += 1;
    if (track === 'visit') person.amounts.visit += amount;
    else if (track === 'builder') person.amounts.builder += amount;
    else person.amounts.audit += amount;
    person.amounts.total = person.amounts.visit + person.amounts.builder + person.amounts.audit;
  }

  function fee_(card, track, morph) {
    if (track === 'visit') return Number(card.visit[morph] || 0);
    if (track === 'builder') return Number(card.builder[morph] || 0);
    return Number(card.audit[morph] || 0);
  }

  function summary(params) {
    params = params || {};
    var villageFilter = String(params.village_name || params.village || '').trim();
    var card = FeeRateConfig.getActiveCard();

    var indexRows = [];
    try {
      indexRows = SheetHelper.rowsToObjects(SheetHelper.getSheet(INDEX));
    } catch (e) {
      indexRows = [];
    }

    var byPerson = {};
    var caseWarnings = [];
    var casesCounted = 0;
    var dualCases = 0;
    var morphTotals = emptyCounts_();

    indexRows.forEach(function (row) {
      var caseId = String(row.case_id || '').trim();
      if (!caseId) return;
      var cfFlag = String(row.has_careform || '').trim().toUpperCase();
      var markFlag = String(row.has_direct_mark || '').trim().toUpperCase();
      var hasCf = cfFlag === 'Y' || cfFlag === 'TRUE' || cfFlag === '1';
      var hasMark = markFlag === 'Y' || markFlag === 'TRUE' || markFlag === '1';
      if (!hasCf && !hasMark) return;

      var village = String(row.village || '').trim();
      if (villageFilter && village !== villageFilter) return;

      var civil = String(row.civil_worker_name || '').trim();
      var social = String(row.social_worker_name || '').trim();
      var builder = String(row.builder_name || '').trim();
      var morph = morphFromStatus_(row.visit_status, row.mark_outcome);

      // require_audit_pass: index has no audit flag; when ON, skip until Phase enrich — note only
      var visitAmt = fee_(card, 'visit', morph);
      var builderAmt = fee_(card, 'builder', morph);
      var auditAmt = fee_(card, 'audit', morph);

      var caseTotal = 0;
      var isDual = Boolean(civil && social);
      if (isDual) dualCases += 1;

      if (civil) {
        var pc = ensurePerson_(byPerson, 'civil:' + civil, civil, 'civil');
        bump_(pc, morph, 'visit', visitAmt);
        caseTotal += visitAmt;
      }
      if (social) {
        var ps = ensurePerson_(byPerson, 'social:' + social, social, 'social');
        bump_(ps, morph, 'visit', visitAmt);
        caseTotal += visitAmt;
      }
      // single visitor name without side labels — rare; channel-only builder cases
      if (!civil && !social && builder && String(row.channel || '').indexOf('直KEY') >= 0) {
        // direct key without worker names: no visit fee attribution
      }

      if (builder && card.builderFeeOnlyToBuilder) {
        var pb = ensurePerson_(byPerson, 'builder:' + builder, builder, 'builder');
        bump_(pb, morph, 'builder', builderAmt);
        caseTotal += builderAmt;
      }

      var auditName = card.auditPayeeName || '沈煒庭';
      var pa = ensurePerson_(byPerson, 'audit:' + auditName, auditName, 'audit');
      bump_(pa, morph, 'audit', auditAmt);
      caseTotal += auditAmt;

      morphTotals[morph] = (morphTotals[morph] || 0) + 1;
      morphTotals.total_cases += 1;
      casesCounted += 1;

      var cap = isDual ? card.capJoint : card.capSolo;
      if (card.overrunMode === 'soft_warn_only' && caseTotal > cap) {
        caseWarnings.push({
          case_id: caseId,
          name: String(row.name || ''),
          village: village,
          morph: morph,
          is_joint: isDual,
          case_total: caseTotal,
          cap: cap,
          message: '案內加總 ' + caseTotal + ' 元超過參考上限 ' + cap + ' 元（僅警示，不折減）',
        });
      }
    });

    var workers = Object.keys(byPerson)
      .map(function (k) {
        return byPerson[k];
      })
      .sort(function (a, b) {
        return b.amounts.total - a.amounts.total || String(a.name).localeCompare(String(b.name), 'zh-Hant');
      });

    var visitors = workers.filter(function (w) {
      return w.role === 'civil' || w.role === 'social' || w.role === 'visitor';
    });
    var builders = workers.filter(function (w) {
      return w.role === 'builder';
    });
    var auditors = workers.filter(function (w) {
      return w.role === 'audit';
    });

    return {
      computed_at: new Date().toISOString(),
      village_filter: villageFilter || null,
      rate_card: card,
      notes: [
        '金額依 Google Sheet「計費參數」試算；改 Sheet 免部署。',
        '社政＋民政各發訪視費；建檔費只給建檔人；稽核費給設定受款人（預設沈煒庭）。',
        '共同訪視（雙側）警示上限 ' + card.capJoint + '；獨訪 ' + card.capSolo + '；超額不折減。',
        card.requireAuditPass ? '目前設定「稽核通過才計費」為開；本版索引尚未帶稽核旗標，請知悉。' : '稽核通過才計費：關（預設）。',
        '本統計以個案進度分桶索引為來源；若索引過舊請先於個案進度按「強制重算」。',
      ],
      totals: {
        cases_counted: casesCounted,
        dual_cases: dualCases,
        visitor_people: visitors.length,
        builder_people: builders.length,
        morph: morphTotals,
        amount_visit: visitors.reduce(function (s, w) {
          return s + w.amounts.visit;
        }, 0),
        amount_builder: builders.reduce(function (s, w) {
          return s + w.amounts.builder;
        }, 0),
        amount_audit: auditors.reduce(function (s, w) {
          return s + w.amounts.audit;
        }, 0),
      },
      visitors: visitors,
      builders: builders,
      auditors: auditors,
      case_warnings: caseWarnings.slice(0, 50),
      case_warnings_total: caseWarnings.length,
    };
  }

  function getRateCard() {
    return FeeRateConfig.getActiveCard();
  }

  function listParams() {
    return FeeRateConfig.listParams();
  }

  function upsertParams(body) {
    return FeeRateConfig.upsertParams(body || {});
  }

  return {
    summary: summary,
    getRateCard: getRateCard,
    listParams: listParams,
    upsertParams: upsertParams,
  };
})();
