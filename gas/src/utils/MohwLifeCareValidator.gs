/**
 * 衛福部生活關懷表 103 欄驗證
 * 錯誤格式對齊中央系統：如「I3 身分證號碼格式不正確」
 */

var MohwLifeCareValidator = (function () {
  var FIELD_RULES = [{"type": "日期(民國年 yyy/MM/dd)", "allowed": []}, {"type": "時間(HH:mm)", "allowed": []}, {"type": "時間(HH:mm)", "allowed": []}, {"type": "單選", "allowed": ["已完成", "拒絕訪視", "查無此人", "無法溝通", "住址不詳"]}, {"type": "文字", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "單選", "allowed": ["男", "女", "其他"]}, {"type": "日期(民國年 yyy/MM/dd)", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "單選", "allowed": ["有", "無", "有，不願提供"]}, {"type": "文字", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "單選", "allowed": ["配偶", "子女", "孫子女", "兄弟姊妹", "親戚_其他親屬", "鄰居", "朋友", "法定代理人", "里長", "照顧服務員", "護理人員", "其他"]}, {"type": "文字", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "單選", "allowed": ["與戶籍地址相同", "未住戶籍地址", "查無此人"]}, {"type": "單選", "allowed": ["居住地址不詳", "居住地址為"]}, {"type": "文字", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "單選", "allowed": ["電梯大樓", "有電梯公寓", "有電梯透天樓房", "無電梯公寓", "無電梯透天樓房", "平房", "其他"]}, {"type": "文字", "allowed": []}, {"type": "單選", "allowed": ["與他人同住", "1人獨自居住"]}, {"type": "單選", "allowed": ["同住者有照顧能力", "外籍移工(看護)同住", "同住配偶年滿65歲", "同住者無照顧能力"]}, {"type": "文字", "allowed": []}, {"type": "數字", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "單選", "allowed": ["不識字", "識字", "小學", "初(國)中", "高中(職)", "專科", "大學", "研究所"]}, {"type": "單選", "allowed": ["有配偶或同居", "喪偶", "離婚或分居", "未婚", "其他"]}, {"type": "文字", "allowed": []}, {"type": "單選", "allowed": ["存", "無"]}, {"type": "數字", "allowed": []}, {"type": "數字", "allowed": []}, {"type": "單選", "allowed": ["是", "否"]}, {"type": "單選", "allowed": ["很好", "還算好", "普通", "不太好", "很不好"]}, {"type": "數字", "allowed": []}, {"type": "數字", "allowed": []}, {"type": "單選", "allowed": ["無改變", "減輕1-3公斤", "減輕3公斤以上", "增加", "不知道"]}, {"type": "單選", "allowed": ["嚴重食慾不佳", "中度食慾不佳", "無變化"]}, {"type": "多選(以 ; 分隔)", "allowed": ["心臟病", "中風", "高血壓", "糖尿病", "骨與關節疾病", "癌症", "失智症", "以上均無", "其他"]}, {"type": "文字", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "單選", "allowed": ["是", "否"]}, {"type": "文字", "allowed": []}, {"type": "單選", "allowed": ["是", "否"]}, {"type": "單選", "allowed": ["是", "否"]}, {"type": "單選", "allowed": ["是", "否"]}, {"type": "單選", "allowed": ["從未", "每月少於1次", "每個月1次", "每個月2-3次", "每周1次", "每周2-6次", "每天"]}, {"type": "單選", "allowed": ["從未", "每月少於1次", "每個月1次", "每個月2-3次", "每周1次", "每周2-6次", "每天"]}, {"type": "單選(下拉)", "allowed": ["無", "有"]}, {"type": "多選(以 ; 分隔)", "allowed": ["三餐無法溫飽", "無人可協助就醫", "租屋困難", "最近記憶力不好", "外出交通不方便（例如缺乏公車或客運）", "其他"]}, {"type": "文字", "allowed": []}, {"type": "單選(下拉)", "allowed": ["無", "有"]}, {"type": "多選(以 ; 分隔)", "allowed": ["自己受傷或疾病", "親人受傷或疾病", "親人離世", "被詐騙", "自己經濟問題(如債務)", "子女、孫子女問題（如打擾生活、財務處理等）", "其他"]}, {"type": "文字", "allowed": []}, {"type": "單選(下拉)", "allowed": ["有", "無"]}, {"type": "多選(以 ; 分隔)", "allowed": ["沒發生過", "不想麻煩別人，都是自己想辦法", "找不到人可以協助", "其他"]}, {"type": "文字", "allowed": []}, {"type": "多選(以 ; 分隔)", "allowed": ["家人", "朋友", "鄰居", "社工", "村里長", "社區志工", "大廈管理員", "其他"]}, {"type": "文字", "allowed": []}, {"type": "多選(以 ; 分隔)", "allowed": ["電視", "報紙", "廣播", "網路", "村里長", "親友或鄰里", "社群媒體(如：Line、FB、IG)", "其他", "以上均無"]}, {"type": "文字", "allowed": []}, {"type": "多選(以 ; 分隔)", "allowed": ["工作", "擔任志工", "學習新事物", "四處旅遊", "健身運動", "參與宗教活動", "其他", "以上均無"]}, {"type": "文字", "allowed": []}, {"type": "多選(以 ; 分隔)", "allowed": ["工作", "擔任志工", "學習新事物", "四處旅遊", "健身運動", "參與宗教活動", "其他", "以上均無"]}, {"type": "文字", "allowed": []}, {"type": "單選", "allowed": ["很安全", "大致安全", "有些不安全", "很不安全"]}, {"type": "單選", "allowed": ["完全沒有", "只有幾天：1至6天", "一半以上天數：7至11天", "幾乎每天：12至14天"]}, {"type": "單選", "allowed": ["完全沒有", "只有幾天：1至6天", "一半以上天數：7至11天", "幾乎每天：12至14天"]}, {"type": "單選", "allowed": ["完全沒有", "只有幾天：1至6天", "一半以上天數：7至11天", "幾乎每天：12至14天"]}, {"type": "單選(下拉)", "allowed": ["無", "有"]}, {"type": "多選(以 ; 分隔)", "allowed": ["參加社區據點", "關懷服務", "送餐服務", "安裝緊急救援裝置", "轉介：長照", "轉介：身障", "轉介：其他服務，長者期待"]}, {"type": "文字", "allowed": []}, {"type": "單選", "allowed": ["在訪談過程中，長者有提到自殺意念", "無特殊情形"]}, {"type": "單選(下拉)", "allowed": ["可以", "可以，但行動緩慢", "不可以"]}, {"type": "多選(以 ; 分隔)", "allowed": ["需要別人幫助才能移動", "衣物不乾淨", "身上有異味(例如尿騷味)", "使用器具(例如輪椅、拐杖)就可以自行移動", "其他"]}, {"type": "文字", "allowed": []}, {"type": "多選(以 ; 分隔)", "allowed": ["環境物品十分髒亂", "衣著不符季節", "食品雜置、蚊蠅蟑螂紛飛", "通風不良", "其他", "以上均無", "無法觀察"]}, {"type": "文字", "allowed": []}, {"type": "多選(以 ; 分隔)", "allowed": ["電線裸露", "照明設備不足(如夜起時)", "未裝設住宅用火災警報器", "多個電器同時使用一個插座", "熱水器安裝於室內，且不通風", "爐火(例如瓦斯爐、電熱器)周圍堆放可燃物", "出入動線囤積雜物", "其他", "以上均無", "無法觀察"]}, {"type": "文字", "allowed": []}, {"type": "單選", "allowed": ["同意", "不同意"]}, {"type": "單選", "allowed": ["同意", "不同意"]}, {"type": "單選", "allowed": ["是", "否"]}, {"type": "單選", "allowed": ["社會局/處", "社工", "志工", "其他"]}, {"type": "文字(10 字以內)", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "日期(民國年 yyy/MM/dd)", "allowed": []}, {"type": "單選", "allowed": ["公所人員", "村里長", "村里幹事"]}, {"type": "文字", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "文字", "allowed": []}, {"type": "日期(民國年 yyy/MM/dd)", "allowed": []}];
  var SKIP = { '拒絕訪視': 1, '查無此人': 1, '無法溝通': 1, '住址不詳': 1 };
  var ID_KEYS = {
    national_id: 1,
    social_worker_national_id: 1,
    civil_worker_national_id: 1
  };
  var DATE_KEYS = {
    visit_date: 1,
    birth_date: 1,
    social_worker_date: 1,
    civil_worker_date: 1
  };
  var TIME_KEYS = { visit_start_time: 1, visit_end_time: 1 };
  var DATE_CELL_MESSAGE =
    '日期格式錯誤:此欄需為文字格式並填民國年(例如 048/6/15、113/06/15)。目前儲存格是日期格式(可能來自複製貼上或格式被修改),請在儲存格上按右鍵→儲存格格式→文字,清空後重填';

  var CONDITIONAL = [
    { key: 'line_id', equals: { line_id_status: '有' } },
    { key: 'living_address_note', equals: { living_address_type: '未住戶籍地址' } },
    {
      key: 'living_city',
      equals: { living_address_type: '未住戶籍地址', living_address_note: '居住地址為' }
    },
    {
      key: 'living_district',
      equals: { living_address_type: '未住戶籍地址', living_address_note: '居住地址為' }
    },
    {
      key: 'living_village',
      equals: { living_address_type: '未住戶籍地址', living_address_note: '居住地址為' }
    },
    {
      key: 'living_address',
      equals: { living_address_type: '未住戶籍地址', living_address_note: '居住地址為' }
    },
    { key: 'living_address_other', equals: { living_address_type: '查無此人' } },
    { key: 'housing_type_other', equals: { housing_type: '其他' }, msg: '住宅類型=其他時必須填寫其他說明' },
    {
      key: 'social_worker_role_other',
      equals: { social_worker_role: '其他' },
      msg: '社政訪查人身分=其他時必須填寫其他身分別說明'
    },
    { key: 'cohabitation_status', equals: { living_status: '與他人同住' } },
    { key: 'cohabitant_relation', equals: { cohabitation_status: '同住者有照顧能力' } },
    { key: 'cohabitant_age', equals: { cohabitation_status: '同住者有照顧能力' } },
    {
      key: 'cohabitant_no_care_capacity_note',
      equals: { cohabitation_status: '同住者無照顧能力' }
    },
    { key: 'marital_status_other', equals: { marital_status: '其他' }, msg: '婚姻狀況=其他時必須填寫其他說明' },
    { key: 'sons_count', equals: { has_children: '存' } },
    { key: 'daughters_count', equals: { has_children: '存' } },
    { key: 'children_same_city', equals: { has_children: '存' } },
    { key: 'diseases_cancer_note', includes: { diseases: '癌症' }, msg: '疾病史包含癌症時必須填寫癌症說明' },
    { key: 'diseases_other_note', includes: { diseases: '其他' }, msg: '疾病史包含其他時必須填寫其他說明' },
    { key: 'recent_medical_note', equals: { recent_medical_event: '是' } },
    { key: 'hearing_aid', equals: { hearing_issue: '是' } },
    { key: 'life_difficulties', equals: { life_difficulties_flag: '有' } },
    { key: 'life_difficulties_other', includes: { life_difficulties: '其他' } },
    { key: 'worries', equals: { worries_flag: '有' } },
    { key: 'worries_other', includes: { worries: '其他' } },
    { key: 'help_sources_none', equals: { help_sources_flag: '無' } },
    { key: 'help_sources_none_other', includes: { help_sources_none: '其他' } },
    { key: 'help_sources_has', equals: { help_sources_flag: '有' } },
    { key: 'help_sources_has_other', includes: { help_sources_has: '其他' } },
    { key: 'information_channels_other', includes: { information_channels: '其他' } },
    { key: 'past_activities_other', includes: { past_activities: '其他' } },
    { key: 'desired_activities_other', includes: { desired_activities: '其他' } },
    { key: 'service_willingness', equals: { service_willingness_flag: '有' } },
    {
      key: 'service_willingness_referral_other',
      includes: { service_willingness: '轉介：其他服務，長者期待' }
    },
    { key: 'self_care_observation', equals: { self_care_flag: '不可以' } },
    { key: 'self_care_other', includes: { self_care_observation: '其他' } },
    { key: 'home_hygiene_other', includes: { home_hygiene_issues: '其他' } },
    { key: 'home_safety_other', includes: { home_safety_issues: '其他' } }
  ];

  function colLetter(col) {
    var n = col;
    var s = '';
    while (n > 0) {
      var rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function keyIndex(key) {
    var keys = MohwLifeCareMapper.keys;
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] === key) return i + 1;
    }
    return 0;
  }

  function asString(v) {
    if (v === null || v === undefined) return '';
    if (Object.prototype.toString.call(v) === '[object Array]') {
      return v.join(';');
    }
    return String(v).replace(/^\s+|\s+$/g, '');
  }

  function asList(v) {
    if (Object.prototype.toString.call(v) === '[object Array]') {
      return v.map(function (x) { return String(x).replace(/^\s+|\s+$/g, ''); }).filter(Boolean);
    }
    var t = asString(v);
    if (!t) return [];
    return t.split(/[;；]/).map(function (x) { return x.replace(/^\s+|\s+$/g, ''); }).filter(Boolean);
  }

  function hasValue(v) {
    return asString(v).length > 0 || (Object.prototype.toString.call(v) === '[object Array]' && v.length > 0);
  }

  function pushErr(errors, key, row, message) {
    var col = keyIndex(key);
    if (!col) return;
    var cell = colLetter(col) + row;
    errors.push({
      cell: cell,
      col: col,
      key: key,
      message: message,
      display: cell + ' ' + message
    });
  }

  function matchEquals(answers, map) {
    for (var k in map) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
      if (asString(answers[k]) !== map[k]) return false;
    }
    return true;
  }

  function matchIncludes(answers, map) {
    for (var k in map) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
      var list = asList(answers[k]);
      var needle = map[k];
      var hit = false;
      for (var i = 0; i < list.length; i++) {
        if (list[i] === needle || list[i].indexOf(needle) !== -1) {
          hit = true;
          break;
        }
      }
      if (!hit) return false;
    }
    return true;
  }

  function lookalikeToZero(value) {
    var text = String(value == null ? '' : value);
    if (text.normalize) text = text.normalize('NFKC');
    return text.replace(/[OoＯｏ〇○]/g, '0');
  }

  function isHhMm(value) {
    var m = lookalikeToZero(value).match(/^(\d{2}):(\d{2})$/);
    if (!m) return false;
    var h = Number(m[1]);
    var mm = Number(m[2]);
    return h >= 0 && h <= 23 && mm >= 0 && mm <= 59;
  }

  function normId(value) {
    var text = String(value || '');
    if (text.normalize) text = text.normalize('NFKC');
    text = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!text) return '';
    return text.charAt(0) + text.slice(1).replace(/[O〇○]/g, '0');
  }

  function villageMissing(city, district, village) {
    var list = MohwOfficialTemplate.villagesFor(city, district);
    if (!list) return true;
    var target = MohwOfficialTemplate.norm(village);
    for (var i = 0; i < list.length; i++) {
      if (MohwOfficialTemplate.norm(list[i]) === target) return false;
    }
    return true;
  }

  function isOfficialRoc(value) {
    var text = lookalikeToZero(asString(value));
    var m = text.match(/^(\d{3})\/(\d{2})\/(\d{2})$/);
    if (!m || Number(m[1]) < 1) return false;
    var y = Number(m[1]) + 1911, mo = Number(m[2]), d = Number(m[3]);
    var date = new Date(Date.UTC(y, mo - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === mo && date.getUTCDate() === d;
  }

  /**
   * @param {Object} answers MOHW keyed answers
   * @param {number=} row Excel row (default 2)
   * @param {{ registryNationalId?: string }=} options
   */
  function validateRow(answers, row, options) {
    row = row || 2;
    options = options || {};
    answers = answers || {};
    var errors = [];
    var visitStatus = asString(answers.visit_status);
    var skipQ = !!SKIP[visitStatus];
    var keys = MohwLifeCareMapper.keys;
    var headers = MohwLifeCareMapper.headers;

    // Always required from header * (exclude visitor cols 93+)
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var header = headers[i];
      var col = i + 1;
      if (header.indexOf('*') === -1) continue;
      if (col >= 93) continue;
      if (skipQ && col >= 29 && col <= 92) continue;
      if (!hasValue(answers[key])) {
        pushErr(errors, key, row, header.replace(/\s*\*+$/, '').replace(/\*$/, '') + '為必填');
      }
    }

    if (!hasValue(answers.phone) && !hasValue(answers.mobile)) {
      pushErr(errors, 'phone', row, '電話、手機擇一必填');
    }

    for (var c = 0; c < CONDITIONAL.length; c++) {
      var rule = CONDITIONAL[c];
      var colIdx = keyIndex(rule.key);
      if (skipQ && colIdx >= 29 && colIdx <= 92) continue;
      var ok = true;
      if (rule.equals) ok = matchEquals(answers, rule.equals);
      if (rule.includes) ok = ok && matchIncludes(answers, rule.includes);
      if (!ok) continue;
      if (!hasValue(answers[rule.key])) {
        pushErr(
          errors,
          rule.key,
          row,
          rule.msg || (headers[colIdx - 1] || rule.key).replace(/\s*\*+$/, '').replace(/\*$/, '') + '為條件必填'
        );
      }
    }

    var hasSocial =
      hasValue(answers.social_worker_role) ||
      hasValue(answers.social_worker_name) ||
      hasValue(answers.social_worker_national_id) ||
      hasValue(answers.social_worker_phone) ||
      hasValue(answers.social_worker_date);
    var hasCivil =
      hasValue(answers.civil_worker_role) ||
      hasValue(answers.civil_worker_name) ||
      hasValue(answers.civil_worker_national_id) ||
      hasValue(answers.civil_worker_phone) ||
      hasValue(answers.civil_worker_date);

    if (!hasSocial && !hasCivil) {
      pushErr(errors, 'social_worker_role', row, '社政訪查人與民政訪查人擇一必填');
    }

    if (hasSocial) {
      ['social_worker_role', 'social_worker_name', 'social_worker_national_id', 'social_worker_phone', 'social_worker_date'].forEach(function (k) {
        if (!hasValue(answers[k])) pushErr(errors, k, row, '社政訪查人欄位為必填');
      });
    }
    if (hasCivil) {
      ['civil_worker_role', 'civil_worker_name', 'civil_worker_national_id', 'civil_worker_phone', 'civil_worker_date'].forEach(function (k) {
        if (!hasValue(answers[k])) pushErr(errors, k, row, '民政訪查人欄位為必填');
      });
    }

    for (var j = 0; j < keys.length; j++) {
      var k2 = keys[j];
      var col2 = j + 1;
      if (!hasValue(answers[k2])) continue;
      if (skipQ && col2 >= 29 && col2 <= 92) continue;
      var text = asString(answers[k2]);
      var field = FIELD_RULES[j];
      if (field.allowed.length) {
        var selected = field.type.indexOf('多選') !== -1 ? text.split(';') : [text];
        if (selected.some(function (v) { return field.allowed.indexOf(v) === -1; })) {
          pushErr(errors, k2, row, '選項不符合範本允許值（多選請用半形分號 ;）');
        }
      }
      if (field.type === '數字' && !/^\d+(\.\d+)?$/.test(lookalikeToZero(text))) {
        pushErr(errors, k2, row, '須填寫數字');
      }
      if (['cohabitant_age', 'sons_count', 'daughters_count'].indexOf(k2) !== -1 && !/^\d+$/.test(lookalikeToZero(text))) {
        pushErr(errors, k2, row, '須填寫非負整數');
      }
      if (k2 === 'social_worker_role_other' && text.length > 10) {
        pushErr(errors, k2, row, '其他身分別說明不可超過 10 字');
      }
      if (k2 === 'social_worker_role_other' && asString(answers.social_worker_role) !== '其他') {
        pushErr(errors, k2, row, '身分非其他時，其他身分別說明應留空');
      }


      if (ID_KEYS[k2]) {
        var idText = normId(text);
        if (!/^[A-Za-z]\d{9}$/.test(idText) || !Validation.validateTaiwanId(idText)) {
          var idLabel = (MohwLifeCareMapper.headers && MohwLifeCareMapper.headers[col2 - 1]) || k2;
          pushErr(errors, k2, row, idLabel.replace(/\s*\*+$/, '') + '格式不正確（須 1 碼英文 + 9 碼數字；勿填案號或姓名）');
        }
      }
      // 室內電話允許 0 開頭（市話或 09）或 9 開頭 9 碼；先把 O 改成 0 再去掉分隔符。
      var phoneText = lookalikeToZero(text);
      if (/^[0-9 ()\-]+$/.test(phoneText)) phoneText = phoneText.replace(/[ ()\-]/g, '');
      if (/^9\d{8}$/.test(phoneText)) phoneText = '0' + phoneText;
      var casePhoneSentinel = phoneText === '0000000000' || phoneText === '9999999999';
      if (k2 === 'mobile' && !casePhoneSentinel && !/^09\d{8}$/.test(phoneText)) {
        pushErr(errors, k2, row, '手機格式不正確（請填 09 開頭的 10 碼，無電話填 0000000000，不願提供填 9999999999）');
      }
      if (k2 === 'phone' && !casePhoneSentinel && !/^0\d{8,9}$/.test(phoneText)) {
        pushErr(errors, k2, row, '室內電話請填市話或 09 手機；無電話填 0000000000，不願提供填 9999999999');
      }
      if (k2 === 'emergency_contact_phone' && !casePhoneSentinel &&
          !/^(?:09\d{8}|0[2-8]\d{7,8})$/.test(phoneText)) {
        pushErr(errors, k2, row, '緊急聯絡電話非必填；有填請用市話或手機，沒有可留空');
      }
      if (['social_worker_phone', 'civil_worker_phone'].indexOf(k2) !== -1 &&
          !/^(?:09\d{8}|0[2-8]\d{7,8})$/.test(phoneText)) {
        pushErr(errors, k2, row, '電話格式不正確（請填含前導 0 的國內市話或手機，不含分機）');
      }
      if (DATE_KEYS[k2] && !isOfficialRoc(answers[k2])) {
        pushErr(errors, k2, row, DATE_CELL_MESSAGE);
      }
      if (TIME_KEYS[k2] && !isHhMm(text)) {
        pushErr(errors, k2, row, '時間格式不正確（請用 HH:mm）');
      }
      if ((k2.indexOf('other') !== -1 || k2 === 'visit_notes') && text.length > 200) {
        pushErr(errors, k2, row, '字數不可超過 200 字');
      }

    }

    if (!MohwOfficialTemplate.headersMatch(MohwLifeCareMapper.headers)) {
      pushErr(errors, 'social_worker_role_other', row, '訪查人欄位順序不符，請重新下載最新版匯入範本');
    }

    // 永和落地：只檢核永和區村里；其餘戶籍／居住行政區先不擋
    var householdDistrict = asString(answers.household_district);
    var livingDistrict = asString(answers.living_district) || householdDistrict;
    var yonghe = '永和區';
    if (
      MohwOfficialTemplate.norm(householdDistrict) === MohwOfficialTemplate.norm(yonghe) &&
      hasValue(answers.household_village) &&
      villageMissing(answers.household_city, answers.household_district, answers.household_village)
    ) {
      pushErr(
        errors,
        'household_village',
        row,
        '戶籍村里「' + asString(answers.household_village) + '」在「' + asString(answers.household_district) + '」下查無此里'
      );
    }
    if (
      MohwOfficialTemplate.norm(livingDistrict) === MohwOfficialTemplate.norm(yonghe) &&
      hasValue(answers.living_village) &&
      villageMissing(answers.living_city, answers.living_district, answers.living_village)
    ) {
      pushErr(
        errors,
        'living_village',
        row,
        '居住村里「' + asString(answers.living_village) + '」在「' + asString(answers.living_district) + '」下查無此里'
      );
    }

    var helpNone = asList(answers.help_sources_none);
    var helpNoneHasOther = false;
    for (var n = 0; n < helpNone.length; n++) {
      if (helpNone[n] === '其他') helpNoneHasOther = true;
    }
    if (!skipQ && hasValue(answers.help_sources_none_other) && !helpNoneHasOther) {
      pushErr(errors, 'help_sources_none_other', row, '未勾選「其他」時，「求助對象無-其他說明」應留空');
    }

    if (Object.prototype.hasOwnProperty.call(options, 'registryNationalId')) {
      var registry = normId(options.registryNationalId);
      var current = normId(answers.national_id);
      if (!registry || !current || registry !== current) {
        errors = errors.filter(function (error) {
          return !(error.key === 'national_id' && (error.message.indexOf('為必填') !== -1 || error.message.indexOf('格式不正確') !== -1));
        });
        pushErr(errors, 'national_id', row, '無個案資料');
      }
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      errorLines: errors.map(function (e) { return e.display; })
    };
  }

  function validateBatch(rows, startRow, registryIds) {
    startRow = startRow || 2;
    var results = [];
    var success = 0;
    var fail = 0;
    var lines = [];
    for (var i = 0; i < rows.length; i++) {
      var rowOptions = registryIds ? { registryNationalId: registryIds[i] || '' } : undefined;
      var r = validateRow(rows[i], startRow + i, rowOptions);
      results.push({ row: startRow + i, ok: r.ok, errors: r.errors, errorLines: r.errorLines });
      if (r.ok) success++;
      else {
        fail++;
        lines = lines.concat(r.errorLines);
      }
    }
    return {
      ok: fail === 0,
      successCount: success,
      failCount: fail,
      results: results,
      errorLines: lines
    };
  }

  return {
    validateRow: validateRow,
    validateBatch: validateBatch,
    colLetter: colLetter
  };
})();
