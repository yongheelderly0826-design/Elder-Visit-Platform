/**
 * 訪查員／建檔／稽核計費統計（讀個案進度分桶索引 + 計費參數）
 *
 * 形態（morph）優先序：
 * 1. 有關懷表 → careform visit_result／answers.visit_status（真實關懷表結果）
 * 2. 否則 → 直 KEY mark_outcome
 * 3. 否則 → 個案名冊 visit_status
 *
 * 產品編碼：「一鍵未遇」常寫 visit_result=未遇 且 answers.visit_status=查無此人；
 * 此時必須算未遇（missed），不可被 answers 蓋成查無。
 */
var WorkerFeeStatsModule = (function () {
  var INDEX = Config.SHEET_NAMES.CASE_PROGRESS_BUCKET_INDEX;

  function morphFromLabel_(label) {
    var s = String(label || '').trim();
    if (!s) return null;
    if (s === '已完成' || s === '訪視成功' || s === '完成' || s === '完成訪視' || s === 'success') {
      return 'success';
    }
    if (s === '拒絕訪視' || s === '拒訪' || s === 'refused') return 'refused';
    if (s === '查無此人' || s === '地址錯誤' || s === 'not_found') return 'not_found';
    if (s === '住址不詳' || s === 'addr_unknown') return 'addr_unknown';
    if (s === '未遇' || s === '空訪' || s === 'missed' || s.indexOf('未遇') >= 0) return 'missed';
    return null;
  }

  /**
   * 關懷表形態優先序：
   * - answers 住址不詳／拒訪：真實結果，即使 visit_result=未遇
   * - visit_result=未遇：未遇（含一鍵未遇寫成 answers=查無此人）
   * - 其餘看 answers.visit_status，再看 visit_result
   */
  function morphFromCareform_(visitResult, visitStatus) {
    var vs = String(visitStatus || '').trim();
    var vr = String(visitResult || '').trim();

    if (vs === '住址不詳') return 'addr_unknown';
    if (vs === '拒絕訪視' || vs === '拒訪') return 'refused';

    if (vr === '未遇' || vr.indexOf('未遇') >= 0) return 'missed';

    var fromAnswers = morphFromLabel_(vs);
    if (fromAnswers) return fromAnswers;
    var fromResult = morphFromLabel_(vr);
    if (fromResult) return fromResult;
    return null;
  }

  function resolveCaseMorph_(row, careformOverlay) {
    var hasCf =
      String(row.has_careform || '')
        .trim()
        .toUpperCase() === 'Y' ||
      String(row.has_careform || '')
        .trim()
        .toUpperCase() === 'TRUE' ||
      String(row.has_careform || '').trim() === '1';

    var cfResult = String(row.careform_visit_result || '').trim();
    var cfStatus = String(row.careform_visit_status || '').trim();
    var caseId = String(row.case_id || '').trim();

    if (hasCf && !cfResult && !cfStatus && careformOverlay && caseId && careformOverlay[caseId]) {
      cfResult = String(careformOverlay[caseId].visit_result || '').trim();
      cfStatus = String(careformOverlay[caseId].visit_status || '').trim();
    }

    if (hasCf) {
      var fromCf = morphFromCareform_(cfResult, cfStatus);
      if (fromCf) return fromCf;
    }

    var fromMark = morphFromLabel_(row.mark_outcome);
    if (fromMark) return fromMark;

    var fromCase = morphFromLabel_(row.visit_status);
    if (fromCase) return fromCase;

    return 'missed';
  }

  function parseAnswers_(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(String(raw));
    } catch (e) {
      return {};
    }
  }

  /**
   * 索引尚未寫入 careform_* 欄時的即時補丁：eligible 關懷表 → case_id。
   * 避免等強制重算才看到正確未遇／查無。
   */
  function buildCareformOverlay_() {
    var map = {};
    try {
      var index = VisitRecordIndex.build();
      (index.cases || []).forEach(function (caseRow) {
        var caseId = String(caseRow.case_id || '').trim();
        if (!caseId) return;
        var cf = VisitRecordIndex.latestEligibleCareformForCase(index, caseId);
        if (!cf) return;
        var answers = parseAnswers_(cf.answers_json);
        map[caseId] = {
          visit_result: String(cf.visit_result || '').trim(),
          visit_status: String(answers.visit_status || '').trim(),
        };
      });
    } catch (e) {
      map = {};
    }
    return map;
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

    var needsOverlay = false;
    for (var i = 0; i < indexRows.length; i++) {
      var probe = indexRows[i];
      var cfFlag = String(probe.has_careform || '')
        .trim()
        .toUpperCase();
      var hasCfProbe = cfFlag === 'Y' || cfFlag === 'TRUE' || cfFlag === '1';
      if (
        hasCfProbe &&
        !String(probe.careform_visit_result || '').trim() &&
        !String(probe.careform_visit_status || '').trim()
      ) {
        needsOverlay = true;
        break;
      }
    }
    var careformOverlay = needsOverlay ? buildCareformOverlay_() : null;

    var byPerson = {};
    var caseWarnings = [];
    var casesCounted = 0;
    var dualCases = 0;
    var morphTotals = emptyCounts_();
    var morphSource = needsOverlay ? 'careform_overlay+index' : 'index_careform_fields';

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
      var morph = resolveCaseMorph_(row, careformOverlay);

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
      morph_source: morphSource,
      notes: [
        '金額依 Google Sheet「計費參數」試算；改 Sheet 免部署。',
        '社政＋民政各發訪視費；建檔費只給建檔人；稽核費給設定受款人（預設沈煒庭）。',
        '共同訪視（雙側）警示上限 ' + card.capJoint + '；獨訪 ' + card.capSolo + '；超額不折減。',
        card.requireAuditPass ? '目前設定「稽核通過才計費」為開；本版索引尚未帶稽核旗標，請知悉。' : '稽核通過才計費：關（預設）。',
        '形態優先：有關懷表用 visit_result／answers.visit_status（未遇優先於查無此人）；無關懷表才用直 KEY／名冊。',
        '本統計以個案進度分桶索引為來源；若索引缺 careform_* 欄請於個案進度按「強制重算」（本版會即時 overlay 關懷表）。',
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

/** clasp run workerFeeStatsSummaryForOps */
function workerFeeStatsSummaryForOps() {
  var s = WorkerFeeStatsModule.summary({});
  return {
    computed_at: s.computed_at,
    morph_source: s.morph_source,
    cases_counted: s.totals && s.totals.cases_counted,
    morph: s.totals && s.totals.morph,
  };
}

/** clasp run countVisitOutcomesForOps */
function countVisitOutcomesForOps() {
  return OpsModule.countVisitOutcomes({ eligible_only: true });
}
