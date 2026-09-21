var PaymentModule = (function () {
  var SHEET = Config.SHEET_NAMES.PAYMENTS;
  var EXTRA_HEADERS = ['rule_code', 'rule_label'];

  function ensureSchema_() {
    SheetHelper.ensureColumns(SHEET, EXTRA_HEADERS);
  }

  function asDateText_(value) {
    if (!value && value !== 0) return '';
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, 'Asia/Taipei', 'yyyy-MM-dd');
    }
    return String(value).slice(0, 10);
  }

  function calculate(data) {
    ensureSchema_();
    Validation.requireFields(data, ['visitor_id', 'period']);
    var visitor = VisitorModule.get(data.visitor_id);
    if (!visitor) {
      var missing = new Error('找不到志工／訪查員：' + data.visitor_id);
      missing.code = 'NOT_FOUND';
      throw missing;
    }

    var attendance = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.ATTENDANCE)
    );
    var visitorRecords = attendance.filter(function (row) {
      if (String(row.visitor_id) !== String(data.visitor_id)) return false;
      if (String(row.session_type || '') === '訪查') return false;
      var day = asDateText_(row.session_date || row.checkin_at);
      return VolunteerTransportFees.dateInPeriod(day, data.period);
    }).map(function (row) {
      row.session_date = asDateText_(row.session_date || row.checkin_at);
      return row;
    });

    var totalMinutes = visitorRecords.reduce(function (sum, row) {
      return sum + (parseInt(row.duration_minutes, 10) || 0);
    }, 0);
    var totalHours = Math.round((totalMinutes / 60) * 10) / 10;
    var group =
      data.group ||
      data.volunteer_group ||
      visitor.volunteer_group ||
      (visitorRecords[0] && (visitorRecords[0].group_id || visitorRecords[0].group_name)) ||
      '';
    var tripCount = VolunteerTransportFees.countMealTrips(visitorRecords);
    var fee = VolunteerTransportFees.calculate({
      group: group,
      hours: totalHours,
      tripCount: tripCount,
    });
    var visitCount = fee.rule_code === 'meal' ? fee.trip_count : visitorRecords.length;

    var record = {
      payment_id: 'PAY-' + Utilities.getUuid().slice(0, 8),
      visitor_id: data.visitor_id,
      period: data.period,
      visit_count: visitCount,
      total_hours: totalHours,
      amount: fee.amount,
      status: '待計算',
      rule_code: fee.rule_code,
      rule_label: fee.rule_label,
    };
    return SheetHelper.appendRow(SHEET, record);
  }

  function visitItemsFromIndex(index) {
    var VISIT_FEE = 180;
    var DATA_FEE = 30;
    var byCase = {};
    index.careforms.forEach(function (careform) {
      if (String(careform.status) !== '已稽核') return;
      var caseRow = VisitRecordIndex.caseForCareform(index, careform);
      if (!caseRow) return;
      var audit = VisitRecordIndex.latestAudit(index, careform.careform_id);
      if (audit && String(audit.decision || '') && String(audit.decision) !== '通過') return;
      byCase[String(caseRow.case_id)] = { careform: careform, caseRow: caseRow, audit: audit };
    });
    return Object.keys(byCase).map(function (caseId) {
      var row = byCase[caseId];
      return {
        id: row.careform.careform_id,
        case_id: row.caseRow.case_id,
        case_code: row.caseRow.external_id || row.caseRow.encoded_id || row.caseRow.case_id,
        elder_name: row.caseRow.name || '',
        visit_record_id: row.careform.careform_id,
        locked_at: row.careform.audited_at || (row.audit && row.audit.decided_at) || '',
        visit_fee: VISIT_FEE,
        data_processing_fee: DATA_FEE,
        total_fee: VISIT_FEE + DATA_FEE,
        status: 'locked',
      };
    });
  }

  function visitBatchPreview() {
    var cacheKey = ReadCache.key('payVisit');
    var cached = ReadCache.getJson(cacheKey);
    if (cached) return cached;
    var items = visitItemsFromIndex(VisitRecordIndex.build());
    var total = items.reduce(function (sum, item) {
      return sum + (item.total_fee || 0);
    }, 0);
    var payload = {
      batch_no: 'PB-VISIT-' + Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd'),
      item_count: items.length,
      total_amount: total,
      items: items,
      warnings: items.length ? [] : ['目前沒有稽核通過、可列入核銷的訪視。'],
    };
    ReadCache.putJson(cacheKey, payload);
    return payload;
  }

  function createVisitBatch() {
    var preview = visitBatchPreview();
    if (!preview.items.length) {
      var err = new Error('目前沒有稽核通過、可列入核銷的訪視。');
      err.code = 'NO_LOCKED_PAYMENTS';
      throw err;
    }
    ensureSchema_();
    var record = {
      payment_id: 'PAY-' + Utilities.getUuid().slice(0, 8),
      visitor_id: 'VISIT-FEE',
      period: Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM'),
      visit_count: preview.item_count,
      total_hours: 0,
      amount: preview.total_amount,
      status: '已鎖定',
      rule_code: 'visit_fee',
      rule_label: '訪視費 180 + 資料處理費 30',
      locked_at: new Date().toISOString(),
    };
    SheetHelper.appendRow(SHEET, record);
    ReadCache.bump();
    preview.batch_no = record.payment_id;
    preview.payment_id = record.payment_id;
    return preview;
  }

  function lock(data) {
    Validation.requireFields(data, ['payment_id']);
    ensureSchema_();
    var updated = SheetHelper.updateByKey(SHEET, 'payment_id', data.payment_id, {
      status: '已鎖定',
      locked_at: new Date().toISOString(),
    });
    if (!updated) {
      var missing = new Error('找不到核銷紀錄：' + data.payment_id);
      missing.code = 'NOT_FOUND';
      throw missing;
    }
    ReadCache.bump();
    return updated;
  }

  return {
    calculate: calculate,
    lock: lock,
    visitItemsFromIndex: visitItemsFromIndex,
    visitBatchPreview: visitBatchPreview,
    createVisitBatch: createVisitBatch,
  };
})();
