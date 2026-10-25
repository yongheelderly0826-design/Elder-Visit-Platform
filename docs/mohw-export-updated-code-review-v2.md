# 衛福部生活關懷表 GAS 匯出程式（V2 更新後完整檢查包）

擷取時間：2026-10-11 11:39  
對應 commit／部署：`2dabea5`／GAS `@67`（套用 `GAS匯出格式修正版V2.zip` 後）  
說明文件：`docs/mohw-export-format-fix-pack-v2.md`  
差異 patch：`docs/mohw-export-format-fix-pack-v2.patch`

## V2 相對前一版的主要差異

1. ISO 日期正規式改為完整結尾；非法尾綴（如 `1959-06-15ERROR`）留原值給 Validator。
2. 明確附時區的 ISO timestamp 依 `Asia/Taipei` 取日期。
3. 電話只清空白／括號／連字號；不刪字母、不猜補前導 0。
4. Validator 加入國內手機／市話格式檢查；身分證先檢查 `1 英文 + 9 數字` 再驗檢查碼。
5. 未完成訪視略過 AC:CN（col 29–92），問卷／同意／簽名不帶入歷史答案。
6. Mapper `mergeInputs` 不再呼叫村里自動改寫；改為複製答案物件。
7. Exporter 寫入後 flush＋回讀 values／formulas；非 ZIP 回應擋下；finally 清理暫存。

## 流程概觀

```
ExportModule.exportLifeCareXlsx
  ├─ 依 case_ids 組 payloads（caseRow + careform）
  ├─ MohwLifeCareMapper.buildWorkbookRows(payloads)  ← 組合 103 欄列（含格式化）
  ├─ 從「輸出列」還原 answers → MohwLifeCareValidator.validateBatch
  │     （正式匯出固定 strict=true，失敗不產檔）
  └─ MohwLifeCareExporter.createXlsxFile(rows, fileName)
        └─ setNumberFormat('@') + setRichTextValues → flush → 回讀核對 → XLSX
```

## 檔案清單

| 檔案 | 路徑 |
|---|---|
| Mapper | `gas/src/utils/MohwLifeCareMapper.gs` |
| Validator | `gas/src/utils/MohwLifeCareValidator.gs` |
| Exporter | `gas/src/utils/MohwLifeCareExporter.gs` |
| ExportModule（未改，沿用） | `gas/src/modules/ExportModule.gs` |
| TS export | `lib/domain/mohw-life-care-export.ts` |
| TS validation | `lib/domain/mohw-life-care-validation.ts` |
| TS form merge | `lib/domain/mohw-life-care-form.ts`（去掉村里 autofix） |

---

## 1. MohwLifeCareMapper.gs

來源：`gas/src/utils/MohwLifeCareMapper.gs`

