var AttendanceModule = (function () {
  var SHEET = Config.SHEET_NAMES.ATTENDANCE;

  function checkin(data) {
    Validation.requireFields(data, ['visitor_id']);
    var record = {
      attendance_id: 'ATT-' + Utilities.getUuid().slice(0, 8),
      visitor_id: data.visitor_id,
      assignment_id: data.assignment_id || '',
      session_date: data.session_date || Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd'),
      checkin_at: new Date().toISOString(),
      checkin_lat: data.lat || '',
      checkin_lng: data.lng || '',
      session_type: data.session_type || '現場',
    };
    return SheetHelper.appendRow(SHEET, record);
  }

  function checkout(data) {
    Validation.requireFields(data, ['attendance_id']);
    data.checkout_at = new Date().toISOString();
    data.checkout_lat = data.lat || '';
    data.checkout_lng = data.lng || '';
    // TODO: calculate duration_minutes from checkin_at
    return data;
  }

  return { checkin: checkin, checkout: checkout };
})();
