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
      seq: Number(row.seq) || 0,
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

  function parseAnswers_(raw) {
    if (!raw) return {};
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      return {};
    }
  }

  function visitorSide_(visitor) {
    var group = String((visitor && (visitor.volunteer_group || visitor.worker_group)) || '')
      .trim()
      .toLowerCase();
    if (group.indexOf('social') !== -1 || group.indexOf('社政') !== -1) return 'social';
    if (group.indexOf('civil') !== -1 || group.indexOf('民政') !== -1) return 'civil';
    var id = String((visitor && visitor.visitor_id) || '').toUpperCase();
    if (id.indexOf('-SOC-') !== -1) return 'social';
    if (id.indexOf('-CIV-') !== -1) return 'civil';
    return '';
  }

  function sideLabel_(side) {
    if (side === 'social') return '社政';
    if (side === 'civil') return '民政';
    return '';
  }

  function findIndexRow_(bucket, seq) {
    ensureSchema_();
    var wantBucket = String(bucket || '').trim();
    var wantSeq = Number(seq) || 0;
    if (!wantBucket || !wantSeq) return null;
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(INDEX));
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].bucket || '') === wantBucket && (Number(rows[i].seq) || 0) === wantSeq) {
        return rows[i];
      }
    }
    return null;
  }

  function findRosterById_(nid) {
    ensureSchema_();
    var want = normId_(nid);
    if (!want) return null;
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(ROSTER));
    for (var i = 0; i < rows.length; i++) {
      if (normId_(rows[i].national_id) === want) return rows[i];
    }
    return null;
  }

  function findCaseByNationalId_(index, nid) {
    var want = normId_(nid);
    if (!want) return null;
    for (var i = 0; i < index.cases.length; i++) {
      if (normId_(index.cases[i].id_number) === want) return index.cases[i];
    }
    return null;
  }

  function allCareformsForCase_(index, caseId) {
    var found = [];
    (index.assignmentsByCase[String(caseId || '').trim()] || []).forEach(function (assignment) {
      (index.careformsByAssignment[String(assignment.assignment_id || '').trim()] || []).forEach(
        function (careform) {
          found.push({ careform: careform, assignment: assignment });
        }
      );
    });
    found.sort(function (a, b) {
      var at = String(a.careform.submitted_at || a.careform.audited_at || '');
      var bt = String(b.careform.submitted_at || b.careform.audited_at || '');
      return at < bt ? -1 : at > bt ? 1 : 0;
    });
    return found;
  }

  function deskLogsForCase_(caseId) {
    var id = String(caseId || '').trim();
    if (!id) return [];
    return SheetHelper.rowsToObjects(SheetHelper.getSheet(Config.SHEET_NAMES.DESK_KEY_LOGS)).filter(
      function (row) {
        return String(row.case_id || '').trim() === id;
      }
    );
  }

  function marksForCase_(caseId) {
    var id = String(caseId || '').trim();
    if (!id) return [];
    return SheetHelper.rowsToObjects(SheetHelper.getSheet(MARKS)).filter(function (row) {
      if (String(row.case_id || '').trim() !== id) return false;
      return String(row.status || 'active') === 'active';
    });
  }

  function mapCareformDetail_(index, pair, deskLogs) {
    var careform = pair.careform;
    var assignment = pair.assignment;
    var answers = parseAnswers_(careform.answers_json);
    var visitorId = String(careform.visitor_id || assignment.visitor_id || '').trim();
    var visitor = (index.visitorById && index.visitorById[visitorId]) || {};
    var visitorName = String(visitor.name || '').trim();
    var side = visitorSide_(visitor);
    var careformId = String(careform.careform_id || '').trim();

    var deskMatch = null;
    for (var i = 0; i < deskLogs.length; i++) {
      if (String(deskLogs[i].careform_id || '').trim() === careformId) {
        deskMatch = deskLogs[i];
        break;
      }
    }

    var keyedBy = '';
    var keyedSource = '';
    if (deskMatch) {
      keyedBy =
        String(deskMatch.display_name || '').trim() ||
        String(deskMatch.clerk_id || '').trim() ||
        'TEMP';
      keyedSource = 'desk_temp';
    } else if (visitorName) {
      keyedBy = visitorName;
      keyedSource = 'visitor';
    } else if (visitorId) {
      keyedBy = visitorId;
      keyedSource = 'visitor';
    }

    return {
      careform_id: careformId,
      status: String(careform.status || ''),
      submitted_at: String(careform.submitted_at || '') || null,
      audited_at: String(careform.audited_at || '') || null,
      visit_result: String(careform.visit_result || answers.visit_status || '') || null,
      visit_date: String(answers.visit_date || '') || null,
      visit_start_time: String(answers.visit_start_time || answers.visit_time_start || '') || null,
      visit_end_time: String(answers.visit_end_time || answers.visit_time_end || '') || null,
      keyed_by_name: keyedBy || null,
      keyed_source: keyedSource || null,
      keyed_clerk_id: deskMatch ? String(deskMatch.clerk_id || '') || null : null,
      visitor_side: side || null,
      visitor_side_label: sideLabel_(side) || null,
      civil_worker_name: String(answers.civil_worker_name || '').trim() || null,
      social_worker_name: String(answers.social_worker_name || '').trim() || null,
      civil_worker_date: String(answers.civil_worker_date || '').trim() || null,
      social_worker_date: String(answers.social_worker_date || '').trim() || null,
    };
  }

  function mapMarkDetail_(row) {
    return {
      mark_id: String(row.mark_id || ''),
      outcome: String(row.outcome || ''),
      source: String(row.source || '') || null,
      civil_worker_id: String(row.civil_worker_id || '') || null,
      civil_worker_name: String(row.civil_worker_name || '') || null,
      social_worker_id: String(row.social_worker_id || '') || null,
      social_worker_name: String(row.social_worker_name || '') || null,
      keyed_by_id: String(row.keyed_by_id || '') || null,
      keyed_by_name: String(row.keyed_by_name || '') || null,
      reported_at: String(row.reported_at || '') || null,
      reported_by: String(row.reported_by || '') || null,
      village_name: String(row.village_name || '') || null,
    };
  }

  function mapDeskLogDetail_(row) {
    return {
      log_id: String(row.log_id || ''),
      clerk_id: String(row.clerk_id || '') || null,
      display_name: String(row.display_name || '') || null,
      careform_id: String(row.careform_id || '') || null,
      visit_result: String(row.visit_result || '') || null,
      visit_date: String(row.visit_date || '') || null,
      keyed_at: String(row.keyed_at || row.created_at || '') || null,
    };
  }

  function getCaseDetail(params) {
    params = params || {};
    ensureSchema_();

    var caseId = String(params.case_id || '').trim();
    var nationalId = normId_(params.national_id);
    var bucket = String(params.bucket || '').trim();
    var seq = Number(params.seq) || 0;
    var notes = [];
    var indexRow = null;

    if (!caseId && !nationalId && bucket && seq) {
      indexRow = findIndexRow_(bucket, seq);
      if (!indexRow) {
        var missing = new Error('找不到分桶索引列');
        missing.code = 'NOT_FOUND';
        throw missing;
      }
      caseId = String(indexRow.case_id || '').trim();
      nationalId = normId_(indexRow.national_id);
    }

    if (!caseId && !nationalId) {
      var bad = new Error('請提供 case_id、national_id，或 bucket+seq');
      bad.code = 'VALIDATION_ERROR';
      throw bad;
    }

    var index = VisitRecordIndex.build();
    var caseRow = null;
    if (caseId && index.caseById[caseId]) {
      caseRow = index.caseById[caseId];
    } else if (nationalId) {
      caseRow = findCaseByNationalId_(index, nationalId);
      if (caseRow) caseId = String(caseRow.case_id || '').trim();
    }

    if (caseRow && !nationalId) {
      nationalId = normId_(caseRow.id_number);
    }

    var roster = nationalId ? findRosterById_(nationalId) : null;
    if (!caseRow && !roster && indexRow) {
      roster = {
        national_id: indexRow.national_id,
        name: indexRow.name,
        village: indexRow.village,
        roster_status: indexRow.roster_status,
      };
    }

    if (!caseRow && !roster) {
      var nf = new Error('找不到個案或清冊列');
      nf.code = 'NOT_FOUND';
      throw nf;
    }

    var deskLogs = caseId ? deskLogsForCase_(caseId) : [];
    var marks = caseId ? marksForCase_(caseId) : [];
    var careformPairs = caseId ? allCareformsForCase_(index, caseId) : [];
    var careforms = careformPairs.map(function (pair) {
      return mapCareformDetail_(index, pair, deskLogs);
    });

    var hasCareform = careforms.some(function (cf) {
      return VisitRecordIndex.ELIGIBLE[String(cf.status || '')];
    });
    var hasMark = marks.length > 0;
    var visitStatus = caseRow ? String(caseRow.visit_status || '') : '';
    var village = caseRow
      ? String(caseRow.visit_village || caseRow.household_village || '').trim()
      : String((roster && roster.village) || (indexRow && indexRow.village) || '').trim();
    var rosterStatus = roster
      ? String(roster.roster_status || '')
      : indexRow
        ? String(indexRow.roster_status || '')
        : '';
    var channel = '';
    if (caseRow) {
      channel =
        hasCareform && hasMark
          ? '關懷表+直KEY'
          : hasCareform
            ? '已KEY關懷表'
            : hasMark
              ? '直KEY'
              : '無痕跡';
    } else {
      channel = '僅清冊';
      notes.push('系統無名冊／無關懷表（僅清冊快照列）。');
    }

    if (caseRow && !roster) {
      notes.push('清冊快照無此身分證對應列。');
    }
    if (caseRow && !hasCareform && hasMark) {
      notes.push('僅有直 KEY 標記、尚無（或無 eligible）關懷表。');
    }
    if (caseRow && !hasCareform && !hasMark) {
      notes.push('系統尚無關懷表與直 KEY 痕跡。');
    }

    var rawName = caseRow
      ? String(caseRow.name || '')
      : String((roster && roster.name) || (indexRow && indexRow.name) || '');

    var civilName = '';
    var socialName = '';
    careforms.forEach(function (cf) {
      if (!civilName && cf.civil_worker_name) civilName = cf.civil_worker_name;
      if (!socialName && cf.social_worker_name) socialName = cf.social_worker_name;
    });
    marks.forEach(function (m) {
      var mapped = mapMarkDetail_(m);
      if (!civilName && mapped.civil_worker_name) civilName = mapped.civil_worker_name;
      if (!socialName && mapped.social_worker_name) socialName = mapped.social_worker_name;
    });

    return {
      case_id: caseId || '',
      name_masked: maskName_(rawName),
      id_masked: maskId_(nationalId),
      village: village,
      visit_status: visitStatus,
      roster_status: rosterStatus,
      channel: channel,
      has_careform: hasCareform,
      has_direct_mark: hasMark,
      roster_only: !caseRow,
      system_only: Boolean(caseRow && !roster),
      civil_worker_name: civilName || null,
      social_worker_name: socialName || null,
      careforms: careforms,
      marks: marks.map(mapMarkDetail_),
      desk_logs: deskLogs
        .slice()
        .sort(function (a, b) {
          var at = String(a.keyed_at || a.created_at || '');
          var bt = String(b.keyed_at || b.created_at || '');
          return at < bt ? -1 : at > bt ? 1 : 0;
        })
        .map(mapDeskLogDetail_),
      notes: notes,
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
        '點選分桶可開啟全量名單（分頁）；再點列可看訪視／KEY 詳情。大桶來自分桶索引，請於強制重算後使用。',
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
    getCaseDetail: getCaseDetail,
    replaceRosterSnapshot: replaceRosterSnapshot,
    rosterMeta: rosterMeta,
  };
})();