```javascript
/**
 * MOHW 生活關懷表 103 欄匯出 mapping
 * 欄位順序對照 lib/domain/mohw-life-care-schema.json（對齊檔案說明範本）
 */

var MohwLifeCareMapper = (function () {
  var HEADERS = [
  "訪查日期 *",
  "訪查開始時間 *",
  "訪查結束時間",
  "訪視狀態 *",
  "備註",
  "姓名 *",
  "性別*",
  "出生年月日*",
  "身分證字號 *",
  "電話",
  "手機",
  "Line ID 狀態",
  "Line ID",
  "緊急聯絡人姓名",
  "緊急聯絡人關係",
  "緊急聯絡人關係-其他說明",
  "緊急聯絡人電話",
  "戶籍-縣市 *",
  "戶籍-鄉鎮區 *",
  "戶籍-村里 *",
  "戶籍-地址 *",
  "居住地址類型 *",
  "居住說明",
  "居住-縣市",
  "居住-鄉鎮區",
  "居住-村里",
  "居住-地址",
  "居住-其他說明",
  "住宅類型 *",
  "住宅類型-其他說明",
  "居住狀況 *",
  "同住情形",
  "同住者為",
  "同住者年齡",
  "同住者無照顧能力說明",
  "教育程度",
  "婚姻狀況",
  "婚姻狀況-其他說明",
  "有無子女 *",
  "兒子數",
  "女兒數",
  "子女同縣市",
  "您覺得自己目前健康狀況如何? *",
  "身高 *",
  "體重 *",
  "體重變化 *",
  "食慾狀況 *",
  "疾病史",
  "疾病史-癌症說明",
  "疾病史-其他說明",
  "最近3個月是否有住院、手術，或到急診就醫",
  "住院說明",
  "重聽",
  "佩戴助聽器",
  "視力不好",
  "與親友互動",
  "與鄰居互動",
  "最近三個月生活所遇到的困難",
  "生活困難-細項",
  "生活困難-其他說明",
  "最近三個月感到煩惱的事情",
  "煩惱事情-細項",
  "煩惱事情-其他說明",
  "求助對象",
  "求助對象-無的複選選項",
  "求助對象無-其他說明",
  "求助對象-有的複選選項",
  "求助對象有-其他說明",
  "日常生活訊息管道",
  "訊息管道-其他說明",
  "過去三個月實際參與活動",
  "過去活動-其他說明",
  "目前特別想做的事",
  "目前特別想做的事-其他說明",
  "您在家中是否感到安全？",
  "您是否覺得寂寞？(過去2週)",
  "您是否感覺情緒低落、沮喪或沒有希望？(過去2週)",
  "您是否感覺做事情失去興趣或樂趣？(過去2週)",
  "接受其他服務的意願",
  "服務意願-細項",
  "服務意願-轉介其他說明",
  "精神狀況",
  "自我照顧情形",
  "自我照顧情形-細項",
  "自我照顧情形-其他說明",
  "衛生問題",
  "衛生問題-其他說明",
  "安全問題",
  "安全問題-其他說明",
  "個人資料於上開範圍內使用 *",
  "將這份生活關懷表訪查結果，供國家型健康資料庫(如健保資料、長照資料等)分析使用，僅作為115-116年度獨居老人政策服務成效評估用途 *",
  "有立書人本人簽名、蓋章或手印 *",
  "社政訪查人-身分",
  "社政訪查人-其他身分別說明",
  "社政訪查人-姓名",
  "社政訪查人-身分證字號",
  "社政訪查人-電話",
  "社政訪查人-日期",
  "民政訪查人-身分",
  "民政訪查人-姓名",
  "民政訪查人-身分證字號",
  "民政訪查人-電話",
  "民政訪查人-日期"
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
    var answers = Object.assign({}, payload.mohwAnswers || {});
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
    // 個案名冊常用 address，補到戶籍地址以便依地址修正村里
    if (!answers.household_address && caseRow.address) answers.household_address = caseRow.address;
    if (!answers.household_village && caseRow.visit_village) answers.household_village = caseRow.visit_village;

    if (visitMeta.visit_date && !answers.visit_date) answers.visit_date = visitMeta.visit_date;
    if (visitMeta.visit_start_time && !answers.visit_start_time) answers.visit_start_time = visitMeta.visit_start_time;
    if (visitMeta.visit_end_time && !answers.visit_end_time) answers.visit_end_time = visitMeta.visit_end_time;
    if (visitMeta.visit_status && !answers.visit_status) answers.visit_status = visitMeta.visit_status;
    if (visitMeta.notes && !answers.visit_notes) answers.visit_notes = visitMeta.notes;

    if (payload.careform && payload.careform.visit_result && !answers.visit_status) {
      answers.visit_status = mapVisitStatus(payload.careform.visit_result);
    }

    // 匯出不依居住地址改寫戶籍村里。資料錯誤由驗證器指出，再回原始資料確認。

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
    if (DATE_KEYS[key]) return formatRocDate(value);
    if (key === 'visit_start_time' || key === 'visit_end_time') return formatTime(value);
    if (Array.isArray(value)) {
      return value.map(function (v) { return String(v).trim(); }).join(';');
    }
    var text = String(value).trim();
    if (PHONE_KEYS[key]) return formatPhone(text);
    // 不替換自由文字或選項中的逗號。多選只接受陣列或半形分號。
    return text;
  }

  /**
   * 民國年 yyy/MM/dd。年 3 碼、月日 2 碼。
   * 接受西元 ISO、Excel 序列、已是民國（含前導 0）。
   * 四碼年明確視為西元；不得依今年猜測並改寫年份。
   */
  function formatRocDate(input) {
    if (input === null || input === undefined || input === '') return '';
    if (Object.prototype.toString.call(input) === '[object Date]') {
      if (isNaN(input.getTime())) return 'INVALID_DATE';
      return formatRocDate(Utilities.formatDate(input, 'Asia/Taipei', 'yyyy-MM-dd'));
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

    var iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
      return toRocParts_(Number(iso[1]), Number(iso[2]), Number(iso[3])) || text;
    }

    // 明確附時區的 ISO timestamp 依臺灣時間取日期；不接受含糊尾綴。
    var stamp = text.match(/^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/);
    if (stamp) {
      var validDate = toRocParts_(Number(stamp[1]), Number(stamp[2]), Number(stamp[3]));
      var dateTime = new Date(text);
      if (!validDate || isNaN(dateTime.getTime())) return text;
      return formatRocDate(dateTime);
    }

    var slash = text.match(/^(\d{1,4})\/(\d{1,2})\/(\d{1,2})$/);
    if (slash) {
      if (slash[1].length === 4 && Number(slash[1]) < 1912) return text;
      return toRocParts_(Number(slash[1]), Number(slash[2]), Number(slash[3])) || text;
    }

    return text;
  }

  function serialToRoc_(serial) {
    if (!(serial >= 10000 && serial <= 80000)) return '';
    var utc = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000;
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
    var rocYear = year >= 1911 ? year - 1911 : year;
    var westernYear = rocYear + 1911;
    var date = new Date(Date.UTC(westernYear, month - 1, day));
    if (rocYear < 1 || rocYear > 999 || date.getUTCFullYear() !== westernYear ||
        date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return '';
    return pad_(rocYear, 3) + '/' + pad_(month, 2) + '/' + pad_(day, 2);
  }

  /** 只清理明確電話分隔符；不刪字母、不猜測遺失的前導 0。 */
  function formatPhone(input) {
    var text = String(input == null ? '' : input).trim();
    if (!text || !/^[0-9 ()-]+$/.test(text)) return text;
    return text.replace(/[ ()-]/g, '');
  }

  function formatTime(input) {
    if (Object.prototype.toString.call(input) === '[object Date]') {
      return isNaN(input.getTime()) ? 'INVALID_TIME' :
        Utilities.formatDate(input, 'Asia/Taipei', 'HH:mm');
    }
    var text = String(input == null ? '' : input).trim();
    var match = text.match(/^(\d{1,2}):(\d{2})$/);
    if (match && Number(match[1]) <= 23 && Number(match[2]) <= 59) {
      return pad_(Number(match[1]), 2) + ':' + match[2];
    }
    return text;
  }

  function buildRow(payload) {
    var answers = mergeInputs(payload);
    var skipQuestionnaire = ['拒絕訪視', '查無此人', '無法溝通', '住址不詳'].indexOf(String(answers.visit_status || '').trim()) !== -1;
    return KEYS.map(function (key, index) {
      // AC:CN 問卷與同意欄不帶入歷史答案；CO:CY 訪查人仍保留。
      if (skipQuestionnaire && index >= 28 && index <= 91) return '';
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
    if (headerRow.length !== 103 || KEYS.length !== 103 || HEADERS.length !== 103 ||
        headerRow.some(function (header, index) { return header !== HEADERS[index]; })) {
      throw new Error('生活關懷表欄位或表頭不一致，請同步更新範本與 Mapper');
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
```

---

## 2. MohwLifeCareValidator.gs

來源：`gas/src/utils/MohwLifeCareValidator.gs`

```javascript
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

  function isHhMm(value) {
    var m = String(value).match(/^(\d{2}):(\d{2})$/);
    if (!m) return false;
    var h = Number(m[1]);
    var mm = Number(m[2]);
    return h >= 0 && h <= 23 && mm >= 0 && mm <= 59;
  }

  function normId(value) {
    var text = String(value || '');
    if (text.normalize) text = text.normalize('NFKC');
    return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
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
    var text = asString(value);
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
      if (field.type === '數字' && !/^\d+(\.\d+)?$/.test(text)) {
        pushErr(errors, k2, row, '須填寫數字');
      }
      if (['cohabitant_age', 'sons_count', 'daughters_count'].indexOf(k2) !== -1 && !/^\d+$/.test(text)) {
        pushErr(errors, k2, row, '須填寫非負整數');
      }
      if (k2 === 'social_worker_role_other' && text.length > 10) {
        pushErr(errors, k2, row, '其他身分別說明不可超過 10 字');
      }
      if (k2 === 'social_worker_role_other' && asString(answers.social_worker_role) !== '其他') {
        pushErr(errors, k2, row, '身分非其他時，其他身分別說明應留空');
      }


      if (ID_KEYS[k2] && (!/^[A-Za-z]\d{9}$/.test(text) || !Validation.validateTaiwanId(text))) {
        var idLabel = (MohwLifeCareMapper.headers && MohwLifeCareMapper.headers[col2 - 1]) || k2;
        pushErr(errors, k2, row, idLabel.replace(/\s*\*+$/, '') + '格式不正確（須 1 碼英文 + 9 碼數字；勿填案號或姓名）');
      }
      // 本平台電話採國內格式；文字或缺少前導 0 不得假裝成有效電話。
      if (k2 === 'mobile' && !/^09\d{8}$/.test(text)) {
        pushErr(errors, k2, row, '手機格式不正確（請填 09 開頭的 10 碼數字）');
      }
      if (['phone', 'emergency_contact_phone', 'social_worker_phone', 'civil_worker_phone'].indexOf(k2) !== -1 &&
          !/^(?:09\d{8}|0[2-8]\d{7,8})$/.test(text)) {
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
```

---

## 3. MohwLifeCareExporter.gs

