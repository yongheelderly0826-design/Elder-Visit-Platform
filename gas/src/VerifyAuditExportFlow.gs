/**
 * 端到端驗證：送出關懷表 → 稽核佇列 → 核准 → 匯出候選
 * clasp run verifyAuditExportFlow
 */
function verifyAuditExportFlow() {
  var visitors = VisitorModule.list({});
  var visitor = null;
  for (var i = 0; i < visitors.length; i++) {
    if (visitors[i].status === '已核准') {
      visitor = visitors[i];
      break;
    }
  }
  visitor = visitor || visitors[0];
  if (!visitor) throw new Error('沒有訪員');

  var cases = CaseModule.list({ district: '永和區' });
  var assignments = AssignmentModule.list({});
  var activeIds = {};
  assignments.forEach(function (a) {
    if (a.status === '待接案' || a.status === '進行中' || a.status === '空訪續訪') {
      activeIds[String(a.case_id)] = a;
    }
  });

  var assignment = activeIds['CASE-YH-ef6e3eda'] || null;
  var caseRow = null;
  if (assignment) {
    caseRow = CaseModule.get(assignment.case_id);
  } else {
    for (var c = 0; c < cases.length; c++) {
      if (!activeIds[String(cases[c].case_id)]) {
        caseRow = cases[c];
        break;
      }
    }
    if (!caseRow) throw new Error('沒有可用個案');
    assignment = AssignmentModule.dispatch({
      case_id: caseRow.case_id,
      visitor_id: visitor.visitor_id,
      notes: '端到端驗證派案',
      auto_confirm: true,
    });
  }

  var answers = {
    visit_date: '115/05/22',
    visit_start_time: '09:30',
    visit_end_time: '10:30',
    visit_status: '已完成',
    visit_notes: '端到端驗證：送出→稽核→匯出',
    name: caseRow.name || '驗證個案',
    gender: caseRow.gender || '女',
    birth_date: '031/03/18',
    national_id: 'A123456789',
    phone: caseRow.primary_phone || '0222220001',
    mobile: caseRow.secondary_phone || '0912345678',
    line_id_status: '無',
    emergency_contact_name: '陳美玲',
    emergency_contact_relation: '子女',
    emergency_contact_phone: '0912222333',
    household_city: '新北市',
    household_district: caseRow.household_district || caseRow.visit_district || '永和區',
    household_village: caseRow.household_village || caseRow.visit_village || '豫溪里',
    household_address: caseRow.address || '中山路一段 1 號',
    living_address_type: '與戶籍地址相同',
    housing_type: '電梯大樓',
    living_status: '與他人同住',
    cohabitation_status: '同住者有照顧能力',
    cohabitant_relation: '兒子',
    cohabitant_age: '45',
    education: '小學',
    marital_status: '有配偶或同居',
    has_children: '存',
    sons_count: '1',
    daughters_count: '1',
    children_same_city: '是',
    health_self_rating: '還算好',
    height_cm: '165',
    weight_kg: '60',
    weight_change_3m: '無改變',
    appetite_3m: '無變化',
    diseases: '高血壓;糖尿病',
    recent_medical_event: '否',
    hearing_issue: '否',
    vision_issue: '否',
    family_interaction: '每周1次',
    neighbor_interaction: '每天',
    life_difficulties_flag: '有',
    life_difficulties: '租屋困難;最近記憶力不好',
    worries_flag: '有',
    worries: '自己受傷或疾病',
    help_sources_flag: '有',
    help_sources_has: '家人',
    information_channels: '電視;親友或鄰里',
    past_activities: '參與宗教活動',
    desired_activities: '健身運動',
    home_safety_feeling: '大致安全',
    loneliness_2w: '完全沒有',
    depressed_2w: '完全沒有',
    loss_interest_2w: '完全沒有',
    service_willingness_flag: '有',
    service_willingness: '關懷服務;送餐服務',
    mental_status: '無特殊情形',
    self_care_flag: '可以',
    home_hygiene_issues: '以上均無',
    home_safety_issues: '照明設備不足(如夜起時)',
    consent_personal_data: '同意',
    consent_health_db: '同意',
    consent_signature: '是',
    social_worker_role: '社工',
    social_worker_name: '張社工',
    social_worker_national_id: 'B223456782',
    social_worker_phone: '0933445566',
    social_worker_date: '115/05/13',
  };

  var validated = CareFormModule.validate({ answers: answers, row: 2 });
  if (!validated.ok) {
    return {
      ok: false,
      step: 'validate',
      case_id: caseRow.case_id,
      assignment_id: assignment.assignment_id,
      errorLines: validated.errorLines,
    };
  }

  var submitted = CareFormModule.submit({
    assignment_id: assignment.assignment_id,
    visitor_id: visitor.visitor_id,
    encoded_id: caseRow.encoded_id,
    visit_result: '訪視成功',
    completion_pct: 100,
    answers: answers,
    consent_signed: true,
  });

  var queue = AuditModule.queue({ decision: 'pending' });
  var queued = null;
  for (var q = 0; q < queue.length; q++) {
    if (queue[q].careform_id === submitted.careform.careform_id) {
      queued = queue[q];
      break;
    }
  }

  if (!queued) {
    return {
      ok: false,
      step: 'queue',
      case_id: caseRow.case_id,
      careform_id: submitted.careform.careform_id,
      queue_total: queue.length,
    };
  }

  var decided = AuditModule.decide({
    audit_id: queued.audit_id,
    decision: '通過',
    reason: '端到端驗證核准',
  });

  var candidates = ExportModule.listCandidates({
    district: '永和區',
    only_audited: true,
  });
  var found = null;
  (candidates.items || []).forEach(function (item) {
    if (String(item.case_id) === String(caseRow.case_id)) found = item;
  });

  return {
    ok: Boolean(queued && decided.decision === '通過' && found),
    case_id: caseRow.case_id,
    case_name: caseRow.name,
    assignment_id: assignment.assignment_id,
    careform_id: submitted.careform.careform_id,
    audit_id: queued.audit_id,
    decide_decision: decided.decision,
    careform_status: decided.careform_status,
    export_hit: Boolean(found),
    export_ready: found ? found.export_ready : false,
    export_audit: found ? found.audit_decision : '',
    export_total: candidates.total,
    export_ready_count: candidates.ready_count,
  };
}
