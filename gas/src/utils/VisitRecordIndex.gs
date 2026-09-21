/**
 * 一次讀取個案／派案／關懷表／稽核，用 case_id、assignment_id 串資料。
 * 不可用 encoded_id 當主鍵：匯入曾把多案編成同一個 YH-115-A001。
 */
var VisitRecordIndex = (function () {
  var ELIGIBLE = { 已提交: true, 已稽核: true };

  function rows_(sheetName) {
    return SheetHelper.rowsToObjects(SheetHelper.getSheet(sheetName));
  }

  function build() {
    var cases = rows_(Config.SHEET_NAMES.CASES);
    var assignments = rows_(Config.SHEET_NAMES.ASSIGNMENTS);
    var careforms = rows_(Config.SHEET_NAMES.CAREFORMS);
    var audits = rows_(Config.SHEET_NAMES.AUDIT);

    var caseById = {};
    cases.forEach(function (row) {
      var id = String(row.case_id || '').trim();
      if (id) caseById[id] = row;
    });

    var assignmentById = {};
    var assignmentsByCase = {};
    assignments.forEach(function (row) {
      var id = String(row.assignment_id || '').trim();
      if (id) assignmentById[id] = row;
      var caseId = String(row.case_id || '').trim();
      if (!caseId) return;
      if (!assignmentsByCase[caseId]) assignmentsByCase[caseId] = [];
      assignmentsByCase[caseId].push(row);
    });

    var careformById = {};
    var careformsByAssignment = {};
    careforms.forEach(function (row) {
      var id = String(row.careform_id || '').trim();
      if (id) careformById[id] = row;
      var assignmentId = String(row.assignment_id || '').trim();
      if (!assignmentId) return;
      if (!careformsByAssignment[assignmentId]) careformsByAssignment[assignmentId] = [];
      careformsByAssignment[assignmentId].push(row);
    });

    var auditsByCareform = {};
    audits.forEach(function (row) {
      var careformId = String(row.careform_id || '').trim();
      if (!careformId) return;
      if (!auditsByCareform[careformId]) auditsByCareform[careformId] = [];
      auditsByCareform[careformId].push(row);
    });

    return {
      cases: cases,
      assignments: assignments,
      careforms: careforms,
      audits: audits,
      caseById: caseById,
      assignmentById: assignmentById,
      assignmentsByCase: assignmentsByCase,
      careformById: careformById,
      careformsByAssignment: careformsByAssignment,
      auditsByCareform: auditsByCareform,
    };
  }

  function caseForCareform(index, careform) {
    if (!careform) return null;
    var assignment = index.assignmentById[String(careform.assignment_id || '').trim()] || null;
    var caseId = assignment ? String(assignment.case_id || '').trim() : '';
    if (caseId && index.caseById[caseId]) return index.caseById[caseId];
    return null;
  }

  function latestAudit(index, careformId) {
    var rows = index.auditsByCareform[String(careformId || '').trim()] || [];
    if (!rows.length) return null;
    return rows[rows.length - 1];
  }

  function eligibleCareformsForCase(index, caseId) {
    var found = [];
    (index.assignmentsByCase[String(caseId || '').trim()] || []).forEach(function (assignment) {
      (index.careformsByAssignment[String(assignment.assignment_id || '').trim()] || []).forEach(
        function (careform) {
          if (ELIGIBLE[String(careform.status || '')]) found.push(careform);
        }
      );
    });
    return found;
  }

  function latestEligibleCareformForCase(index, caseId) {
    var found = eligibleCareformsForCase(index, caseId);
    if (!found.length) return null;
    var audited = found.filter(function (row) {
      return String(row.status) === '已稽核';
    });
    var pool = audited.length ? audited : found;
    return pool[pool.length - 1];
  }

  function counts(index) {
    var pending = 0;
    var approved = 0;
    var returned = 0;
    index.audits.forEach(function (row) {
      var decision = String(row.decision || '');
      if (!decision) pending += 1;
      else if (decision === '通過') approved += 1;
      else if (decision === '退回補件') returned += 1;
    });
    return { pending_audit: pending, approved: approved, returned: returned };
  }

  return {
    ELIGIBLE: ELIGIBLE,
    build: build,
    caseForCareform: caseForCareform,
    latestAudit: latestAudit,
    eligibleCareformsForCase: eligibleCareformsForCase,
    latestEligibleCareformForCase: latestEligibleCareformForCase,
    counts: counts,
  };
})();
