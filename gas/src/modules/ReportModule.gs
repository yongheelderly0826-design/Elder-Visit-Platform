var ReportModule = (function () {
  var SHEET = Config.SHEET_NAMES.REPORTS;

  function kpi(params) {
    var period = params.period || Config.FISCAL_YEAR();
    var assignments = SheetHelper.rowsToObjects(
      SheetHelper.getSheet(Config.SHEET_NAMES.ASSIGNMENTS)
    );
    var total = assignments.length;
    var completed = assignments.filter(function (a) {
      return a.status === '已完成';
    }).length;
    var missed = assignments.filter(function (a) {
      return a.status === '空訪';
    }).length;

    return {
      period: period,
      total_assignments: total,
      completed: completed,
      missed: missed,
      completion_rate: total > 0 ? Math.round(completed / total * 100) : 0,
    };
  }

  function dispatchSummary(params) {
    return kpi(params);
  }

  return { kpi: kpi, dispatchSummary: dispatchSummary };
})();