來源：`gas/src/utils/MohwLifeCareExporter.gs`

```javascript
/**
 * 衛福部 103 欄 xlsx 產檔（Google Drive）
 */

var MohwLifeCareExporter = (function () {
  var EXPORT_FOLDER_NAME = 'MOHW生活關懷表匯出';

  function getOrCreateFolder_() {
    var props = PropertiesService.getScriptProperties();
    var cachedId = props.getProperty('MOHW_EXPORT_FOLDER_ID');
    if (cachedId) {
      try {
        return DriveApp.getFolderById(cachedId);
      } catch (e) {
        // folder removed — recreate below
      }
    }

    var folders = DriveApp.getFoldersByName(EXPORT_FOLDER_NAME);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(EXPORT_FOLDER_NAME);
    props.setProperty('MOHW_EXPORT_FOLDER_ID', folder.getId());
    return folder;
  }

  /**
   * @param {string[][]} rows header + data rows
   * @param {string} exportId
   * @returns {{ fileId: string, fileUrl: string, fileName: string }}
   */
  function createXlsxFile(rows, exportIdOrFileName) {
    var fileName = String(exportIdOrFileName || '');
    if (!/\.xlsx$/i.test(fileName)) {
      fileName = '生活關懷表_' + fileName + '.xlsx';
    }
    return createNamedXlsxFile(rows, fileName, 'MOHW Export ' + fileName);
  }

  /**
   * @param {string[][]} rows
   * @param {string} fileName
   * @param {string} tempTitle
   * @param {{ propertyKey?: string, folderName?: string }=} folderOpts
   */
  function createNamedXlsxFile(rows, fileName, tempTitle, folderOpts) {
    if (!rows || !rows.length || !Array.isArray(rows[0]) || !rows[0].length) {
      throw new Error('MohwLifeCareExporter: empty rows');
    }
    var width = rows[0].length;
    if (rows.some(function (row) { return !Array.isArray(row) || row.length !== width; })) {
      throw new Error('匯出列的欄位數不一致');
    }
    var textRows = rows.map(function (row) {
      return row.map(function (value) { return value == null ? '' : String(value); });
    });
    folderOpts = folderOpts || {};
    var ss = SpreadsheetApp.create(tempTitle || fileName);
    var tempFile = DriveApp.getFileById(ss.getId());
    try {
      var sheet = ss.getSheets()[0];
      var range = sheet.getRange(1, 1, textRows.length, width);
      range.setNumberFormat('@');
      range.setRichTextValues(textRows.map(function (row) {
        return row.map(function (text) {
          return SpreadsheetApp.newRichTextValue().setText(text).build();
        });
      }));
      SpreadsheetApp.flush();

      // 回讀實際值與公式；不只相信寫入前的陣列。
      var saved = range.getValues();
      var formulas = range.getFormulas();
      for (var r = 0; r < textRows.length; r++) {
        for (var c = 0; c < width; c++) {
          if (formulas[r][c] || typeof saved[r][c] !== 'string' || saved[r][c] !== textRows[r][c]) {
            throw new Error('儲存格式或內容改變：第 ' + (r + 1) + ' 列、第 ' + (c + 1) + ' 欄');
          }
        }
      }

      var response = UrlFetchApp.fetch(
        'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx', {
          headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
          muteHttpExceptions: true
        });
      if (response.getResponseCode() !== 200) {
        throw new Error('xlsx export HTTP ' + response.getResponseCode());
      }
      var blob = response.getBlob();
      var bytes = blob.getBytes();
      if (bytes.length < 4 || bytes[0] !== 80 || bytes[1] !== 75 || bytes[2] !== 3 || bytes[3] !== 4) {
        throw new Error('匯出回應不是預期的 XLSX ZIP 檔');
      }
      var folder = folderOpts.folderName
        ? getOrCreateNamedFolder_(folderOpts.propertyKey, folderOpts.folderName)
        : getOrCreateFolder_();
      var file = folder.createFile(blob.setName(fileName));
      return { fileId: file.getId(), fileUrl: file.getUrl(), fileName: fileName };
    } finally {
      try { tempFile.setTrashed(true); }
      catch (cleanupError) { console.warn('暫存試算表清理失敗：' + ss.getId()); }
    }
  }

  function getOrCreateNamedFolder_(propertyKey, folderName) {
    var props = PropertiesService.getScriptProperties();
    var key = propertyKey || 'EXPORT_FOLDER_' + folderName;
    var cachedId = props.getProperty(key);
    if (cachedId) {
      try {
        return DriveApp.getFolderById(cachedId);
      } catch (e) {
        // folder removed — recreate below
      }
    }
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    props.setProperty(key, folder.getId());
    return folder;
  }

  return {
    createXlsxFile: createXlsxFile,
    createNamedXlsxFile: createNamedXlsxFile,
    getOrCreateFolder_: getOrCreateFolder_,
  };
})();
```

---

## 4. lib/domain/mohw-life-care-export.ts

來源：`lib/domain/mohw-life-care-export.ts`

