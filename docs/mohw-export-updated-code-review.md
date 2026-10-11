# 衛福部生活關懷表 GAS 匯出程式（更新後完整檢查包）

擷取時間：2026-10-11 11:28  
對應 commit／部署：`c1d82c2`／GAS `@66`（套用 `GAS匯出格式修正版.zip` 後）  
說明文件：`docs/mohw-export-format-fix-pack.md`

## 流程概觀

```
ExportModule.exportLifeCareXlsx
  ├─ 依 case_ids 組 payloads（caseRow + careform）
  ├─ MohwLifeCareMapper.buildWorkbookRows(payloads)  ← 組合 103 欄列（含格式化）
  ├─ 從「輸出列」還原 answers → MohwLifeCareValidator.validateBatch
  │     （正式匯出固定 strict=true，失敗不產檔）
  └─ MohwLifeCareExporter.createXlsxFile(rows, fileName)
        └─ setNumberFormat('@') + setRichTextValues（不加單引號前綴）
```

## 檔案清單

| 檔案 | 路徑 |
|---|---|
| ExportModule | `gas/src/modules/ExportModule.gs` |
| Mapper | `gas/src/utils/MohwLifeCareMapper.gs` |
| Exporter | `gas/src/utils/MohwLifeCareExporter.gs` |
| Validator | `gas/src/utils/MohwLifeCareValidator.gs` |
| OfficialTemplate | `gas/src/utils/MohwOfficialTemplate.gs`（村里對照表很長；本 md 含表頭＋文字欄＋村里自動修正） |

---

## 1. ExportModule：組合 → 驗證輸出列 → 產檔

來源：`gas/src/modules/ExportModule.gs`

```javascript
  function exportLifeCareXlsx(data) {
    Validation.requireFields(data, ['case_ids']);
    var caseIds = data.case_ids;
    var onlyAudited = data.only_audited === true;
    var payloads = [];
    var skipped = [];
    var index = VisitRecordIndex.build();

    caseIds.forEach(function (caseId) {
      var caseRow = index.caseById[String(caseId)] || CaseModule.get(caseId);
      if (!caseRow) {
        skipped.push({ case_id: caseId, reason: '個案不存在' });
        return;
      }
      var careform = VisitRecordIndex.latestEligibleCareformForCase(index, caseId);
      if (!careform) {
        skipped.push({ case_id: caseId, reason: '尚無關懷表' });
        return;
      }
      if (onlyAudited) {
        var audit = VisitRecordIndex.latestAudit(index, careform.careform_id);
        var pass = (audit && audit.decision === '通過') || careform.status === '已稽核';
        if (!pass) {
          skipped.push({ case_id: caseId, reason: '尚未稽核通過' });
          return;
        }
      }
      payloads.push({ caseRow: caseRow, careform: careform });
    });

    if (!payloads.length) {
      var emptyErr = new Error('沒有可匯出的個案');
      emptyErr.code = 'NO_EXPORTABLE_CASES';
      emptyErr.errorLines = skipped.map(function (s) {
        return s.case_id + ' ' + s.reason;
      });
      throw emptyErr;
    }

    var rows = MohwLifeCareMapper.buildWorkbookRows(payloads);

    var answerRows = rows.slice(1).map(function (row) {
      var answers = {};
      MohwLifeCareMapper.keys.forEach(function (key, index) { answers[key] = row[index]; });
      return answers;
    });
    var registryIds = payloads.map(function (payload) {
      var caseRow = payload.caseRow || {};
      return caseRow.id_number || caseRow.national_id || '';
    });

    var batch = MohwLifeCareValidator.validateBatch(answerRows, 2, registryIds);
    var strict = true; // 正式生活關懷表禁止略過驗證產檔。
    if (strict && !batch.ok) {
      var verr = new Error(
        '匯出驗證失敗 ' + batch.failCount + ' 筆：' + batch.errorLines.slice(0, 10).join('；')
      );
      verr.code = 'MOHW_VALIDATION_ERROR';
      verr.errorLines = batch.errorLines;
      verr.errors = batch.results;
      throw verr;
    }

    var stamp = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd-HHmmss');
    var exportId = uniqueExportId_(stamp);
    // 例：生活關懷表_EXP_20261006-222715.xlsx（日期時間当分秒流水號）
    var fileName = '生活關懷表_' + exportId.replace(/^EXP-/, 'EXP_') + '.xlsx';

    var exportRecord = {
      export_id: exportId,
      export_type: 'mohw_life_care',
      case_count: payloads.length,
      file_name: fileName,
      file_id: '',
      file_url: '',
      column_count: MohwLifeCareMapper.headers.length,
      skipped_count: skipped.length,
      exported_by: Session.getActiveUser().getEmail() || 'system',
      exported_at: new Date().toISOString(),
    };

    SheetHelper.ensureColumns(SHEET, [
      'export_id',
      'export_type',
      'case_count',
      'file_name',
      'file_id',
      'file_url',
      'column_count',
      'skipped_count',
      'exported_by',
      'exported_at',
    ]);

    var fileInfo = MohwLifeCareExporter.createXlsxFile(rows, fileName);
    exportRecord.file_url = fileInfo.fileUrl;
    exportRecord.file_id = fileInfo.fileId;
    exportRecord.file_name = fileInfo.fileName || fileName;

    SheetHelper.appendRow(SHEET, exportRecord);
    try {
      ReadCache.bump();
    } catch (e) {}

    return {
      export_id: exportRecord.export_id,
      case_count: payloads.length,
      skipped: skipped,
      status: 'ready',
      column_count: MohwLifeCareMapper.headers.length,
      file_url: fileInfo.fileUrl,
      file_name: exportRecord.file_name,
      file_id: fileInfo.fileId,
      validation: {
        ok: batch.ok,
        successCount: batch.successCount,
        failCount: batch.failCount,
        errorLines: batch.errorLines,
      },
      message: batch.ok
        ? '已產生 103 欄 xlsx（' + exportRecord.file_name + '）並上傳 Google Drive'
        : '已產生 xlsx，但有 ' + batch.failCount + ' 筆驗證錯誤（非嚴格模式）',
    };
  }
  /** EXP-yyyyMMdd-HHmmss；同秒重複則加 -2、-3… */
  function uniqueExportId_(stamp) {
    var base = 'EXP-' + stamp;
    var existing = {};
    try {
      SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET)).forEach(function (row) {
        existing[String(row.export_id || '')] = true;
      });
    } catch (e) {
      return base;
    }
    if (!existing[base]) return base;
    var n = 2;
    while (existing[base + '-' + n]) n++;
    return base + '-' + n;
  }
```

