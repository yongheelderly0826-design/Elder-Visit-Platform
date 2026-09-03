/**
 * API 路由分派
 * action 格式：module.method（如 visitors.list）
 */

var ApiRouter = (function () {
  var routes = {
    'visitors.list': function (p) { return VisitorModule.list(p); },
    'visitors.get': function (p) { return VisitorModule.get(p.id); },
    'visitors.getByIdNumber': function (p) { return VisitorModule.getByIdNumber(p.id_number || p.id); },
    'visitors.create': function (p, b) { return VisitorModule.create(b); },
    'visitors.update': function (p, b) { return VisitorModule.update(b); },
    'visitors.approve': function (p, b) { return VisitorModule.approve(b); },

    'cases.list': function (p) { return CaseModule.list(p); },
    'cases.get': function (p) { return CaseModule.get(p.id); },
    'cases.getEncoded': function (p) { return CaseModule.getByEncoded(p.code); },
    'cases.import': function (p, b) { return CaseModule.importBatch(b); },

    'assignments.list': function (p) { return AssignmentModule.list(p); },
    'assignments.get': function (p) { return AssignmentModule.get(p.assignment_id || p.id); },
    'assignments.dispatch': function (p, b) { return AssignmentModule.dispatch(b); },
    'assignments.confirm': function (p, b) { return AssignmentModule.confirm(b); },

    'attendance.checkin': function (p, b) { return AttendanceModule.checkin(b); },
    'attendance.checkout': function (p, b) { return AttendanceModule.checkout(b); },
    'attendance.clock': function (p, b) { return AttendanceModule.clock(b); },
    'attendance.identify': function (p, b) {
      return AttendanceModule.identify((b && b.id_number) ? b : p);
    },
    'attendance.status': function (p) { return AttendanceModule.status(p); },
    'attendance.list': function (p) { return AttendanceModule.list(p); },
    'attendance.monthlyExport': function (p, b) {
      return AttendanceModule.monthlyExport((b && b.period) ? b : p);
    },
    'attendance.catalog': function () { return AttendanceModule.catalog(); },

    'careform.get': function (p) { return CareFormModule.get(p.assignment_id); },
    'careform.saveDraft': function (p, b) { return CareFormModule.saveDraft(b); },
    'careform.submit': function (p, b) { return CareFormModule.submit(b); },
    'careform.validate': function (p, b) { return CareFormModule.validate(b); },

    'audit.queue': function (p) { return AuditModule.queue(p); },
    'audit.decide': function (p, b) { return AuditModule.decide(b); },

    'export.lifeCareXlsx': function (p, b) { return ExportModule.exportLifeCareXlsx(b); },
    'export.listCandidates': function (p) { return ExportModule.listCandidates(p); },
    'export.history': function (p) { return ExportModule.history(p); },

    'reports.kpi': function (p) { return ReportModule.kpi(p); },
    'reports.dispatchSummary': function (p) { return ReportModule.dispatchSummary(p); },

    'payments.calculate': function (p, b) { return PaymentModule.calculate(b); },
    'payments.lock': function (p, b) { return PaymentModule.lock(b); },
  };

  function dispatch(action, params, body) {
    var handler = routes[action];
    if (!handler) {
      var err = new Error('Unknown action: ' + action);
      err.code = 'NOT_FOUND';
      throw err;
    }
    return handler(params, body);
  }

  return { dispatch: dispatch };
})();
