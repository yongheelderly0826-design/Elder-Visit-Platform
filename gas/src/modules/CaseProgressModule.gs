/**
 * 個案視角進度＋清冊全量對照。
 * 「有紀錄」= eligible 關懷表 ∪ 直 KEY mark；兩者分開標示。
 * 清冊狀態來自「清冊快照」表（需先匯入）。
 * 分桶全量名單：summary 重算時寫入「個案進度分桶索引」，listBucket 分頁讀取。
 */
var CaseProgressModule = (function () {
  var ROSTER = Config.SHEET_NAMES.ROSTER_SNAPSHOT;
  var CACHE = Config.SHEET_NAMES.CASE_PROGRESS_CACHE;
  var INDEX = Config.SHEET_NAMES.CASE_PROGRESS_BUCKET_INDEX;
  var MARKS = Config.SHEET_NAMES.MOHW_PROGRESS_MARKS;

  var BUCKET_KEYS = [
    'A_roster_result_careform',
    'B_roster_result_direct',
    'C_roster_result_no_trace',
    'D_careform_roster_pending',
    'E_both_pending_with_mark',
    'E_both_pending',
    'F_roster_only_pending',
    'F_roster_only_result',
    'F_system_only',
  ];

  var ROSTER_HEADERS = [
    'snapshot_id',
    'national_id',
    'name',
    'village',
    'roster_status',
    'living_address',
    'living_note',
    'completed_at',
    'imported_at',
  ];

  var CACHE_HEADERS = ['cache_id', 'payload_json', 'roster_snapshot_id', 'computed_at', 'row_count'];

  var INDEX_HEADERS = [
    'bucket',
    'seq',
    'case_id',
    'national_id',
    'name',
    'village',
    'visit_status',
    'roster_status',
    'channel',
    'mark_outcome',
    'has_careform',
    'has_direct_mark',
  ];

  function ensureSchema_() {
    SheetHelper.ensureSheet(ROSTER, ROSTER_HEADERS);
    SheetHelper.ensureSheet(CACHE, CACHE_HEADERS);
    SheetHelper.ensureSheet(INDEX, INDEX_HEADERS);
  }

  function normId_(v) {
    return String(v || '')
      .trim()
      .toUpperCase()
      .replace(/[\s\-]/g, '');
  }

  function maskName_(name) {
    var s = String(name || '').trim();
    if (!s) return '—';
    if (s.length === 1) return s;
    if (s.length === 2) return s[0] + '○';
    return s[0] + '○' + s.slice(-1);
  }

  function maskId_(id) {
    var s = normId_(id);
    if (s.length < 5) return '—';
    return s.slice(0, 3) + '****' + s.slice(-4);
  }

  function isPendingStatus_(status) {
    var s = String(status || '').trim();
    return !s || s === '待訪' || s === '未訪' || s === '進行中' || s === '空訪';
  }

  function rosterHasResult_(status) {
    var s = String(status || '').trim();
    return Boolean(s) && s !== '待訪';
  }

  function systemIncomplete_(visitStatus) {
    return isPendingStatus_(visitStatus);
  }

  function emptyBuckets_() {
    return {
      A_roster_result_careform: 0,
      B_roster_result_direct: 0,
      C_roster_result_no_trace: 0,
      D_careform_roster_pending: 0,
      E_both_pending_with_mark: 0,
      E_both_pending: 0,
      F_roster_only_pending: 0,
      F_roster_only_result: 0,
      F_system_only: 0,
    };
  }

  function toIndexRow_(bucket, seq, sample, rawName, rawId) {
    return {
      bucket: bucket,
      seq: seq,
      case_id: sample.case_id || '',
      national_id: normId_(rawId),
      name: String(rawName || '').trim(),
      village: sample.village || '',
      visit_status: sample.visit_status || '',
      roster_status: sample.roster_status || '',
      channel: sample.channel || '',
      mark_outcome: sample.mark_outcome || '',
      has_careform: sample.has_careform ? 'Y' : 'N',
      has_direct_mark: sample.has_direct_mark ? 'Y' : 'N',
    };
  }

  function maskIndexRow_(row) {
    return {
      case_id: String(row.case_id || ''),
      name_masked: maskName_(row.name),
      id_masked: maskId_(row.national_id),
      village: String(row.village || ''),
      visit_status: String(row.visit_status || ''),
      has_careform: String(row.has_careform || '') === 'Y',
      has_direct_mark: String(row.has_direct_mark || '') === 'Y',
      mark_outcome: String(row.mark_outcome || ''),
      roster_status: String(row.roster_status || ''),
      channel: String(row.channel || ''),
    };
  }

  function saveBucketIndex_(rows) {
    ensureSchema_();
    var sheet = SheetHelper.getSheet(INDEX);
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }
    rows = rows || [];
    if (!rows.length) return 0;

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var chunk = 500;
    for (var i = 0; i < rows.length; i += chunk) {
      var slice = rows.slice(i, i + chunk);
      var values = slice.map(function (obj) {
        return headers.map(function (h) {
          return obj[h] !== undefined ? obj[h] : '';
        });
      });
      // getRange(row, column, numRows, numColumns)
      sheet.getRange(2 + i, 1, values.length, headers.length).setValues(values);
    }
    return rows.length;
  }

  function buildLiveSummary_(params) {
    params = params || {};
    var villageFilter = String(params.village_name || '').trim();
    var includeSamples = String(params.include_samples || 'true') !== 'false';
    var sampleLimit = Math.min(Math.max(parseInt(params.sample_limit, 10) || 30, 5), 100);
    var writeIndex = String(params.write_index || 'true') !== 'false';

    ensureSchema_();
    var index = VisitRecordIndex.build();
    var marks = SheetHelper.rowsToObjects(SheetHelper.getSheet(MARKS)).filter(function (row) {
      return String(row.status || 'active') === 'active';
    });
    var markByCase = {};
    marks.forEach(function (row) {
      var caseId = String(row.case_id || '').trim();
      if (!caseId) return;
      markByCase[caseId] = row;
    });

    var rosterRows = SheetHelper.rowsToObjects(SheetHelper.getSheet(ROSTER));
    var rosterById = {};
    var snapshotId = '';
    rosterRows.forEach(function (row) {
      var nid = normId_(row.national_id);
      if (!nid) return;
      rosterById[nid] = row;
      if (!snapshotId && row.snapshot_id) snapshotId = String(row.snapshot_id);
    });

    var channel = {
      careform: 0,
      direct_mark: 0,
      both: 0,
      none: 0,
      any_record: 0,
    };
    var visitStatusCounts = {};
    var gaps = {
      mark_but_unvisited: 0,
      careform_but_unvisited: 0,
    };
    var buckets = emptyBuckets_();
    var rosterStatusCross = {};
    var samplesByBucket = {};
    var indexRows = [];

    function pushSample(bucket, item) {
      if (!includeSamples) return;
      if (!samplesByBucket[bucket]) samplesByBucket[bucket] = [];
      if (samplesByBucket[bucket].length >= sampleLimit) return;
      samplesByBucket[bucket].push(item);
    }

    function pushBucket(bucket, sample, rawName, rawId) {
      buckets[bucket] += 1;
      if (writeIndex) {
        indexRows.push(toIndexRow_(bucket, buckets[bucket], sample, rawName, rawId));
      }
      pushSample(bucket, sample);
    }

    var seenRosterIds = {};
    var systemTotal = 0;

    index.cases.forEach(function (caseRow) {
      var caseId = String(caseRow.case_id || '').trim();
      if (!caseId) return;
      var village = String(caseRow.visit_village || caseRow.household_village || '').trim();
      if (villageFilter && village !== villageFilter) return;
      systemTotal += 1;

      var visitStatus = String(caseRow.visit_status || '').trim() || '（空白）';
      visitStatusCounts[visitStatus] = (visitStatusCounts[visitStatus] || 0) + 1;

      var hasCareform = Boolean(VisitRecordIndex.latestEligibleCareformForCase(index, caseId));
      var mark = markByCase[caseId] || null;
      var hasMark = Boolean(mark);

      if (hasCareform && hasMark) channel.both += 1;
      else if (hasCareform) channel.careform += 1;
      else if (hasMark) channel.direct_mark += 1;
      else channel.none += 1;
      if (hasCareform || hasMark) channel.any_record += 1;

      if (hasMark && !hasCareform && systemIncomplete_(caseRow.visit_status)) {
        gaps.mark_but_unvisited += 1;
      }
      if (hasCareform && systemIncomplete_(caseRow.visit_status)) {
        gaps.careform_but_unvisited += 1;
      }

      var nid = normId_(caseRow.id_number);
      var roster = nid ? rosterById[nid] : null;
      if (nid && roster) seenRosterIds[nid] = true;

      var sample = {
        case_id: caseId,
        name_masked: maskName_(caseRow.name),
        id_masked: maskId_(nid),
        village: village,
        visit_status: String(caseRow.visit_status || ''),
        has_careform: hasCareform,
        has_direct_mark: hasMark,
        mark_outcome: mark ? String(mark.outcome || '') : '',
        roster_status: roster ? String(roster.roster_status || '') : '',
        channel: hasCareform && hasMark ? '關懷表+直KEY' : hasCareform ? '已KEY關懷表' : hasMark ? '直KEY' : '無痕跡',
      };

      if (!roster) {
        pushBucket('F_system_only', sample, caseRow.name, nid);
        return;
      }

      var rStatus = String(roster.roster_status || '').trim();
      if (!rosterStatusCross[rStatus]) {
        rosterStatusCross[rStatus] = { total: 0, careform: 0, direct: 0, none: 0, both: 0 };
      }
      rosterStatusCross[rStatus].total += 1;
      if (hasCareform && hasMark) rosterStatusCross[rStatus].both += 1;
      else if (hasCareform) rosterStatusCross[rStatus].careform += 1;
      else if (hasMark) rosterStatusCross[rStatus].direct += 1;
      else rosterStatusCross[rStatus].none += 1;

      var rosterResult = rosterHasResult_(rStatus);
      var rosterPending = !rosterResult;

      if (rosterResult && hasCareform) {
        pushBucket('A_roster_result_careform', sample, caseRow.name, nid);
      } else if (rosterResult && hasMark) {
        pushBucket('B_roster_result_direct', sample, caseRow.name, nid);
      } else if (rosterResult && !hasCareform && !hasMark) {
        pushBucket('C_roster_result_no_trace', sample, caseRow.name, nid);
      } else if (rosterPending && hasCareform) {
        pushBucket('D_careform_roster_pending', sample, caseRow.name, nid);
      } else if (rosterPending && hasMark) {
        pushBucket('E_both_pending_with_mark', sample, caseRow.name, nid);
      } else {
        pushBucket('E_both_pending', sample, caseRow.name, nid);
      }
    });

    Object.keys(rosterById).forEach(function (nid) {
      if (seenRosterIds[nid]) return;
      var roster = rosterById[nid];
      var village = String(roster.village || '').trim();
      if (villageFilter && village !== villageFilter) return;
      var sample = {
        case_id: '',
        name_masked: maskName_(roster.name),
        id_masked: maskId_(nid),
        village: village,
        visit_status: '',
        has_careform: false,
        has_direct_mark: false,
        mark_outcome: '',
        roster_status: String(roster.roster_status || ''),
        channel: '僅清冊',
      };
      if (rosterHasResult_(roster.roster_status)) {
        pushBucket('F_roster_only_result', sample, roster.name, nid);
      } else {
        pushBucket('F_roster_only_pending', sample, roster.name, nid);
      }
    });

    var rosterTotal = Object.keys(rosterById).length;
    var bothSides =
      buckets.A_roster_result_careform +
      buckets.B_roster_result_direct +
      buckets.C_roster_result_no_trace +
      buckets.D_careform_roster_pending +
      buckets.E_both_pending_with_mark +
      buckets.E_both_pending;

    return {
      computed_at: new Date().toISOString(),
      village_filter: villageFilter || null,
      roster: {
        loaded: rosterTotal > 0,
        snapshot_id: snapshotId || null,
        total: rosterTotal,
        both_sides: bothSides,
        system_only: buckets.F_system_only,
        roster_only: buckets.F_roster_only_pending + buckets.F_roster_only_result,
      },
      totals: {
        system_roster: systemTotal,
        careform_keyed: channel.careform + channel.both,
        direct_keyed: channel.direct_mark,
        both_channels: channel.both,
        no_trace: channel.none,
        any_record: channel.any_record,
        incomplete_visit_status: Object.keys(visitStatusCounts).reduce(function (sum, key) {
          if (systemIncomplete_(key === '（空白）' ? '' : key)) {
            return sum + visitStatusCounts[key];
          }
          return sum;
        }, 0),
        completion_rate:
          systemTotal > 0 ? Math.round((channel.any_record / systemTotal) * 1000) / 10 : 0,
      },
      channels: channel,
      visit_status_counts: visitStatusCounts,
      gaps: gaps,
      buckets: buckets,
      roster_status_cross: rosterStatusCross,
      samples_by_bucket: samplesByBucket,
      notes: [
        '「直 KEY」= 本平台 MOHW 進度標記（proxy），不代表衛福後台一定已 KEY 成功。',
        '「已 KEY 關懷表」= 關懷表狀態為已提交／已稽核。',
        '「有紀錄」= 關懷表 ∪ 直 KEY（兩者皆分別標示）。',
        '點選分桶可開啟全量名單（分頁）；大桶來自分桶索引，請於強制重算後使用。',
      ],
      _index_rows: indexRows,
    };
  }

  function saveCache_(payload) {
    ensureSchema_();
    SheetHelper.clearDataRows(CACHE);
    SheetHelper.appendRows(CACHE, [
      {
        cache_id: 'CACHE-CASE-PROGRESS',
        payload_json: JSON.stringify(payload),
        roster_snapshot_id: (payload.roster && payload.roster.snapshot_id) || '',
        computed_at: payload.computed_at || new Date().toISOString(),
        row_count: (payload.totals && payload.totals.system_roster) || 0,
      },
    ]);
  }

  function readCache_() {
    ensureSchema_();
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(CACHE));
    if (!rows.length) return null;
    try {
      return JSON.parse(String(rows[0].payload_json || '{}'));
    } catch (e) {
      return null;
    }
  }

  function summary(params) {
    params = params || {};
    var force = String(params.force_refresh || '') === 'true' || params.force_refresh === true;
    if (!force) {
      var cached = readCache_();
      if (cached && cached.totals) {
        cached.from_cache = true;
        return cached;
      }
    }
    var live = buildLiveSummary_(params);
    var indexRows = live._index_rows || [];
    delete live._index_rows;
    saveBucketIndex_(indexRows);
    live.bucket_index_rows = indexRows.length;
    saveCache_(live);
    live.from_cache = false;
    return live;
  }

  function listBucket(params) {
    params = params || {};
    ensureSchema_();
    var bucket = String(params.bucket || '').trim();
    if (BUCKET_KEYS.indexOf(bucket) === -1) {
      var err = new Error('Unknown bucket: ' + bucket);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    var page = Math.max(parseInt(params.page, 10) || 1, 1);
    var pageSize = Math.min(Math.max(parseInt(params.page_size, 10) || 50, 1), 100);
    var villageFilter = String(params.village || params.village_name || '').trim();

    var all = SheetHelper.rowsToObjects(SheetHelper.getSheet(INDEX)).filter(function (row) {
      if (String(row.bucket || '') !== bucket) return false;
      if (!villageFilter) return true;
      return String(row.village || '').trim() === villageFilter;
    });

    // Stable order by seq
    all.sort(function (a, b) {
      return (Number(a.seq) || 0) - (Number(b.seq) || 0);
    });

    var total = all.length;
    var totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    if (totalPages > 0 && page > totalPages) page = totalPages;
    var start = (page - 1) * pageSize;
    var slice = all.slice(start, start + pageSize).map(maskIndexRow_);

    return {
      bucket: bucket,
      page: page,
      page_size: pageSize,
      total: total,
      total_pages: totalPages,
      village_filter: villageFilter || null,
      index_ready: total > 0 || SheetHelper.getSheet(INDEX).getLastRow() > 1,
      rows: slice,
      notes:
        total === 0
          ? ['此分桶目前無索引列。若摘要人數非 0，請按「強制重算」重建分桶索引後再試。']
          : [],
    };
  }

  function replaceRosterSnapshot(body) {
    body = body || {};
    ensureSchema_();
    var snapshotId = String(body.snapshot_id || '').trim() || 'SNAP-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
    var rows = body.rows || [];
    if (!Array.isArray(rows)) throw new Error('rows must be an array');
    var importedAt = new Date().toISOString();
    var mapped = rows
      .map(function (row) {
        var nid = normId_(row.national_id || row.id_number);
        if (!nid) return null;
        return {
          snapshot_id: snapshotId,
          national_id: nid,
          name: String(row.name || '').trim(),
          village: String(row.village || row.visit_village || '').trim(),
          roster_status: String(row.roster_status || row.status || '').trim(),
          living_address: String(row.living_address || '').trim(),
          living_note: String(row.living_note || '').trim(),
          completed_at: String(row.completed_at || '').trim(),
          imported_at: importedAt,
        };
      })
      .filter(Boolean);

    if (body.append) {
      SheetHelper.appendRows(ROSTER, mapped);
    } else {
      SheetHelper.clearDataRows(ROSTER);
      // batch in chunks of 500
      var chunk = 500;
      for (var i = 0; i < mapped.length; i += chunk) {
        SheetHelper.appendRows(ROSTER, mapped.slice(i, i + chunk));
      }
    }

    var refreshed = null;
    if (body.refresh_summary !== false) {
      refreshed = summary({ force_refresh: true, village_name: body.village_name || '' });
    }

    return {
      snapshot_id: snapshotId,
      written: mapped.length,
      append: Boolean(body.append),
      summary: refreshed,
    };
  }

  function rosterMeta() {
    ensureSchema_();
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(ROSTER));
    var snapshotId = rows.length ? String(rows[0].snapshot_id || '') : '';
    return {
      loaded: rows.length > 0,
      total: rows.length,
      snapshot_id: snapshotId || null,
      imported_at: rows.length ? String(rows[0].imported_at || '') : null,
    };
  }

  return {
    summary: summary,
    listBucket: listBucket,
    replaceRosterSnapshot: replaceRosterSnapshot,
    rosterMeta: rosterMeta,
  };
})();