---

## 2. MohwLifeCareMapper（完整模組）

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

    if (typeof MohwOfficialTemplate !== 'undefined' && MohwOfficialTemplate.applyVillageAutoFix) {
      answers = MohwOfficialTemplate.applyVillageAutoFix(answers, {
        visitAddress: caseRow.address || caseRow.visit_address || ''
      });
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

    var iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
      return toRocParts_(Number(iso[1]), Number(iso[2]), Number(iso[3])) || text;
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

```

---

## 3. MohwLifeCareExporter（完整模組）

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
    if (!rows || rows.length === 0) {
      throw new Error('MohwLifeCareExporter: empty rows');
    }

    folderOpts = folderOpts || {};
    var ss = SpreadsheetApp.create(tempTitle || fileName);
    var sheet = ss.getSheets()[0];
    var range = sheet.getRange(1, 1, rows.length, rows[0].length);
    // 日期、時間、電話皆使用文字；數字欄與範本示例一致保留数字文字。
    range.setNumberFormat('@');
    // 以 rich text 字串寫入：保留民國日期與前導 0，不附加單引號。
    range.setRichTextValues(rows.map(function (row) {
      return row.map(function (value) {
        return SpreadsheetApp.newRichTextValue()
          .setText(value == null ? '' : String(value)).build();
      });
    }));
    SpreadsheetApp.flush();

    var spreadsheetId = ss.getId();
    var tempFile = DriveApp.getFileById(spreadsheetId);
    // getBlob().getAs(xlsx) 常失敗（PDF MIME）；改走 Sheets export API
    var exportUrl =
      'https://docs.google.com/spreadsheets/d/' +
      spreadsheetId +
      '/export?format=xlsx';
    var response = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    });
    if (response.getResponseCode() !== 200) {
      tempFile.setTrashed(true);
      throw new Error(
        'xlsx export HTTP ' + response.getResponseCode() + ': ' + response.getContentText().slice(0, 200)
      );
    }
    var xlsxBlob = response.getBlob().setName(fileName);

    var folder = folderOpts.folderName
      ? getOrCreateNamedFolder_(folderOpts.propertyKey, folderOpts.folderName)
      : getOrCreateFolder_();
    var file = folder.createFile(xlsxBlob);
    tempFile.setTrashed(true);

    return {
      fileId: file.getId(),
      fileUrl: file.getUrl(),
      fileName: fileName,
    };
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

## 4. MohwLifeCareValidator（完整模組）

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
      if (skipQ && col >= 29 && col <= 89) continue;
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
      if (skipQ && colIdx >= 29 && colIdx <= 89) continue;
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
      if (skipQ && col2 >= 29 && col2 <= 89) continue;
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


      if (ID_KEYS[k2] && !Validation.validateTaiwanId(text)) {
        var idLabel = (MohwLifeCareMapper.headers && MohwLifeCareMapper.headers[col2 - 1]) || k2;
        pushErr(errors, k2, row, idLabel.replace(/\s*\*+$/, '') + '格式不正確（須 1 碼英文 + 9 碼數字；勿填案號或姓名）');
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
    if (hasValue(answers.help_sources_none_other) && !helpNoneHasOther) {
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

## 5. MohwOfficialTemplate（表頭／文字欄／村里自動修正）

完整村里對照 `VILLAGES` 請直接開 `gas/src/utils/MohwOfficialTemplate.gs`（約 700+ 行）。  
以下為表頭、文字欄定義，以及檔案末段自動修正邏輯。

### 5.1 HEADERS

```javascript
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
  // 強制純文字，避免 Sheets/xlsx 吃掉前導 0 或把民國日期改成日期型別。
  // 1=訪查日期 8=出生 9=身分證 10=電話 11=手機 13=Line 17=緊急電話
  // 94=社政其他身分 96=社政證號 97=社政電話 98=社政日期
  // 101=民政證號 102=民政電話 103=民政日期
```

### 5.2 TEXT_COLUMNS

```javascript
  var TEXT_COLUMNS = {
    1: 1,
    8: 1,
    9: 1,
    10: 1,
    11: 1,
    13: 1,
    14: 1,
    17: 1,
    94: 1,
    96: 1,
    97: 1,
    98: 1,
    101: 1,
    102: 1,
    103: 1
  };
```

### 5.3 永和村里自動修正與 exports

```javascript
  var AUTOFIX_DISTRICT = '永和區';

  function isAutofixDistrict_(district) {
    return norm(district) === norm(AUTOFIX_DISTRICT);
  }

  /**
   * 只自動修正永和區村里；以居住地址為主。
   * 其他戶籍區先不動。extras.visitAddress = 個案名冊 address。
   */
  function applyVillageAutoFix(answers, extras) {
    answers = answers || {};
    extras = extras || {};
    var livingType = String(answers.living_address_type || '').replace(/^\s+|\s+$/g, '');
    var sameAsHousehold = !livingType || livingType === '與戶籍地址相同';
    var separateLiving = livingType === '未住戶籍地址';

    var householdCity = answers.household_city || '';
    var householdDistrict = answers.household_district || '';
    var livingCity = answers.living_city || answers.household_city || '';
    var livingDistrict = answers.living_district || answers.household_district || '';
    var visitAddress = extras.visitAddress || '';
    var preferAddress = answers.living_address || visitAddress || answers.household_address || '';

    var livingInYonghe = isAutofixDistrict_(livingDistrict);
    var householdInYonghe = isAutofixDistrict_(householdDistrict);
    if (!livingInYonghe && !householdInYonghe) return answers;

    if (livingInYonghe) {
      var livingSeed =
        answers.living_village || (sameAsHousehold ? answers.household_village : '') || '';
      var livingResolved = resolveVillage(livingCity, livingDistrict, livingSeed, preferAddress);

      if (separateLiving && livingResolved.corrected) {
        answers.living_village = livingResolved.village;
      }

      if (sameAsHousehold && livingResolved.village) {
        if (
          householdInYonghe &&
          (livingResolved.corrected ||
            !isOfficialVillage_(householdCity, householdDistrict, answers.household_village))
        ) {
          answers.household_village = livingResolved.village;
        }
        if (
          answers.living_village &&
          (livingResolved.corrected ||
            !isOfficialVillage_(livingCity, livingDistrict, answers.living_village))
        ) {
          answers.living_village = livingResolved.village;
        }
      }

      if (separateLiving) {
        var livingAgain = resolveVillage(
          livingCity,
          livingDistrict,
          answers.living_village,
          preferAddress
        );
        if (livingAgain.corrected) answers.living_village = livingAgain.village;
      }

      if (householdInYonghe) {
        var livingVillageFinal =
          (separateLiving ? answers.living_village : livingResolved.village) ||
          answers.living_village ||
          livingResolved.village ||
          '';
        var livingOk = isOfficialVillage_(livingCity, livingDistrict, livingVillageFinal);
        var householdOk = isOfficialVillage_(
          householdCity,
          householdDistrict,
          answers.household_village
        );
        if (!householdOk && livingOk && livingVillageFinal) {
          answers.household_village = livingVillageFinal;
        } else if (!householdOk) {
          var householdResolved = resolveVillage(
            householdCity,
            householdDistrict,
            answers.household_village,
            preferAddress
          );
          if (householdResolved.corrected) {
            answers.household_village = householdResolved.village;
          }
        }
      }
    } else if (householdInYonghe && sameAsHousehold) {
      var onlyHousehold = resolveVillage(
        householdCity,
        householdDistrict,
        answers.household_village,
        preferAddress
      );
      if (onlyHousehold.corrected) answers.household_village = onlyHousehold.village;
    }

    return answers;
  }

  return {
    HEADERS: HEADERS,
    TEXT_COLUMNS: TEXT_COLUMNS,
    villagesFor: villagesFor,
    headersMatch: headersMatch,
    norm: norm,
    resolveVillage: resolveVillage,
    applyVillageAutoFix: applyVillageAutoFix
  };
})();
```

---

## 檢查清單（建議）

1. 時間：`formatTime` 輸出 `HH:mm`（兩位小時）  
2. 日期：`formatRocDate` → `yyy/MM/dd`；不依「今年」把 2028 猜成民國 28  
3. 產檔：`setRichTextValues`，儲存格內容無字面單引號 `'`  
4. 驗證對象：`validateBatch` 使用「格式化後的 103 欄列」還原的 answers  
5. `strict = true`：驗證失敗不產生正式 XLSX  
6. 表頭 R/S/T：`戶籍-縣市 *`／`戶籍-鄉鎮區 *`／`戶籍-村里 *`（星號前有空白）  
7. 自由文字逗號（如「有，不願提供」）不被改成分號  
