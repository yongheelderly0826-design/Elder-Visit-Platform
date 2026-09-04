var AttendanceModule = (function () {
  var SHEET = Config.SHEET_NAMES.ATTENDANCE;
  var EXTRA_HEADERS = [
    'channel',
    'site_id',
    'site_name',
    'group_id',
    'group_name',
    'worker_name',
    'id_number',
    'source',
  ];
  var SESSION_VOLUNTEER = '志工出勤';
  var SESSION_VISIT = '訪查';
  var VISIT_SITE_ID = 'SITE-VISIT';

  function ensureSchema_() {
    SheetHelper.ensureColumns(Config.SHEET_NAMES.VISITORS, ['volunteer_group']);
    SheetHelper.ensureColumns(SHEET, EXTRA_HEADERS);
  }

  function todayTaipei_() {
    return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  }

  function nowIso_() {
    return new Date().toISOString();
  }

  function asDateText_(value) {
    if (!value && value !== 0) return '';
    if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, 'Asia/Taipei', 'yyyy-MM-dd');
    }
    return String(value).slice(0, 10);
  }

  function asTimeText_(value) {
    if (!value && value !== 0) return '';
    var date = value;
    if (Object.prototype.toString.call(value) !== '[object Date]') {
      date = new Date(value);
    }
    if (isNaN(date.getTime())) return String(value);
    return Utilities.formatDate(date, 'Asia/Taipei', 'HH:mm');
  }

  function hoursText_(minutes) {
    var n = parseInt(minutes, 10);
    if (!n && n !== 0) return '';
    return String(Math.round((n / 60) * 10) / 10);
  }

  function durationMinutes_(checkinAt, checkoutAt) {
    var start = new Date(checkinAt).getTime();
    var end = new Date(checkoutAt).getTime();
    if (!isFinite(start) || !isFinite(end) || end < start) return 0;
    return Math.round((end - start) / 60000);
  }

  function channelLabel_(channel, source) {
    if (source === 'visit' || channel === 'gps') return '到宅訪查';
    if (source === 'office_kiosk' || channel === 'barcode') return '公所刷證';
    if (channel === 'qr') return '外勤QR';
    return channel || source || '';
  }

  function throwError_(code, message) {
    var err = new Error(message);
    err.code = code;
    throw err;
  }

  function normalizeSessionType_(value) {
    var raw = String(value || SESSION_VOLUNTEER).trim();
    if (raw === SESSION_VISIT || raw === 'visit') return SESSION_VISIT;
    return SESSION_VOLUNTEER;
  }

  function isVisitRow_(row) {
    return normalizeSessionType_(row.session_type) === SESSION_VISIT;
  }

  function resolveVisitor_(data) {
    var visitor = null;
    if (data.visitor_id) visitor = VisitorModule.get(data.visitor_id);
    if (!visitor && data.id_number) visitor = VisitorModule.getByIdNumber(data.id_number);
    if (!visitor) throwError_('NOT_FOUND', '找不到志工／訪員資料，請確認身分證或先建檔');
    return visitor;
  }

  function resolveSite_(siteId, fallbackKiosk, isVisit) {
    if (isVisit) {
      var visitSite = VolunteerAttendanceCatalog.getSite(VISIT_SITE_ID);
      if (visitSite) return visitSite;
      return { id: VISIT_SITE_ID, name: '到宅訪查', group_id: 'elder_care', kind: 'visit' };
    }
    if (!siteId && fallbackKiosk) return VolunteerAttendanceCatalog.getSite('SITE-KIOSK');
    var site = VolunteerAttendanceCatalog.getSite(siteId);
    if (!site) throwError_('VALIDATION_ERROR', '無效的出勤地點 QR，請重新掃描海報');
    return site;
  }

  /**
   * @param {string} visitorId
   * @param {string} sessionDate
   * @param {{ session_type?: string, assignment_id?: string }=} opts
   */
  function findOpen_(visitorId, sessionDate, opts) {
    opts = opts || {};
    var wantVisit = normalizeSessionType_(opts.session_type) === SESSION_VISIT;
    var assignmentId = opts.assignment_id ? String(opts.assignment_id) : '';
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    for (var i = rows.length - 1; i >= 0; i--) {
      var row = rows[i];
      if (String(row.visitor_id) !== String(visitorId)) continue;
      if (asDateText_(row.session_date) !== sessionDate) continue;
      if (row.checkout_at) continue;
      if (wantVisit) {
        if (!isVisitRow_(row)) continue;
        if (assignmentId && String(row.assignment_id || '') !== assignmentId) continue;
      } else if (isVisitRow_(row)) {
        continue;
      }
      return row;
    }
    return null;
  }

  function enrichVisitor_(visitor) {
    var group = VolunteerAttendanceCatalog.getGroup(visitor.volunteer_group);
    return {
      visitor_id: visitor.visitor_id,
      name: visitor.name || '',
      phone: visitor.phone || '',
      id_number: visitor.id_number || '',
      volunteer_group: visitor.volunteer_group || '',
      group_name: group ? group.name : (visitor.volunteer_group || ''),
      status: visitor.status || '',
      badge_no: visitor.badge_no || '',
    };
  }

  function requireVisitAssignment_(assignmentId) {
    if (!assignmentId) throwError_('VALIDATION_ERROR', '訪查簽到退必須指定派案編號');
    var assignment = AssignmentModule.get(assignmentId);
    if (!assignment || !assignment.assignment_id) {
      throwError_('NOT_FOUND', '找不到派案，無法到宅簽到');
    }
    return assignment;
  }

  function checkin(data) {
    ensureSchema_();
    var sessionType = normalizeSessionType_(data.session_type);
    var isVisit = sessionType === SESSION_VISIT;
    var visitor = resolveVisitor_(data);
    var sessionDate = data.session_date || todayTaipei_();
    var assignmentId = data.assignment_id || '';

    if (isVisit) {
      var assignment = requireVisitAssignment_(assignmentId);
      if (assignment.visitor_id && String(assignment.visitor_id) !== String(visitor.visitor_id)) {
        // 允許承辦代測：若 body 未帶 visitor 則改用派案訪員
        if (!data.visitor_id && !data.id_number) {
          visitor = VisitorModule.get(assignment.visitor_id) || visitor;
        }
      }
      if (!visitor) throwError_('NOT_FOUND', '派案尚未指定訪員');
    }

    var open = findOpen_(visitor.visitor_id, sessionDate, {
      session_type: sessionType,
      assignment_id: isVisit ? assignmentId : '',
    });
    if (open) {
      throwError_(
        'ALREADY_CHECKED_IN',
        isVisit ? '此派案今日已簽到尚未簽退' : '今日志工出勤已簽到尚未簽退'
      );
    }

    var isKiosk = data.channel === 'barcode' || data.source === 'office_kiosk';
    var site = resolveSite_(data.site_id, isKiosk, isVisit);
    var groupId = visitor.volunteer_group || site.group_id || '';
    var group = VolunteerAttendanceCatalog.getGroup(groupId);

    var record = {
      attendance_id: 'ATT-' + Utilities.getUuid().slice(0, 8),
      visitor_id: visitor.visitor_id,
      assignment_id: isVisit ? assignmentId : (data.assignment_id || ''),
      session_date: sessionDate,
      checkin_at: nowIso_(),
      checkout_at: '',
      checkin_lat: data.lat || '',
      checkin_lng: data.lng || '',
      checkout_lat: '',
      checkout_lng: '',
      session_type: sessionType,
      duration_minutes: '',
      channel: data.channel || (isVisit ? 'gps' : (isKiosk ? 'barcode' : 'qr')),
      site_id: site.id,
      site_name: site.name,
      group_id: groupId,
      group_name: group ? group.name : groupId,
      worker_name: visitor.name || '',
      id_number: visitor.id_number || '',
      source: data.source || (isVisit ? 'visit' : (isKiosk ? 'office_kiosk' : 'field_qr')),
    };
    return SheetHelper.appendRow(SHEET, record);
  }

  function checkout(data) {
    ensureSchema_();
    var sessionType = normalizeSessionType_(data.session_type);
    var record = null;
    if (data.attendance_id) {
      record = SheetHelper.findByKey(SHEET, 'attendance_id', data.attendance_id)[0] || null;
    }
    if (!record && (data.visitor_id || data.id_number)) {
      var visitor = resolveVisitor_(data);
      record = findOpen_(visitor.visitor_id, data.session_date || todayTaipei_(), {
        session_type: sessionType,
        assignment_id: data.assignment_id || '',
      });
    }
    if (!record) throwError_('NOT_FOUND', '沒有可簽退的出勤紀錄');
    if (record.checkout_at) throwError_('ALREADY_CHECKED_OUT', '此筆已簽退');

    var checkoutAt = nowIso_();
    return SheetHelper.updateByKey(SHEET, 'attendance_id', record.attendance_id, {
      checkout_at: checkoutAt,
      checkout_lat: data.lat || '',
      checkout_lng: data.lng || '',
      duration_minutes: durationMinutes_(record.checkin_at, checkoutAt),
    });
  }

  function clock(data) {
    ensureSchema_();
    data = data || {};
    var sessionType = normalizeSessionType_(data.session_type);
    var isVisit = sessionType === SESSION_VISIT;
    if (isVisit) {
      var assignment = requireVisitAssignment_(data.assignment_id);
      if (!data.visitor_id && !data.id_number) {
        data.visitor_id = assignment.visitor_id;
      }
    }

    var visitor = resolveVisitor_(data);
    var sessionDate = data.session_date || todayTaipei_();
    var open = findOpen_(visitor.visitor_id, sessionDate, {
      session_type: sessionType,
      assignment_id: isVisit ? data.assignment_id : '',
    });
    if (open) {
      return {
        action: 'checkout',
        record: checkout({
          attendance_id: open.attendance_id,
          session_type: sessionType,
          lat: data.lat,
          lng: data.lng,
        }),
        visitor: enrichVisitor_(visitor),
      };
    }
    return {
      action: 'checkin',
      record: checkin(data),
      visitor: enrichVisitor_(visitor),
    };
  }

  function identify(data) {
    ensureSchema_();
    Validation.requireFields(data || {}, ['id_number']);
    var visitor = VisitorModule.getByIdNumber(data.id_number);
    if (!visitor) throwError_('NOT_FOUND', '找不到志工資料，請確認身分證或請承辦先建檔');
    var status = String(visitor.status || '');
    if (status === '停用' || status === '駁回') {
      throwError_('FORBIDDEN', '此志工帳號已停用，無法出勤');
    }
    return {
      visitor: enrichVisitor_(visitor),
      today: todayTaipei_(),
      open: findOpen_(visitor.visitor_id, todayTaipei_(), { session_type: SESSION_VOLUNTEER }),
    };
  }

  function status(params) {
    ensureSchema_();
    params = params || {};
    var sessionType = normalizeSessionType_(params.session_type);
    var visitor;
    if (sessionType === SESSION_VISIT && params.assignment_id && !params.visitor_id && !params.id_number) {
      var assignment = requireVisitAssignment_(params.assignment_id);
      visitor = VisitorModule.get(assignment.visitor_id);
      if (!visitor) throwError_('NOT_FOUND', '派案尚未指定訪員');
    } else {
      visitor = resolveVisitor_(params);
    }
    var sessionDate = params.session_date || todayTaipei_();
    var open = findOpen_(visitor.visitor_id, sessionDate, {
      session_type: sessionType,
      assignment_id: params.assignment_id || '',
    });
    var latest = null;
    if (sessionType === SESSION_VISIT && params.assignment_id) {
      var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
      for (var i = rows.length - 1; i >= 0; i--) {
        var row = rows[i];
        if (String(row.assignment_id || '') !== String(params.assignment_id)) continue;
        if (!isVisitRow_(row)) continue;
        latest = row;
        break;
      }
    }
    return {
      visitor: enrichVisitor_(visitor),
      today: sessionDate,
      open: open,
      latest: latest,
      session_type: sessionType,
    };
  }

  function list(params) {
    ensureSchema_();
    params = params || {};
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    var period = params.period || '';
    if (period) {
      rows = rows.filter(function (row) {
        return asDateText_(row.session_date).indexOf(period) === 0;
      });
    }
    if (params.group_id) {
      rows = rows.filter(function (row) {
        return String(row.group_id) === String(params.group_id);
      });
    }
    if (params.visitor_id) {
      rows = rows.filter(function (row) {
        return String(row.visitor_id) === String(params.visitor_id);
      });
    }
    if (params.assignment_id) {
      rows = rows.filter(function (row) {
        return String(row.assignment_id || '') === String(params.assignment_id);
      });
    }
    if (params.session_type) {
      var want = normalizeSessionType_(params.session_type);
      rows = rows.filter(function (row) {
        return normalizeSessionType_(row.session_type) === want;
      });
    }
    return rows.map(function (row) {
      row.session_date = asDateText_(row.session_date);
      return row;
    });
  }

  function monthlyExport(params) {
    Validation.requireFields(params || {}, ['period']);
    // 月結 Excel 只含 12 組志工出勤，不含派案到宅訪查
    var rows = list({
      period: params.period,
      group_id: params.group_id,
      session_type: SESSION_VOLUNTEER,
    });
    var table = [[
      '年月',
      '組別',
      '姓名',
      '身分證字號',
      '志工編號',
      '日期',
      '簽到時間',
      '簽退時間',
      '出勤時數',
      '簽到方式',
      '地點',
      '出勤編號',
    ]];
    rows.forEach(function (row) {
      table.push([
        params.period,
        row.group_name || '',
        row.worker_name || '',
        row.id_number || '',
        row.visitor_id || '',
        asDateText_(row.session_date),
        asTimeText_(row.checkin_at),
        asTimeText_(row.checkout_at),
        hoursText_(row.duration_minutes),
        channelLabel_(row.channel, row.source),
        row.site_name || '',
        row.attendance_id || '',
      ]);
    });

    var file = MohwLifeCareExporter.createNamedXlsxFile(
      table,
      '志工出勤_' + params.period + '.xlsx',
      '志工出勤 ' + params.period,
      { propertyKey: 'VOLUNTEER_ATTENDANCE_FOLDER_ID', folderName: '志工出勤月結' }
    );

    return {
      period: params.period,
      row_count: rows.length,
      file_name: file.fileName,
      file_url: file.fileUrl,
      file_id: file.fileId,
    };
  }

  function catalog() {
    return {
      groups: VolunteerAttendanceCatalog.listGroups(),
      sites: VolunteerAttendanceCatalog.listSites(),
    };
  }

  return {
    checkin: checkin,
    checkout: checkout,
    clock: clock,
    identify: identify,
    status: status,
    list: list,
    monthlyExport: monthlyExport,
    catalog: catalog,
  };
})();
