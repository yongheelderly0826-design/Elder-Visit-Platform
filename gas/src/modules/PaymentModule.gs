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

  function lock(data) {
    Validation.requireFields(data, ['payment_id']);
    data.status = '已鎖定';
    data.locked_at = new Date().toISOString();
    return data;
  }

  return { calculate: calculate, lock: lock };
})();