```typescript
import type { CareFormAnswers } from "@/lib/domain/new-taipei-care-form";
import {
  MOHW_LIFE_CARE_COLUMNS,
  MOHW_LIFE_CARE_HEADERS,
  mergeCareFormIntoMohwAnswers,
  mergeCaseRegistryIntoMohwAnswers,
  mergeVisitMetaIntoMohwAnswers,
  type MohwCaseRegistry,
  type MohwLifeCareAnswers,
  type MohwLifeCareColumn,
  type MohwVisitMeta,
} from "@/lib/domain/mohw-life-care-form";

export type MohwLifeCareExportInput = {
  /** Preferred: already keyed by MOHW column keys. */
  mohwAnswers?: MohwLifeCareAnswers;
  /** Fallback: simplified 41-field care form. */
  careForm?: CareFormAnswers;
  visitMeta?: MohwVisitMeta;
  caseRegistry?: MohwCaseRegistry;
};

export type MohwLifeCareExportRow = {
  headers: string[];
  values: string[];
  keyed: Record<string, string>;
  gapCounts: {
    filled: number;
    empty: number;
    requiredMissing: number;
  };
};

const DATE_KEYS = new Set(["visit_date", "birth_date", "social_worker_date", "civil_worker_date"]);

const TIME_KEYS = new Set(["visit_start_time", "visit_end_time"]);

const PHONE_KEYS = new Set([
  "phone",
  "mobile",
  "emergency_contact_phone",
  "social_worker_phone",
  "civil_worker_phone",
]);

/** Visit result labels in UI → MOHW 訪視狀態 allowed values. */
const VISIT_STATUS_MAP: Record<string, string> = {
  訪視成功: "已完成",
  完成訪視: "已完成",
  已完成: "已完成",
  未遇: "查無此人",
  拒訪: "拒絕訪視",
  拒絕訪視: "拒絕訪視",
  無法溝通: "無法溝通",
  住址不詳: "住址不詳",
};

export function buildMohwLifeCareAnswers(input: MohwLifeCareExportInput): MohwLifeCareAnswers {
  let answers: MohwLifeCareAnswers = { ...(input.mohwAnswers ?? {}) };

  if (input.caseRegistry) {
    answers = mergeCaseRegistryIntoMohwAnswers(answers, input.caseRegistry);
  }

  if (input.careForm) {
    answers = mergeCareFormIntoMohwAnswers(answers, input.careForm);
  }

  if (input.visitMeta) {
    answers = mergeVisitMetaIntoMohwAnswers(answers, input.visitMeta);
  }

  if (answers.visit_status && typeof answers.visit_status === "string") {
    answers.visit_status = VISIT_STATUS_MAP[answers.visit_status] ?? answers.visit_status;
  }

  return answers;
}

const SKIP_QUESTIONNAIRE = new Set(["拒絕訪視", "查無此人", "無法溝通", "住址不詳"]);

export function buildMohwLifeCareExportRow(input: MohwLifeCareExportInput): MohwLifeCareExportRow {
  const answers = buildMohwLifeCareAnswers(input);
  const headers = MOHW_LIFE_CARE_HEADERS;
  const visitStatus = String(answers.visit_status ?? "").trim();
  const skipQuestionnaire = SKIP_QUESTIONNAIRE.has(visitStatus);
  // AC:CN（col 29–92）問卷與同意欄不帶入；CO:CY 訪查人仍保留。
  const values = MOHW_LIFE_CARE_COLUMNS.map((column) => {
    if (skipQuestionnaire && column.col >= 29 && column.col <= 92) return "";
    return formatMohwCell(answers[column.key], column);
  });
  const keyed = Object.fromEntries(
    MOHW_LIFE_CARE_COLUMNS.map((column, index) => [column.key, values[index]]),
  );

  const requiredMissing = MOHW_LIFE_CARE_COLUMNS.filter(
    (column) => column.required && !values[column.col - 1]?.trim(),
  ).length;
  const filled = values.filter((value) => value.trim().length > 0).length;

  return {
    headers,
    values,
    keyed,
    gapCounts: {
      filled,
      empty: values.length - filled,
      requiredMissing,
    },
  };
}

export function buildMohwLifeCareWorkbookRows(inputs: MohwLifeCareExportInput[]) {
  const headerRow = MOHW_LIFE_CARE_HEADERS;
  const dataRows = inputs.map((input) => buildMohwLifeCareExportRow(input).values);
  return [headerRow, ...dataRows];
}

export function formatMohwCell(value: MohwLifeCareAnswers[string], column: MohwLifeCareColumn) {
  if (value === null || value === undefined) return "";

  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean).join(";");
  }

  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }

  if (typeof value === "number") {
    return String(value);
  }

  const text = String(value).trim();
  if (!text) return "";

  if (DATE_KEYS.has(column.key)) {
    return formatRocDate(text);
  }

  if (TIME_KEYS.has(column.key)) {
    return formatTime(text);
  }

  if (PHONE_KEYS.has(column.key)) {
    return formatMohwPhone(text);
  }

  // 不替換自由文字或選項中的逗號；多選應以陣列或以半形分號寫入。

  return text;
}

const OFFICIAL_ROC_DATE = /^\d{3}\/\d{2}\/\d{2}$/;

/**
 * ISO、Date、Excel 序列或民國斜線 → `yyy/MM/dd` 文字。
 * 年固定 3 碼、月日 2 碼；四碼年明確視為西元，不依「今年」猜測改寫。
 */
export function formatRocDate(input: string | Date | number) {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return "INVALID_DATE";
    // 對齊 GAS：以台北時區拆出年月日
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(input);
    const year = Number(parts.find((p) => p.type === "year")?.value);
    const month = Number(parts.find((p) => p.type === "month")?.value);
    const day = Number(parts.find((p) => p.type === "day")?.value);
    return toRocParts(year, month, day) || "INVALID_DATE";
  }

  if (typeof input === "number") {
    return excelSerialToRoc(input) ?? String(input);
  }

  const text = String(input).trim();
  if (!text) return "";

  if (/^\d{4,6}(\.\d+)?$/.test(text)) {
    const fromSerial = excelSerialToRoc(Number(text));
    if (fromSerial) return fromSerial;
  }

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return toRocParts(Number(iso[1]), Number(iso[2]), Number(iso[3])) || text;
  }

  // 明確附時區的 ISO timestamp 依臺灣時間取日期；不接受含糊尾綴。
  const stamp = text.match(
    /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/,
  );
  if (stamp) {
    const validDate = toRocParts(Number(stamp[1]), Number(stamp[2]), Number(stamp[3]));
    const dateTime = new Date(text);
    if (!validDate || Number.isNaN(dateTime.getTime())) return text;
    return formatRocDate(dateTime);
  }

  const slash = text.match(/^(\d{1,4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slash) {
    if (slash[1].length === 4 && Number(slash[1]) < 1912) return text;
    return toRocParts(Number(slash[1]), Number(slash[2]), Number(slash[3])) || text;
  }

  return text;
}

/** 能寫進匯出檔的官方民國日期文字；無法轉換則 null。 */
export function toOfficialRocDateText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (value instanceof Date || typeof value === "number" || typeof value === "string") {
    const formatted = formatRocDate(value);
    return OFFICIAL_ROC_DATE.test(formatted) ? formatted : null;
  }
  const formatted = formatRocDate(String(value));
  return OFFICIAL_ROC_DATE.test(formatted) ? formatted : null;
}

function excelSerialToRoc(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 10000 || serial > 80000) return null;
  const utc = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000;
  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) return null;
  return toRocParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function toRocParts(year: number, month: number, day: number) {
  const rocYear = year >= 1911 ? year - 1911 : year;
  const westernYear = rocYear + 1911;
  const date = new Date(Date.UTC(westernYear, month - 1, day));
  if (
    rocYear < 1 ||
    rocYear > 999 ||
    date.getUTCFullYear() !== westernYear ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return "";
  }
  return `${String(rocYear).padStart(3, "0")}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

/** 只清理明確電話分隔符；不刪字母、不猜測遺失的前導 0。 */
export function formatMohwPhone(input: string) {
  const text = String(input ?? "").trim();
  if (!text || !/^[0-9 ()-]+$/.test(text)) return text;
  return text.replace(/[ ()-]/g, "");
}

