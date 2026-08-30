var PaymentModule = (function () {
  var SHEET = Config.SHEET_NAMES.PAYMENTS;

  function calculate(data) {
    Validation.requireFields(data, ['visitor_id', 'period']);
    var attendance = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.ATTENDANCE)
    );
    var visitorRecords = attendance.filter(function (a) {
      return a.visitor_id === data.visitor_id;
    });
    var totalMinutes = visitorRecords.reduce(function (sum, a) {
      return sum + (parseInt(a.duration_minutes, 10) || 0);
    }, 0);

    var record = {
      payment_id: 'PAY-' + Utilities.getUuid().slice(0, 8),
      visitor_id: data.visitor_id,
      period: data.period,
      visit_count: visitorRecords.length,
      total_hours: Math.round(totalMinutes / 60 * 10) / 10,
      amount: 0, // TODO: apply pricing rules from Config
      status: '待計算',
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
