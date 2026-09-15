/**
 * 新北市獨居長者生活關懷表：以指定 Google 試算表為空白母版，
 * 寫入訪員答案後固定匯出為「單頁直式 A3」PDF。
 */
var NtpcCareFormPdfModule = (function () {
  var TEMPLATE_SHEET_NAME = '獨居長者生活關懷表';
  var DEFAULT_TEMPLATE_ID = '106h8JIuZ4CdCUqXn5vImoxRbveTknylzsiy4lMpAnPk';
  var TIME_ZONE = 'Asia/Taipei';

  var OPTION_CELLS = {
    gender: { '男': 'MV6', '女': 'NZ6', '其他': 'PD6' },
    line_id_status: { '無': 'CG9', '有': 'DK9', '有，不願提供': 'DK9' },
    living_address_type: {
      '與戶籍地址相同': 'CG11',
      '未住戶籍地址': 'CG12',
      '查無此人': 'CG14'
    },
    living_address_note: { '居住地址不詳': 'GE12', '居住地址為': 'GE13' },
    housing_type: {
      '電梯大樓': 'CG15',
      '有電梯公寓': 'EJ15',
      '有電梯透天樓房': 'GX15',
      '無電梯公寓': 'KG15',
      '無電梯透天樓房': 'MW15',
      '平房': 'QF15',
      '其他': 'RP15'
    },
    living_status: { '與他人同住': 'CG16', '1人獨自居住': 'CG17' },
    cohabitation_status: {
      '同住者有照顧能力': 'GU16',
      '外籍移工(看護)同住': 'RS16',
      '同住配偶年滿65歲': 'FG17',
      '同住者無照顧能力': 'JK17'
    },
    education: {
      '不識字': 'CG18',
      '識字': 'EO18',
      '小學': 'GM18',
      '初(國)中': 'IJ18',
      '高中(職)': 'LF18',
      '專科': 'OB18',
      '大學': 'QC18',
      '研究所': 'SC18'
    },
    marital_status: {
      '有配偶或同居': 'CG19',
      '喪偶': 'FG19',
      '離婚或分居': 'GW19',
      '未婚': 'JR19',
      '其他': 'LG19'
    },
    has_children: { '無': 'CG20', '存': 'DL20' },
    children_same_city: { '否': 'PH20', '是': 'QO20' },
    health_self_rating: {
      '很好': 'IF21',
      '還算好': 'JS21',
      '普通': 'LR21',
      '不太好': 'NA21',
      '很不好': 'OW21'
    },
    weight_change_3m: {
      '無改變': 'KO22',
      '減輕1-3公斤': 'MI22',
      '減輕3公斤以上': 'PK22',
      '增加': 'SW22',
      '不知道': 'UI22'
    },
    appetite_3m: {
      '嚴重食慾不佳': 'HK23',
      '中度食慾不佳': 'KJ23',
      '無變化': 'NJ23'
    },
    diseases: {
      '心臟病': 'HK24',
      '中風': 'JE24',
      '高血壓': 'KO24',
      '糖尿病': 'MJ24',
      '骨與關節疾病': 'OE24',
      '癌症': 'RG24',
      '失智症': 'UI24',
      '其他': 'HK25',
      '以上均無': 'KO25'
    },
    recent_medical_event: { '否': 'KW26', '是': 'MB26' },
    hearing_issue: { '否': 'EM27', '是': 'FR27' },
    hearing_aid: { '否': 'KS27', '是': 'LY27' },
    vision_issue: { '否': 'FH28', '是': 'GL28' },
    family_interaction: {
      '從未': 'CG29',
      '每月少於1次': 'DS29',
      '每個月1次': 'GL29',
      '每個月2-3次': 'IT29',
      '每周1次': 'LO29',
      '每周2-6次': 'NN29',
      '每天': 'QD29'
    },
    neighbor_interaction: {
      '從未': 'CG30',
      '每月少於1次': 'DS30',
      '每個月1次': 'GL30',
      '每個月2-3次': 'IT30',
      '每周1次': 'LO30',
      '每周2-6次': 'NN30',
      '每天': 'QD30'
    },
    life_difficulties: {
      '三餐無法溫飽': 'HL31',
      '無人可協助就醫': 'KG31',
      '租屋困難': 'NO31',
      '最近記憶力不好': 'PU31',
      '外出交通不方便（例如缺乏公車或客運）': 'HL32',
      '其他': 'PC32'
    },
    worries: {
      '自己受傷或疾病': 'HL33',
      '親人受傷或疾病': 'KU33',
      '親人離世': 'OE33',
      '自己經濟問題(如債務)': 'QL33',
      '被詐騙': 'HL34',
      '子女、孫子女問題（如打擾生活、財務處理等）': 'JE34',
      '其他': 'RW34'
    },
    help_sources_none: {
      '沒發生過': 'GT35',
      '不想麻煩別人，都是自己想辦法': 'IY35',
      '找不到人可以協助': 'OX35',
      '其他': 'SO35'
    },
    help_sources_has: {
      '家人': 'GT36',
      '朋友': 'IE36',
      '鄰居': 'JO36',
      '社工': 'KX36',
      '村里長': 'MH36',
      '社區志工': 'OA36',
      '大廈管理員': 'QD36',
      '其他': 'SO36'
    },
    information_channels: {
      '電視': 'EB37',
      '報紙': 'FN37',
      '廣播': 'GY37',
      '網路': 'IJ37',
      '村里長': 'JT37',
      '親友或鄰里': 'LO37',
      '社群媒體(如：Line、FB、IG)': 'OA37',
      '其他': 'EB38',
      '以上均無': 'IJ38'
    },
    past_activities: {
      '工作': 'IV39',
      '擔任志工': 'KG39',
      '學習新事物': 'MK39',
      '四處旅遊': 'OY39',
      '健身運動': 'RB39',
      '參與宗教活動': 'TF39',
      '其他': 'IV40',
      '以上均無': 'OY40'
    },
    desired_activities: {
      '工作': 'HO41',
      '擔任志工': 'IY41',
      '學習新事物': 'LC41',
      '四處旅遊': 'NP41',
      '健身運動': 'PT41',
      '參與宗教活動': 'RW41',
      '其他': 'HO42',
      '以上均無': 'NP42'
    },
    home_safety_feeling: {
      '很安全': 'GU43',
      '大致安全': 'IO43',
      '有些不安全': 'KS43',
      '很不安全': 'NG43'
    },
    loneliness_2w: {
      '完全沒有': 'FO44',
      '只有幾天：1至6天': 'HT44',
      '一半以上天數：7至11天': 'JZ44',
      '幾乎每天：12至14天': 'MX44'
    },
    depressed_2w: {
      '完全沒有': 'JN45',
      '只有幾天：1至6天': 'LS45',
      '一半以上天數：7至11天': 'NY45',
      '幾乎每天：12至14天': 'QW45'
    },
    loss_interest_2w: {
      '完全沒有': 'IS46',
      '只有幾天：1至6天': 'KX46',
      '一半以上天數：7至11天': 'ND46',
      '幾乎每天：12至14天': 'QB46'
    },
    service_willingness: {
      '參加社區據點': 'HX48',
      '關懷服務': 'KT48',
      '電話問安': 'MY48',
      '送餐服務': 'PE48',
      '安裝緊急救援裝置': 'RI48',
      '轉介：長照': ['HX49', 'JM49'],
      '轉介：身障': ['HX49', 'KX49'],
      '轉介：其他服務，長者期待': ['HX49', 'MH49']
    },
    mental_status: {
      '在訪談過程中，長者有提到自殺意念': 'CG51',
      '無特殊情形': 'JG51'
    },
    self_care_flag: {
      '可以': 'CG52',
      '可以，但行動緩慢': 'DT52',
      '不可以': 'CG53'
    },
    self_care_observation: {
      '需要別人幫助才能移動': 'HI53',
      '衣物不乾淨': 'MB53',
      '身上有異味(例如尿騷味)': 'OP53',
      '使用器具(例如輪椅、拐杖)就可以自行移動': 'HI54',
      '其他': 'PJ54'
    },
    home_hygiene_issues: {
      '環境物品十分髒亂': 'FQ55',
      '衣著不符季節': 'JP55',
      '食品雜置、蚊蠅蟑螂紛飛': 'MT55',
      '通風不良': 'RU55',
      '其他': 'FQ56',
      '以上均無': 'KI56',
      '無法觀察': 'MR56'
    },
    home_safety_issues: {
      '電線裸露': 'FQ57',
      '照明設備不足(如夜起時)': 'HR57',
      '未裝設住宅用火災警報器': 'MG57',
      '多個電器同時使用一個插座': 'RC57',
      '熱水器安裝於室內，且不通風': 'FQ58',
      '爐火(例如瓦斯爐、電熱器)周圍堆放可燃物': 'LN58',
      '出入動線囤積雜物': 'FQ59',
      '其他': 'JP59',
      '以上均無': 'OK59',
      '無法觀察': 'QU59'
    }
  };

  function asList_(value) {
    if (Array.isArray(value)) return value.map(String);
    if (value === null || value === undefined || value === '') return [];
    return String(value).split(/[;；]/).map(function (item) {
      return item.trim();
    }).filter(Boolean);
  }

  function first_(value) {
    var values = asList_(value);
    return values.length ? values[0] : '';
  }

  function markCell_(sheet, address) {
    var cell = sheet.getRange(address);
    var text = String(cell.getDisplayValue() || cell.getValue() || '');
    cell.setValue(text.indexOf('□') >= 0 ? text.replace('□', '■') : '■' + text);
  }

  function markOption_(sheet, key, value) {
    var mapping = OPTION_CELLS[key];
    if (!mapping || !mapping[value]) return;
    var addresses = Array.isArray(mapping[value]) ? mapping[value] : [mapping[value]];
    addresses.forEach(function (address) { markCell_(sheet, address); });
  }

  function markFlag_(sheet, address, index) {
    var cell = sheet.getRange(address);
    var text = String(cell.getDisplayValue() || cell.getValue() || '');
    var seen = -1;
    cell.setValue(text.replace(/□/g, function (box) {
      seen += 1;
      return seen === index ? '■' : box;
    }));
  }

  function setValue_(sheet, address, value) {
    if (value === null || value === undefined || String(value).trim() === '') return;
    sheet.getRange(address).setValue(String(value));
  }

  function fillBlank_(sheet, address, value) {
    if (value === null || value === undefined || String(value).trim() === '') return;
    var cell = sheet.getRange(address);
    var text = String(cell.getDisplayValue() || cell.getValue() || '');
    var replacement = String(value);
    cell.setValue(/_+/.test(text) ? text.replace(/_+/, replacement) : text + replacement);
  }

  function replaceBlanks_(sheet, address, values) {
    var cell = sheet.getRange(address);
    var text = String(cell.getDisplayValue() || cell.getValue() || '');
    values.forEach(function (value) {
      if (value === null || value === undefined || String(value).trim() === '') return;
      text = text.replace(/_+/, String(value));
    });
    cell.setValue(text);
  }

  function rocParts_(raw) {
    var match = String(raw || '').match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (!match) return { year: '', month: '', day: '' };
    return {
      year: String(parseInt(match[1], 10) - 1911),
      month: String(parseInt(match[2], 10)),
      day: String(parseInt(match[3], 10))
    };
  }

  function timeParts_(raw) {
    var match = String(raw || '').match(/^(\d{1,2}):(\d{2})/);
    return match ? { hour: match[1], minute: match[2] } : { hour: '', minute: '' };
  }

  function safeName_(value) {
    return String(value || '未命名個案')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function filename_(answers, elderName) {
    var rawDate = String((answers && answers.visit_date) || '');
    var date = '';
    var iso = rawDate.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    var roc = rawDate.match(/^(\d{3})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso) {
      date = iso[1] + '-' + ('0' + iso[2]).slice(-2) + '-' + ('0' + iso[3]).slice(-2);
    } else if (roc) {
      date = String(parseInt(roc[1], 10) + 1911) + '-' +
        ('0' + roc[2]).slice(-2) + '-' + ('0' + roc[3]).slice(-2);
    } else {
      date = Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd');
    }
    return date + '_' + safeName_(elderName || (answers && answers.name)) + '.pdf';
  }

  function getOrCreateFolder_() {
    var props = PropertiesService.getScriptProperties();
    var folderId = props.getProperty('CAREFORM_PDF_FOLDER_ID');
    if (folderId) {
      try {
        return DriveApp.getFolderById(folderId);
      } catch (e) {
        // Folder was removed; create it again below.
      }
    }
    var parentId = props.getProperty('MOHW_EXPORT_FOLDER_ID');
    var parent = parentId ? DriveApp.getFolderById(parentId) : DriveApp.getRootFolder();
    var folders = parent.getFoldersByName('關懷表 PDF');
    var folder = folders.hasNext() ? folders.next() : parent.createFolder('關懷表 PDF');
    props.setProperty('CAREFORM_PDF_FOLDER_ID', folder.getId());
    return folder;
  }

  function writeAnswers_(sheet, data) {
    var answers = data.answers || {};
    var visit = rocParts_(answers.visit_date);
    var birth = rocParts_(answers.birth_date);
    var start = timeParts_(answers.visit_start_time);
    var end = timeParts_(answers.visit_end_time);
    var district = answers.household_district || data.district || '';

    setValue_(sheet, 'PY2', district);
    setValue_(sheet, 'RI2', visit.year || Config.FISCAL_YEAR());
    setValue_(sheet, 'SS2', visit.month);
    setValue_(sheet, 'UC2', data.case_code || data.encoded_id || '');
    setValue_(sheet, 'OU4', visit.year ? visit.year + '年' : '');
    setValue_(sheet, 'PZ4', visit.month ? visit.month + '月' : '');
    setValue_(sheet, 'RE4', visit.day ? visit.day + '日' : '');
    setValue_(sheet, 'SD4', start.hour ? start.hour + '時' : '');
    setValue_(sheet, 'TC4', start.minute ? start.minute + '分至' : '');
    setValue_(sheet, 'UL4', end.hour ? end.hour + '時' : '');
    setValue_(sheet, 'VM4', end.minute ? end.minute + '分' : '');

    markCell_(sheet, 'NL5');
    if (answers.visit_status === '拒絕訪視') markCell_(sheet, 'HZ6');
    setValue_(sheet, 'CG6', answers.name || data.elder_name);
    setValue_(sheet, 'CG7', birth.year ? birth.year + '年 ' + birth.month + '月 ' + birth.day + '日' : '');
    setValue_(sheet, 'MV7', answers.national_id);
    setValue_(sheet, 'CG8', answers.phone);
    setValue_(sheet, 'MV8', answers.mobile);

    Object.keys(OPTION_CELLS).forEach(function (key) {
      asList_(answers[key]).forEach(function (value) { markOption_(sheet, key, value); });
    });

    if (answers.line_id_status === '有') fillBlank_(sheet, 'DK9', answers.line_id);
    setValue_(
      sheet,
      'MV9',
      answers.emergency_contact_name
        ? '姓名(關係)：' + answers.emergency_contact_name + '(' +
          (answers.emergency_contact_relation || '') + ')'
        : ''
    );
    setValue_(
      sheet,
      'SE9',
      answers.emergency_contact_phone ? '電話：' + answers.emergency_contact_phone : ''
    );

    setValue_(sheet, 'CG10', answers.household_city);
    setValue_(sheet, 'DW10', answers.household_city ? answers.household_city + ' 縣/市' : '');
    setValue_(sheet, 'GW10', answers.household_district ? answers.household_district + ' 鄉/鎮/市/區' : '');
    setValue_(sheet, 'KL10', answers.household_village ? answers.household_village + ' 村/里' : '');
    setValue_(sheet, 'NI10', answers.household_address);

    setValue_(sheet, 'JN13', answers.living_city ? answers.living_city + ' 縣/市' : '');
    setValue_(sheet, 'LG13', answers.living_district ? answers.living_district + ' 鄉/鎮/市/區' : '');
    setValue_(sheet, 'OG13', answers.living_village ? answers.living_village + ' 村/里' : '');
    setValue_(sheet, 'QI13', answers.living_address);
    fillBlank_(sheet, 'FP14', answers.living_address_other);
    fillBlank_(sheet, 'RP15', answers.housing_type_other);
    replaceBlanks_(sheet, 'GU16', [answers.cohabitant_relation, answers.cohabitant_age]);
    fillBlank_(sheet, 'JK17', answers.cohabitant_no_care_capacity_note);
    fillBlank_(sheet, 'LG19', answers.marital_status_other);
    replaceBlanks_(sheet, 'DL20', [answers.sons_count, answers.daughters_count]);
    replaceBlanks_(sheet, 'CG22', [answers.height_cm, answers.weight_kg]);
    fillBlank_(sheet, 'RG24', answers.diseases_cancer_note);
    fillBlank_(sheet, 'HK25', answers.diseases_other_note);
    fillBlank_(sheet, 'MB26', answers.recent_medical_note);

    if (answers.life_difficulties_flag === '無') markFlag_(sheet, 'CG31', 0);
    if (answers.life_difficulties_flag === '有') markFlag_(sheet, 'CG31', 1);
    if (answers.worries_flag === '無') markFlag_(sheet, 'CG33', 0);
    if (answers.worries_flag === '有') markFlag_(sheet, 'CG33', 1);
    if (answers.help_sources_flag === '無') markCell_(sheet, 'CG35');
    if (answers.help_sources_flag === '有') markCell_(sheet, 'CG36');
    if (answers.service_willingness_flag === '無') markCell_(sheet, 'CG48');
    if (answers.service_willingness_flag === '有') markCell_(sheet, 'DL48');

    fillBlank_(sheet, 'PC32', answers.life_difficulties_other);
    fillBlank_(sheet, 'RW34', answers.worries_other);
    fillBlank_(sheet, 'SO35', answers.help_sources_none_other);
    fillBlank_(sheet, 'SO36', answers.help_sources_has_other);
    fillBlank_(sheet, 'EB38', answers.information_channels_other);
    fillBlank_(sheet, 'IV40', answers.past_activities_other);
    fillBlank_(sheet, 'HO42', answers.desired_activities_other);
    fillBlank_(sheet, 'MH49', answers.service_willingness_referral_other);
    fillBlank_(sheet, 'PJ54', answers.self_care_other);
    fillBlank_(sheet, 'FQ56', answers.home_hygiene_other);
    fillBlank_(sheet, 'JP59', answers.home_safety_other);

    if (typeof HighCareModule !== 'undefined') {
      var highCare = HighCareModule.evaluate(answers);
      if (highCare && highCare.triggered) {
        sheet.getRange('ES60').setValue(
          ')勾選結果，由系統後台自動計算。　結果：' + highCare.colors.join('、')
        );
      }
    }
  }

  function exportPdf_(spreadsheet, sheet, filename) {
    SpreadsheetApp.flush();
    var url =
      'https://docs.google.com/spreadsheets/d/' + spreadsheet.getId() + '/export' +
      '?format=pdf' +
      '&gid=' + sheet.getSheetId() +
      '&size=A3' +
      '&portrait=true' +
      '&scale=4' +
      '&sheetnames=false' +
      '&printtitle=false' +
      '&pagenumbers=false' +
      '&gridlines=false' +
      '&fzr=false';
    var response = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      var error = new Error('Google 試算表匯出 PDF 失敗：HTTP ' + response.getResponseCode());
      error.code = 'CAREFORM_PDF_EXPORT_FAILED';
      throw error;
    }
    return response.getBlob().setName(filename);
  }

  function generate(data) {
    Validation.requireFields(data, ['answers']);
    var templateId = Config.CAREFORM_TEMPLATE_SPREADSHEET_ID();
    var sourceFile = DriveApp.getFileById(templateId);
    var copy = sourceFile.makeCopy('TMP-關懷表-' + Utilities.getUuid().slice(0, 8));
    try {
      var spreadsheet = SpreadsheetApp.openById(copy.getId());
      var sheet = spreadsheet.getSheetByName(TEMPLATE_SHEET_NAME) || spreadsheet.getSheets()[0];
      writeAnswers_(sheet, data);

      var fileName = filename_(data.answers, data.elder_name);
      var blob = exportPdf_(spreadsheet, sheet, fileName);
      var folder = getOrCreateFolder_();
      var existing = folder.getFilesByName(fileName);
      while (existing.hasNext()) existing.next().setTrashed(true);
      var file = folder.createFile(blob);
      var bytes = blob.getBytes();

      return {
        file_id: file.getId(),
        file_url: file.getUrl(),
        file_name: fileName,
        folder_id: folder.getId(),
        folder_url: folder.getUrl(),
        page_size: 'A3',
        orientation: 'portrait',
        page_count: 1,
        pdf_base64: data.include_base64 === false ? '' : Utilities.base64Encode(bytes)
      };
    } finally {
      copy.setTrashed(true);
    }
  }

  return {
    generate: generate
  };
})();