/** `HH:mm` 24h; Excel serial fractions also supported. */
export function formatTime(input: string) {
  const numeric = Number(input);
  if (!Number.isNaN(numeric) && numeric > 0 && numeric < 1) {
    const totalMinutes = Math.round(numeric * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  const match = input.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
  }

  return input;
}
```

---

## 5. lib/domain/mohw-life-care-validation.ts

來源：`lib/domain/mohw-life-care-validation.ts`

```typescript
import { formatMohwPhone, toOfficialRocDateText } from "@/lib/domain/mohw-life-care-export";
import {
  MOHW_LIFE_CARE_COLUMNS,
  MOHW_LIFE_CARE_HEADERS,
  type MohwLifeCareAnswers,
} from "@/lib/domain/mohw-life-care-form";
import {
  normalizeMohwAnswersOptions,
  normalizeMohwOptionValue,
  parseOfficialAllowedValues,
} from "@/lib/domain/mohw-life-care-options";
import {
  MOHW_CASE_MISSING_MESSAGE,
  MOHW_DATE_CELL_MESSAGE,
  MOHW_HELP_NONE_OTHER_BLANK_MESSAGE,
  MOHW_VISITOR_ORDER_MESSAGE,
  mohwHeadersMatchTemplate,
  mohwVillagesFor,
  normalizeMohwAdminName,
} from "@/lib/domain/mohw-life-care-template";
import { isMohwAutofixDistrict } from "@/lib/domain/mohw-village-resolve";

export type MohwValidationError = {
  /** Excel-style cell, e.g. `I3` */
  cell: string;
  /** 1-based column index */
  col: number;
  /** Column letter, e.g. `I` */
  colLetter: string;
  key: string;
  label: string;
  code:
    | "REQUIRED"
    | "INVALID_NATIONAL_ID"
    | "INVALID_DATE"
    | "INVALID_TIME"
    | "INVALID_OPTION"
    | "INVALID_MULTI"
    | "INVALID_NUMBER"
    | "MAX_LENGTH"
    | "PHONE_OR_MOBILE"
    | "INVALID_PHONE"
    | "VISITOR_REQUIRED"
    | "CASE_NOT_FOUND"
    | "VILLAGE_NOT_FOUND"
    | "MUST_BE_BLANK"
    | "TEMPLATE_MISMATCH";
  message: string;
  /** Manager / export message with Excel cell: `I3 身分證號碼格式不正確` */
  display: string;
};

export type MohwValidationResult = {
  ok: boolean;
  errors: MohwValidationError[];
  /** Same format as central system upload result lines */
  errorLines: string[];
};

const SKIP_QUESTIONNAIRE = new Set(["拒絕訪視", "查無此人", "無法溝通", "住址不詳"]);

const NATIONAL_ID_KEYS = new Set([
  "national_id",
  "social_worker_national_id",
  "civil_worker_national_id",
]);

const DATE_KEYS = new Set([
  "visit_date",
  "birth_date",
  "social_worker_date",
  "civil_worker_date",
]);

const TIME_KEYS = new Set(["visit_start_time", "visit_end_time"]);

const NOTE_MAX = 200;

type Cond =
  | { type: "always" }
  | { type: "equals"; key: string; value: string }
  | { type: "includes"; key: string; value: string }
  | { type: "and"; rules: Cond[] }
  | { type: "or"; rules: Cond[] };

/** Conditional required rules aligned with 生活關懷表檔案說明範本 */
const CONDITIONAL_REQUIRED: Array<{ key: string; when: Cond; message?: string }> = [
  { key: "line_id", when: { type: "equals", key: "line_id_status", value: "有" } },
  {
    key: "living_address_note",
    when: { type: "equals", key: "living_address_type", value: "未住戶籍地址" },
  },
  {
    key: "living_city",
    when: {
      type: "and",
      rules: [
        { type: "equals", key: "living_address_type", value: "未住戶籍地址" },
        { type: "equals", key: "living_address_note", value: "居住地址為" },
      ],
    },
  },
  {
    key: "living_district",
    when: {
      type: "and",
      rules: [
        { type: "equals", key: "living_address_type", value: "未住戶籍地址" },
        { type: "equals", key: "living_address_note", value: "居住地址為" },
      ],
    },
  },
  {
    key: "living_village",
    when: {
      type: "and",
      rules: [
        { type: "equals", key: "living_address_type", value: "未住戶籍地址" },
        { type: "equals", key: "living_address_note", value: "居住地址為" },
      ],
    },
  },
  {
    key: "living_address",
    when: {
      type: "and",
      rules: [
        { type: "equals", key: "living_address_type", value: "未住戶籍地址" },
        { type: "equals", key: "living_address_note", value: "居住地址為" },
      ],
    },
  },
  {
    key: "living_address_other",
    when: { type: "equals", key: "living_address_type", value: "查無此人" },
  },
  {
    key: "housing_type_other",
    when: { type: "equals", key: "housing_type", value: "其他" },
    message: "住宅類型=其他時必須填寫其他說明",
  },
  {
    key: "social_worker_role_other",
    when: { type: "equals", key: "social_worker_role", value: "其他" },
    message: "社政訪查人身分=其他時必須填寫其他身分別說明",
  },
  {
    key: "cohabitation_status",
    when: { type: "equals", key: "living_status", value: "與他人同住" },
  },
  {
    key: "cohabitant_relation",
    when: { type: "equals", key: "cohabitation_status", value: "同住者有照顧能力" },
  },
  {
    key: "cohabitant_age",
    when: { type: "equals", key: "cohabitation_status", value: "同住者有照顧能力" },
  },
  {
    key: "cohabitant_no_care_capacity_note",
    when: { type: "equals", key: "cohabitation_status", value: "同住者無照顧能力" },
  },
  {
    key: "marital_status_other",
    when: { type: "equals", key: "marital_status", value: "其他" },
    message: "婚姻狀況=其他時必須填寫其他說明",
  },
  { key: "sons_count", when: { type: "equals", key: "has_children", value: "存" } },
  { key: "daughters_count", when: { type: "equals", key: "has_children", value: "存" } },
  { key: "children_same_city", when: { type: "equals", key: "has_children", value: "存" } },
  {
    key: "diseases_cancer_note",
    when: { type: "includes", key: "diseases", value: "癌症" },
    message: "疾病史包含癌症時必須填寫癌症說明",
  },
  {
    key: "diseases_other_note",
    when: { type: "includes", key: "diseases", value: "其他" },
    message: "疾病史包含其他時必須填寫其他說明",
  },
  {
    key: "recent_medical_note",
    when: { type: "equals", key: "recent_medical_event", value: "是" },
  },
  {
    key: "hearing_aid",
    when: { type: "equals", key: "hearing_issue", value: "是" },
  },
  {
    key: "life_difficulties",
    when: { type: "equals", key: "life_difficulties_flag", value: "有" },
  },
  {
    key: "life_difficulties_other",
    when: { type: "includes", key: "life_difficulties", value: "其他" },
  },
  { key: "worries", when: { type: "equals", key: "worries_flag", value: "有" } },
  {
    key: "worries_other",
    when: { type: "includes", key: "worries", value: "其他" },
  },
  {
    key: "help_sources_none",
    when: { type: "equals", key: "help_sources_flag", value: "無" },
  },
  {
    key: "help_sources_none_other",
    when: { type: "includes", key: "help_sources_none", value: "其他" },
  },
  {
    key: "help_sources_has",
    when: { type: "equals", key: "help_sources_flag", value: "有" },
  },
  {
    key: "help_sources_has_other",
    when: { type: "includes", key: "help_sources_has", value: "其他" },
  },
  {
    key: "information_channels_other",
    when: { type: "includes", key: "information_channels", value: "其他" },
  },
  {
    key: "past_activities_other",
    when: { type: "includes", key: "past_activities", value: "其他" },
  },
  {
    key: "desired_activities_other",
    when: { type: "includes", key: "desired_activities", value: "其他" },
  },
  {
    key: "service_willingness",
    when: { type: "equals", key: "service_willingness_flag", value: "有" },
  },
  {
    key: "service_willingness_referral_other",
    when: { type: "includes", key: "service_willingness", value: "轉介：其他服務，長者期待" },
  },
  {
    key: "self_care_observation",
    when: { type: "equals", key: "self_care_flag", value: "不可以" },
  },
  {
    key: "self_care_other",
    when: { type: "includes", key: "self_care_observation", value: "其他" },
  },
  {
    key: "home_hygiene_other",
    when: { type: "includes", key: "home_hygiene_issues", value: "其他" },
  },
  {
    key: "home_safety_other",
    when: { type: "includes", key: "home_safety_issues", value: "其他" },
  },
];

export function colIndexToLetter(col: number): string {
  let n = col;
  let letter = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

export function mohwCellRef(col: number, row: number): string {
  return `${colIndexToLetter(col)}${row}`;
}

/** Strip spaces, dashes and full-width digits; keep A–Z + 0–9. */
export function normalizeTaiwanId(id: string): string {
  return String(id ?? "")
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Taiwan national ID / resident certificate check digit (same algorithm as GAS Validation.gs). */
export function validateTaiwanId(id: string): boolean {
  const normalized = normalizeTaiwanId(id);
  if (!normalized || normalized.length !== 10) return false;
  const letters = "ABCDEFGHJKLMNPQRSTUVXYWZIO";
  const letterIndex = letters.indexOf(normalized.charAt(0));
  if (letterIndex === -1) return false;
  // 1/2 = 本國身分證；8/9 = 新式外來人口統一證號
  if (!/^[A-Z][1289]\d{8}$/.test(normalized)) return false;

  const nums = [Math.floor(letterIndex / 10) + 1, letterIndex % 10];
  for (let i = 1; i < 9; i++) {
    nums.push(Number.parseInt(normalized.charAt(i), 10));
  }
  const checksum = Number.parseInt(normalized.charAt(9), 10);
  let sum = nums[0] + nums[1] * 9;
  for (let j = 2; j < 10; j++) {
    sum += nums[j] * (10 - j);
  }
  return (10 - (sum % 10)) % 10 === checksum;
}

export function isRocDate(value: string): boolean {
  // Accept ROC yyy/M/d or padded; also ISO yyyy-MM-dd (will be converted on export)
  if (/^\d{1,3}\/\d{1,2}\/\d{1,2}$/.test(value)) {
    const [y, m, d] = value.split("/").map(Number);
    return y >= 1 && y <= 200 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
  return false;
}

export function isHhMm(value: string): boolean {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function asString(value: MohwLifeCareAnswers[string]): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(";");
  return String(value).trim();
}

function asList(value: MohwLifeCareAnswers[string]): string[] {
  if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
  const text = asString(value);
  if (!text) return [];
  return text.split(/[;；]/).map((v) => v.trim()).filter(Boolean);
}

function hasValue(value: MohwLifeCareAnswers[string]): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return asString(value).length > 0;
}

function evalCond(answers: MohwLifeCareAnswers, cond: Cond): boolean {
  if (cond.type === "always") return true;
  if (cond.type === "equals") return asString(answers[cond.key]) === cond.value;
  if (cond.type === "includes") return asList(answers[cond.key]).some((v) => v.includes(cond.value) || v === cond.value);
  if (cond.type === "and") return cond.rules.every((rule) => evalCond(answers, rule));
  if (cond.type === "or") return cond.rules.some((rule) => evalCond(answers, rule));
  return false;
}

function columnByKey(key: string) {
  return MOHW_LIFE_CARE_COLUMNS.find((column) => column.key === key);
}

function checkVillage(
  answers: MohwLifeCareAnswers,
  errors: MohwValidationError[],
  row: number,
  cityKey: string,
  districtKey: string,
  villageKey: string,
  label: string,
) {
  const village = asString(answers[villageKey]);
  if (!village) return;
  const district = asString(answers[districtKey]);
  const list = mohwVillagesFor(asString(answers[cityKey]), district);
  const found = list?.some((item) => normalizeMohwAdminName(item) === normalizeMohwAdminName(village));
  if (found) return;
  pushError(errors, {
    key: villageKey,
    row,
    code: "VILLAGE_NOT_FOUND",
    message: `${label}「${village}」在「${district}」下查無此里`,
  });
}

function pushError(
  errors: MohwValidationError[],
  opts: {
    key: string;
    row: number;
    code: MohwValidationError["code"];
    message: string;
  },
) {
  const column = columnByKey(opts.key);
  if (!column) return;
  const colLetter = colIndexToLetter(column.col);
  const cell = `${colLetter}${opts.row}`;
  const label = column.header.replace(/\s*\*+$/, "").replace(/\*$/, "");
  errors.push({
    cell,
    col: column.col,
    colLetter,
    key: opts.key,
    label,
    code: opts.code,
    message: opts.message,
    display: `${cell} ${opts.message}`,
  });
}

/**
 * Validate one MOHW life-care row.
 * @param row Excel data row number (header is row 1; first data row is usually 2)
 */
export function validateMohwLifeCareRow(
  answers: MohwLifeCareAnswers,
  options: { row?: number; registryNationalId?: string | null } = {},
): MohwValidationResult {
  const row = options.row ?? 2;
  const errors: MohwValidationError[] = [];
  // 匯出不自動改寫村里；資料錯誤應回原始來源確認。
  answers = normalizeMohwAnswersOptions(answers);
  // 電話格式檢查對齊匯出後字串（只清空白／括號／連字號）。
  for (const key of ["phone", "mobile", "emergency_contact_phone", "social_worker_phone", "civil_worker_phone"] as const) {
    if (hasValue(answers[key])) {
      answers[key] = formatMohwPhone(asString(answers[key]));
    }
  }
  const visitStatus = asString(answers.visit_status);
  const skipQuestionnaire = SKIP_QUESTIONNAIRE.has(visitStatus);

  // Always-required (non-questionnaire) fields
  const alwaysRequired = MOHW_LIFE_CARE_COLUMNS.filter((column) => {
    if (!column.required) return false;
    // 未完成訪視：住宅類型起至同意／簽名（AC:CN，col 29–92）略過
    if (skipQuestionnaire && column.col >= 29 && column.col <= 92) return false;
    // Visitor fields handled as either-or below
    if (column.col >= 93) return false;
    return true;
  });

  for (const column of alwaysRequired) {
    if (!hasValue(answers[column.key])) {
      pushError(errors, {
        key: column.key,
        row,
        code: "REQUIRED",
        message: `${column.header.replace(/\s*\*+$/, "").replace(/\*$/, "")}為必填`,
      });
    }
  }

  // Phone or mobile
  if (!hasValue(answers.phone) && !hasValue(answers.mobile)) {
    pushError(errors, {
      key: "phone",
      row,
      code: "PHONE_OR_MOBILE",
      message: "電話、手機擇一必填",
    });
  }

  // Conditional required (questionnaire skipped → skip col 29–89 conditionals)
  for (const rule of CONDITIONAL_REQUIRED) {
    const column = columnByKey(rule.key);
    if (!column) continue;
    if (skipQuestionnaire && column.col >= 29 && column.col <= 92) continue;
    if (!evalCond(answers, rule.when)) continue;
    if (!hasValue(answers[rule.key])) {
      pushError(errors, {
        key: rule.key,
        row,
        code: "REQUIRED",
        message: rule.message ?? `${column.header.replace(/\s*\*+$/, "").replace(/\*$/, "")}為條件必填`,
      });
    }
  }

  // Social / civil visitor either-or
  const hasSocial =
    hasValue(answers.social_worker_role) ||
    hasValue(answers.social_worker_name) ||
    hasValue(answers.social_worker_national_id) ||
    hasValue(answers.social_worker_phone) ||
    hasValue(answers.social_worker_date);
  const hasCivil =
    hasValue(answers.civil_worker_role) ||
    hasValue(answers.civil_worker_name) ||
    hasValue(answers.civil_worker_national_id) ||
    hasValue(answers.civil_worker_phone) ||
    hasValue(answers.civil_worker_date);

  if (!hasSocial && !hasCivil) {
    pushError(errors, {
      key: "social_worker_role",
      row,
      code: "VISITOR_REQUIRED",
      message: "社政訪查人與民政訪查人擇一必填",
    });
  }

  if (hasSocial) {
    for (const key of [
      "social_worker_role",
      "social_worker_name",
      "social_worker_national_id",
      "social_worker_phone",
      "social_worker_date",
    ] as const) {
      if (!hasValue(answers[key])) {
        pushError(errors, {
          key,
          row,
          code: "REQUIRED",
          message: `${columnByKey(key)?.header ?? key}為必填（已填社政訪查人）`,
        });
      }
    }
  }

  if (hasCivil) {
    for (const key of [
      "civil_worker_role",
      "civil_worker_name",
      "civil_worker_national_id",
      "civil_worker_phone",
      "civil_worker_date",
    ] as const) {
      if (!hasValue(answers[key])) {
        pushError(errors, {
          key,
          row,
          code: "REQUIRED",
          message: `${columnByKey(key)?.header ?? key}為必填（已填民政訪查人）`,
        });
      }
    }
  }

  // Format checks for filled values
  for (const column of MOHW_LIFE_CARE_COLUMNS) {
    const raw = answers[column.key];
    if (!hasValue(raw)) continue;
    if (skipQuestionnaire && column.col >= 29 && column.col <= 92) continue;

    const text = asString(raw);

    // 對實際輸出檢查：先要求 1 英文＋9 數字，再做檢查碼（不先剝連字號）。
    if (NATIONAL_ID_KEYS.has(column.key) && (!/^[A-Za-z]\d{9}$/.test(text) || !validateTaiwanId(text))) {
      const label = column.header.replace(/\s*\*+$/, "").replace(/\*$/, "");
      pushError(errors, {
        key: column.key,
        row,
        code: "INVALID_NATIONAL_ID",
        message: `${label}格式不正確（須 1 碼英文 + 9 碼數字；勿填案號或姓名）`,
      });
    }

    if (column.key === "mobile" && !/^09\d{8}$/.test(text)) {
      pushError(errors, {
        key: column.key,
        row,
        code: "INVALID_PHONE",
        message: "手機格式不正確（請填 09 開頭的 10 碼數字）",
      });
    }

    if (
      (column.key === "phone" ||
        column.key === "emergency_contact_phone" ||
        column.key === "social_worker_phone" ||
        column.key === "civil_worker_phone") &&
      !/^(?:09\d{8}|0[2-8]\d{7,8})$/.test(text)
    ) {
      pushError(errors, {
        key: column.key,
        row,
        code: "INVALID_PHONE",
        message: "電話格式不正確（請填含前導 0 的國內市話或手機，不含分機）",
      });
    }

    if (DATE_KEYS.has(column.key) && !toOfficialRocDateText(raw)) {
      pushError(errors, {
        key: column.key,
        row,
        code: "INVALID_DATE",
        message: MOHW_DATE_CELL_MESSAGE,
      });
    }

    if (TIME_KEYS.has(column.key) && !isHhMm(text)) {
      pushError(errors, {
        key: column.key,
        row,
        code: "INVALID_TIME",
        message: "時間格式不正確（請用 HH:mm）",
      });
    }

    if (column.inputType === "數字" && Number.isNaN(Number(text))) {
      pushError(errors, {
        key: column.key,
        row,
        code: "INVALID_NUMBER",
        message: "必須為數字",
      });
    }

    if (column.allowedValues) {
      const allowed = parseOfficialAllowedValues(column.allowedValues);

      if (allowed.length > 0) {
        if (column.inputType.includes("多選")) {
          const values = asList(raw).map((value) =>
            normalizeMohwOptionValue(column.key, value),
          );
          const invalid = values.filter((value) => !allowed.includes(value));
          // Also reject comma separators (MOHW requires ;)
          if (typeof raw === "string" && raw.includes(",") && !raw.includes(";")) {
            pushError(errors, {
              key: column.key,
              row,
              code: "INVALID_MULTI",
              message: "多選請用半形分號 ; 分隔，不可使用 ,",
            });
          } else if (invalid.length > 0) {
            pushError(errors, {
              key: column.key,
              row,
              code: "INVALID_OPTION",
              message: `含有不允許的選項：${invalid.join("、")}`,
            });
          }
        } else if (column.inputType.includes("單選")) {
          const normalized = normalizeMohwOptionValue(column.key, text);
          if (!allowed.includes(normalized)) {
            pushError(errors, {
              key: column.key,
              row,
              code: "INVALID_OPTION",
              message: `選項不在允許值內（官方：${allowed.join("、")}）`,
            });
          }
        }
      }
    }

    if (
      (column.key.includes("other") || column.key === "visit_notes") &&
      text.length > NOTE_MAX
    ) {
      pushError(errors, {
        key: column.key,
        row,
        code: "MAX_LENGTH",
        message: `字數不可超過 ${NOTE_MAX} 字`,
      });
    }
  }

  // 永和落地：只檢核永和區村里；其餘戶籍／居住行政區先不擋「查無此里」
  const householdDistrict = asString(answers.household_district);
  const livingDistrict = asString(answers.living_district) || householdDistrict;
  if (isMohwAutofixDistrict(householdDistrict)) {
    checkVillage(
      answers,
      errors,
      row,
      "household_city",
      "household_district",
      "household_village",
      "戶籍村里",
    );
  }
  if (isMohwAutofixDistrict(livingDistrict)) {
    checkVillage(answers, errors, row, "living_city", "living_district", "living_village", "居住村里");
  }

  const helpNone = asList(answers.help_sources_none);
  if (asString(answers.help_sources_none_other) && !helpNone.includes("其他")) {
    pushError(errors, {
      key: "help_sources_none_other",
      row,
      code: "MUST_BE_BLANK",
      message: MOHW_HELP_NONE_OTHER_BLANK_MESSAGE,
    });
  }

  if (!mohwHeadersMatchTemplate(MOHW_LIFE_CARE_HEADERS)) {
    pushError(errors, {
      key: "social_worker_role_other",
      row,
      code: "TEMPLATE_MISMATCH",
      message: MOHW_VISITOR_ORDER_MESSAGE,
    });
  }

  if ("registryNationalId" in options) {
    const registry = normalizeTaiwanId(options.registryNationalId ?? "");
    const current = normalizeTaiwanId(asString(answers.national_id));
    if (!registry || !current || registry !== current) {
      for (let index = errors.length - 1; index >= 0; index -= 1) {
        const error = errors[index];
        if (error.key === "national_id" && (error.code === "REQUIRED" || error.code === "INVALID_NATIONAL_ID")) {
          errors.splice(index, 1);
        }
      }
      pushError(errors, {
        key: "national_id",
        row,
        code: "CASE_NOT_FOUND",
        message: MOHW_CASE_MISSING_MESSAGE,
      });
    }
  }

  // De-duplicate by cell+code
  const seen = new Set<string>();
  const unique = errors.filter((error) => {
    const id = `${error.cell}:${error.code}:${error.message}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return {
    ok: unique.length === 0,
    errors: unique,
    errorLines: unique.map((error) => error.display),
  };
}

export function validateMohwLifeCareBatch(
  rows: MohwLifeCareAnswers[],
  options: { startRow?: number } = {},
): {
  ok: boolean;
  successCount: number;
  failCount: number;
  results: Array<MohwValidationResult & { row: number }>;
  errorLines: string[];
} {
  const startRow = options.startRow ?? 2;
  const results = rows.map((answers, index) => {
    const row = startRow + index;
    return { row, ...validateMohwLifeCareRow(answers, { row }) };
  });
  const successCount = results.filter((result) => result.ok).length;
  const failCount = results.length - successCount;
  return {
    ok: failCount === 0,
    successCount,
    failCount,
    results,
    errorLines: results.flatMap((result) => result.errorLines),
  };
}

export function careFieldDomId(key: string): string {
  return `care-field-${key}`;
}

/** Attach shared errors to the fields a visitor actually sees. */
export function mapMohwErrorsToFields(
  errors: MohwValidationError[],
): Map<string, MohwValidationError> {
  const map = new Map<string, MohwValidationError>();
  for (const error of errors) {
    if (!map.has(error.key)) map.set(error.key, error);
    if (error.code === "PHONE_OR_MOBILE" && !map.has("mobile")) {
      map.set("mobile", error);
    }
    if (error.code === "VISITOR_REQUIRED" && !map.has("civil_worker_role")) {
      map.set("civil_worker_role", error);
    }
  }
  return map;
}

/** Plain-language copy for 訪查員. Keep Excel coordinates on manager export only. */
export function visitorFacingMohwError(error: MohwValidationError): string {
  switch (error.code) {
    case "REQUIRED":
      if (error.message.includes("已填社政")) {
        return `已開始填社政訪查人，請補齊「${error.label}」`;
      }
      if (error.message.includes("已填民政")) {
        return `已開始填民政訪查人，請補齊「${error.label}」`;
      }
      if (error.message.includes("條件")) {
        return `依前面的答案，請補填「${error.label}」`;
      }
      return `請填寫「${error.label}」`;
    case "INVALID_NATIONAL_ID":
      return `「${error.label}」請填 10 碼身分證（1 個英文字加 9 個數字），不要填案號或姓名`;
    case "INVALID_DATE":
      return "日期要存成文字，並用民國年，例如 048/6/15 或 113/06/15";
    case "CASE_NOT_FOUND":
      return "身分證對不到這筆個案，請核對個案名冊的身分證字號";
    case "VILLAGE_NOT_FOUND":
      return error.message;
    case "MUST_BE_BLANK":
      return "沒有勾「其他」時，「求助對象無-其他說明」請留空";
    case "TEMPLATE_MISMATCH":
      return "訪查人欄位順序和最新匯入範本不一致";
    case "INVALID_TIME":
      return "時間請用 24 小時制，例如 09:30";
    case "INVALID_NUMBER":
      return "這一欄請填數字";
    case "INVALID_MULTI":
      return "多選請直接點畫面上的選項";
    case "INVALID_OPTION":
      return `「${error.label}」請改選畫面上的選項`;
    case "MAX_LENGTH":
      return error.message.startsWith("字數") ? error.message : "字數太多，請縮短";
    case "PHONE_OR_MOBILE":
      return "電話或手機請至少填一項";
    case "INVALID_PHONE":
      return error.message;
    case "VISITOR_REQUIRED":
      return "社政訪查人或民政訪查人請擇一填寫";
    default:
      return error.message;
  }
}
```

---

## 6. mergeCaseRegistryIntoMohwAnswers（form.ts 片段）

來源：`lib/domain/mohw-life-care-form.ts`

```typescript
  mohw: MohwLifeCareAnswers,
  caseRow: MohwCaseRegistry,
): MohwLifeCareAnswers {
  const merged: MohwLifeCareAnswers = { ...mohw };

  if (caseRow.name) merged.name = caseRow.name;
  if (caseRow.nationalId) merged.national_id = caseRow.nationalId;
  if (caseRow.birthDate) merged.birth_date = toIsoOrString(caseRow.birthDate);
  if (caseRow.phone) merged.phone = caseRow.phone;
  if (caseRow.mobile) merged.mobile = caseRow.mobile;
  if (caseRow.householdCity) merged.household_city = caseRow.householdCity;
  if (caseRow.householdDistrict) merged.household_district = caseRow.householdDistrict;
  if (caseRow.householdVillage) merged.household_village = caseRow.householdVillage;
  if (caseRow.householdAddress) merged.household_address = caseRow.householdAddress;
  if (caseRow.livingCity) merged.living_city = caseRow.livingCity;
  if (caseRow.livingDistrict) merged.living_district = caseRow.livingDistrict;
  if (caseRow.livingVillage) merged.living_village = caseRow.livingVillage;
  if (caseRow.livingAddress) merged.living_address = caseRow.livingAddress;
  if (!merged.household_address && caseRow.address) merged.household_address = caseRow.address;

  // 匯出不依地址自動改寫村里；錯誤由驗證器指出，再回原始資料確認。
  return merged;
}

function formatConsent(value: boolean | string) {
  if (typeof value === "boolean") {
    return value ? "同意" : "不同意";
```

---

## 7. ExportModule.exportLifeCareXlsx（沿用，未改）

來源：`gas/src/modules/ExportModule.gs`

```javascript
  function exportLifeCareXlsx(data) {
```

---

檢查完畢後若需對照 V2 說明，見 `docs/mohw-export-format-fix-pack-v2.md`。
