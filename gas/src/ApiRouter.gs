/**
 * API 路由分派
 * action 格式：module.method（如 visitors.list）
 */

var ApiRouter = (function () {
  var routes = {
    'visitors.list': function (p) { return VisitorModule.list(p); },
    'visitors.get': function (p) { return VisitorModule.get(p.id); },
    'visitors.create': function (p, b) { return VisitorModule.create(b); },
    'visitors.update': function (p, b) { return VisitorModule.update(b); },
    'visitors.approve': function (p, b) { return VisitorModule.approve(b); },

    'cases.list': function (p) { return CaseModule.list(p); },
    'cases.get': function (p) { return CaseModule.get(p.id); },
    'cases.getEncoded': function (p) { return CaseModule.getByEncoded(p.code); },
    'cases.import': function (p, b) { return CaseModule.importBatch(b); },

    'assignments.list': function (p) { return AssignmentModule.list(p); },
    'assignments.dispatch': function (p, b) { return AssignmentModule.dispatch(b); },
    'assignments.confirm': function (p, b) { return AssignmentModule.confirm(b); },

    'attendance.checkin': function (p, b) { return AttendanceModule.checkin(b); },
    'attendance.checkout': function (p, b) { return AttendanceModule.checkout(b); },

    'careform.get': function (p) { return CareFormModule.get(p.assignment_id); },
    'careform.saveDraft': function (p, b) { return CareFormModule.saveDraft(b); },
    'careform.submit': function (p, b) { return CareFormModule.submit(b); },

    'audit.queue': function (p) { return AuditModule.queue(p); },
    'audit.decide': function (p, b) { return AuditModule.decide(b); },

    'export.lifeCareXlsx': function (p, b) { return ExportModule.exportLifeCareXlsx(b); },
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
