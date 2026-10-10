/**
 * MOHW 生活關懷表 103 欄匯出 mapping
 * 欄位順序對照 lib/domain/mohw-life-care-schema.json（對齊檔案說明範本）
 */

var MohwLifeCareMapper = (function () {
  var HEADERS = [
    '訪查日期 *', '訪查開始時間 *', '訪查結束時間', '訪視狀態 *', '備註',
    '姓名 *', '性別*', '出生年月日*', '身分證字號 *', '電話', '手機',
    'Line ID 狀態', 'Line ID', '緊急聯絡人姓名', '緊急聯絡人關係',
    '緊急聯絡人關係-其他說明', '緊急聯絡人電話', '戶籍-縣市*', '戶籍-鄉鎮區*',
    '戶籍-村里*', '戶籍-地址 *', '居住地址類型 *', '居住說明', '居住-縣市',
    '居住-鄉鎮區', '居住-村里', '居住-地址', '居住-其他說明', '住宅類型 *',
    '住宅類型-其他說明', '居住狀況 *', '同住情形', '同住者為', '同住者年齡',
    '同住者無照顧能力說明', '教育程度', '婚姻狀況', '婚姻狀況-其他說明',
    '有無子女 *', '兒子數', '女兒數', '子女同縣市',
    '您覺得自己目前健康狀況如何? *', '身高 *', '體重 *', '體重變化 *', '食慾狀況 *',
    '疾病史', '疾病史-癌症說明', '疾病史-其他說明',
    '最近3個月是否有住院、手術，或到急診就醫', '住院說明', '重聽', '佩戴助聽器',
    '視力不好', '與親友互動', '與鄰居互動', '最近三個月生活所遇到的困難',
    '生活困難-細項', '生活困難-其他說明', '最近三個月感到煩惱的事情', '煩惱事情-細項',
    '煩惱事情-其他說明', '求助對象', '求助對象-無的複選選項', '求助對象無-其他說明',
    '求助對象-有的複選選項', '求助對象有-其他說明', '日常生活訊息管道', '訊息管道-其他說明',
    '過去三個月實際參與活動', '過去活動-其他說明', '目前特別想做的事',
    '目前特別想做的事-其他說明', '您在家中是否感到安全？', '您是否覺得寂寞？(過去2週)',
    '您是否感覺情緒低落、沮喪或沒有希望？(過去2週)', '您是否感覺做事情失去興趣或樂趣？(過去2週)',
    '接受其他服務的意願', '服務意願-細項', '服務意願-轉介其他說明', '精神狀況',
    '自我照顧情形', '自我照顧情形-細項', '自我照顧情形-其他說明', '衛生問題',
    '衛生問題-其他說明', '安全問題', '安全問題-其他說明',
    '個人資料於上開範圍內使用 *',
    '將這份生活關懷表訪查結果，供國家型健康資料庫(如健保資料、長照資料等)分析使用，僅作為115-116年度獨居老人政策服務成效評估用途 *',
    '有立書人本人簽名、蓋章或手印 *',
    '社政訪查人-身分', '社政訪查人-其他身分別說明', '社政訪查人-姓名',
    '社政訪查人-身分證字號', '社政訪查人-電話', '社政訪查人-日期',
    '民政訪查人-身分', '民政訪查人-姓名', '民政訪查人-身分證字號',
    '民政訪查人-電話', '民政訪查人-日期'
  ];

  var KEYS = [
    'visit_date', 'visit_start_time', 'visit_end_time', 'visit_status', 'visit_notes',
    'name', 'gender', 'birth_date', 'national_id', 'phone', 'mobile',
    'line_id_status', 'line_id', 'emergency_contact_name', 'emergency_contact_relation',
    'emergency_contact_relation_other', 'emergency_contact_phone', 'household_city',
    'household_district', 'household_village', 'household_address', 'living_address_type',
    'living_address_note', 'living_city', 'living_district', 'living_village', 'living_address',
    'living_address_other', 'housing_type', 'housing_type_other', 'living_status',
    'cohabitation_status', 'cohabitant_relation', 'cohabitant_age', 'cohabitant_no_care_capacity_note',
    'education', 'marital_status', 'marital_status_other', 'has_children', 'sons_count',
    'daughters_count', 'children_same_city', 'health_self_rating', 'height_cm', 'weight_kg',
    'weight_change_3m', 'appetite_3m', 'diseases', 'diseases_cancer_note', 'diseases_other_note',
    'recent_medical_event', 'recent_medical_note', 'hearing_issue', 'hearing_aid', 'vision_issue',
    'family_interaction', 'neighbor_interaction', 'life_difficulties_flag', 'life_difficulties',
    'life_difficulties_other', 'worries_flag', 'worries', 'worries_other', 'help_sources_flag',
    'help_sources_none', 'help_sources_none_other', 'help_sources_has', 'help_sources_has_other',
    'information_channels', 'information_channels_other', 'past_activities', 'past_activities_other',
    'desired_activities', 'desired_activities_other', 'home_safety_feeling', 'loneliness_2w',
    'depressed_2w', 'loss_interest_2w', 'service_willingness_flag', 'service_willingness',
    'service_willingness_referral_other', 'mental_status', 'self_care_flag', 'self_care_observation',
    'self_care_other', 'home_hygiene_issues', 'home_hygiene_other', 'home_safety_issues',
    'home_safety_other', 'consent_personal_data', 'consent_health_db', 'consent_signature',
    'social_worker_role', 'social_worker_role_other', 'social_worker_name',
    'social_worker_national_id', 'social_worker_phone', 'social_worker_date',
    'civil_worker_role', 'civil_worker_name', 'civil_worker_national_id',
    'civil_worker_phone', 'civil_worker_date'
  ];

  var PHONE_KEYS = {
    phone: true,
    mobile: true,
    emergency_contact_phone: true,
    social_worker_phone: true,
    civil_worker_phone: true
  };

  var DATE_KEYS = {
    visit_date: true,
    birth_date: true,
    social_worker_date: true,
    civil_worker_date: true
  };

  var NEW_TAIPEI_MAP = {
    name: 'name',
    gender: 'gender',
    birth_date: 'birth_date',
    national_id: 'national_id',
    phone: 'phone',
    mobile: 'mobile',
    line_id: 'line_id',
    emergency_contact: 'emergency_contact_name',
    household_address: 'household_address',
    living_address: 'living_address',
    housing_type: 'housing_type',
    living_status: 'living_status',
    education: 'education',
    marital_status: 'marital_status',
    children_status: 'has_children',
    family_interaction: 'family_interaction',
    neighbor_interaction: 'neighbor_interaction',
    help_sources: 'help_sources_has',
    health_self_rating: 'health_self_rating',
    height_cm: 'height_cm',
    weight_kg: 'weight_kg',
    weight_change_3m: 'weight_change_3m',
    appetite_3m: 'appetite_3m',
    diseases: 'diseases',
    recent_medical_event: 'recent_medical_event',
    hearing_issue: 'hearing_issue',
    vision_issue: 'vision_issue',
    life_difficulties: 'life_difficulties',
    worries: 'worries',
    information_channels: 'information_channels',
    home_safety_feeling: 'home_safety_feeling',
    loneliness_2w: 'loneliness_2w',
    depressed_2w: 'depressed_2w',
    loss_interest_2w: 'loss_interest_2w',
    service_willingness: 'service_willingness',
    suicide_ideation_observed: 'mental_status',
    self_care_observation: 'self_care_observation',
    home_hygiene_issues: 'home_hygiene_issues',
    home_safety_issues: 'home_safety_issues'
  };

  function parseAnswersJson(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return {};
    }
  }

  function mergeInputs(payload) {
    var answers = payload.mohwAnswers || {};
    var care = parseAnswersJson(payload.careform && payload.careform.answers_json);
    var caseRow = payload.caseRow || {};
    var visitMeta = payload.visitMeta || {};

    if (care.visit_date || care.visit_status || care.national_id) {
      Object.keys(care).forEach(function (key) {
        if (answers[key] === undefined || answers[key] === '') {
          answers[key] = care[key];
        }
      });
    } else {
      Object.keys(NEW_TAIPEI_MAP).forEach(function (src) {
        var dst = NEW_TAIPEI_MAP[src];
        if (answers[dst] !== undefined && answers[dst] !== '') return;
        if (care[src] !== undefined && care[src] !== '') {
          answers[dst] = care[src];
        }
      });
    }

    if (caseRow.name && !answers.name) answers.name = caseRow.name;
    if (caseRow.national_id && !answers.national_id) answers.national_id = caseRow.national_id;
    if (caseRow.id_number && !answers.national_id) answers.national_id = caseRow.id_number;
    if (caseRow.birth_date && !answers.birth_date) answers.birth_date = caseRow.birth_date;
    if (caseRow.phone && !answers.phone) answers.phone = caseRow.phone;
    if (caseRow.mobile && !answers.mobile) answers.mobile = caseRow.mobile;
    if (caseRow.household_city && !answers.household_city) answers.household_city = caseRow.household_city;
    if (caseRow.household_district && !answers.household_district) answers.household_district = caseRow.household_district;
    if (caseRow.household_village && !answers.household_village) answers.household_village = caseRow.household_village;
    if (caseRow.household_address && !answers.household_address) answers.household_address = caseRow.household_address;

    if (visitMeta.visit_date && !answers.visit_date) answers.visit_date = visitMeta.visit_date;
    if (visitMeta.visit_start_time && !answers.visit_start_time) answers.visit_start_time = visitMeta.visit_start_time;
    if (visitMeta.visit_end_time && !answers.visit_end_time) answers.visit_end_time = visitMeta.visit_end_time;
    if (visitMeta.visit_status && !answers.visit_status) answers.visit_status = visitMeta.visit_status;
    if (visitMeta.notes && !answers.visit_notes) answers.visit_notes = visitMeta.notes;

    if (payload.careform && payload.careform.visit_result && !answers.visit_status) {
      answers.visit_status = mapVisitStatus(payload.careform.visit_result);
    }

    return answers;
  }

  function mapVisitStatus(value) {
    var map = {
      '訪視成功': '已完成',
      '完成訪視': '已完成',
      '已完成': '已完成',
      '未遇': '查無此人',
      '拒訪': '拒絕訪視',
      '拒絕訪視': '拒絕訪視',
      '無法溝通': '無法溝通',
      '住址不詳': '住址不詳'
    };
    return map[value] || value;
  }

  function formatCell(value, key) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.join(';');
    if (DATE_KEYS[key] && Object.prototype.toString.call(value) === '[object Date]') {
      return formatRocDate(value);
    }
    var text = String(value).trim();
    if (!text) return '';
    if (DATE_KEYS[key]) {
      return formatRocDate(text);
    }
    if (PHONE_KEYS[key]) {
      return formatPhone(text);
    }
    if (key === 'visit_start_time' || key === 'visit_end_time') {
      return formatTime(text);
    }
    if (text.indexOf(',') > -1 && text.indexOf(';') === -1) {
      return text.split(',').join(';');
    }
    return text;
  }

  /**
   * 民國年 yyy/MM/dd。年 3 碼、月日 2 碼。
   * 接受西元 ISO、Excel 序列、已是民國（含前導 0）。
   * Excel 常把民國 28/5/10 誤讀成 2028/05/10 → 以「西元年 > 今年」還原為 ROC yy。
   */
  function formatRocDate(input) {
    if (input === null || input === undefined || input === '') return '';
    if (Object.prototype.toString.call(input) === '[object Date]') {
      if (isNaN(input.getTime())) return '';
      return toRocParts_(input.getFullYear(), input.getMonth() + 1, input.getDate());
    }
    if (typeof input === 'number' && isFinite(input)) {
      return serialToRoc_(input) || String(input);
    }
    var text = String(input).replace(/^\s+|\s+$/g, '');
    if (!text) return '';
    if (/^\d{4,6}(\.\d+)?$/.test(text)) {
      var fromSerial = serialToRoc_(Number(text));
      if (fromSerial) return fromSerial;
    }

    var iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
      return toRocParts_(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    }

    var slash = text.match(/^(\d{1,4})\/(\d{1,2})\/(\d{1,2})$/);
    if (slash) {
      return toRocParts_(Number(slash[1]), Number(slash[2]), Number(slash[3]));
    }

    return text;
  }

  function serialToRoc_(serial) {
    if (!(serial >= 10000 && serial <= 80000)) return '';
    var utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
    var date = new Date(utc);
    if (isNaN(date.getTime())) return '';
    return toRocParts_(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  function pad_(value, width) {
    var text = String(value);
    while (text.length < width) text = '0' + text;
    return text;
  }

  function toRocParts_(year, month, day) {
    var currentWestern = new Date().getFullYear();
    var rocYear;
    if (year >= 1911) {
      // 未來西元年多半是 Excel 把民國 yy 當成 20yy
      if (year > currentWestern) {
        rocYear = year % 100;
      } else {
        rocYear = year - 1911;
      }
    } else {
      rocYear = year; // 已是民國（Number 會去掉 0115 → 115）
    }
    return pad_(rocYear, 3) + '/' + pad_(month, 2) + '/' + pad_(day, 2);
  }

  /** 還原前導 0：手機 09xxxxxxxx、市話 0xxxxxxxx */
  function formatPhone(input) {
    var text = String(input).trim();
    if (!text) return '';
    var digits = text.replace(/\D/g, '');
    if (!digits) return text;
    if (/^09\d{8}$/.test(digits) || /^0[2-8]\d{7,9}$/.test(digits)) {
      return digits;
    }
    if (/^9\d{8}$/.test(digits)) {
      return '0' + digits;
    }
    if (/^[2-8]\d{7,9}$/.test(digits)) {
      return '0' + digits;
    }
    return text;
  }

  function formatTime(input) {
    var match = String(input).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      return Number(match[1]) + ':' + match[2];
    }
    return String(input).trim();
  }

  function buildRow(payload) {
    var answers = mergeInputs(payload);
    return KEYS.map(function (key) {
      return formatCell(answers[key], key);
    });
  }

  function buildWorkbookRows(rowsPayload) {
    // 表頭一律以官方匯入範本為準，避免與驗證系統欄名一字之差。
    var headerRow =
      typeof MohwOfficialTemplate !== 'undefined' && MohwOfficialTemplate.HEADERS
        ? MohwOfficialTemplate.HEADERS.slice()
        : HEADERS.slice();
    if (
      typeof MohwOfficialTemplate !== 'undefined' &&
      MohwOfficialTemplate.headersMatch &&
      !MohwOfficialTemplate.headersMatch(HEADERS)
    ) {
      // 仍繼續匯出，但以官方表頭寫檔；本地 HEADERS 應儘快對齊。
    }
    var rows = [headerRow];
    rowsPayload.forEach(function (payload) {
      rows.push(buildRow(payload));
    });
    return rows;
  }

  return {
    headers: HEADERS,
    keys: KEYS,
    buildRow: buildRow,
    buildWorkbookRows: buildWorkbookRows,
    mergeInputs: mergeInputs,
    formatRocDate: formatRocDate,
    formatPhone: formatPhone
  };
})();
