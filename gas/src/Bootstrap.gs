/**
 * 一鍵建置：建立試算表 + 初始化 Tab + 設定 Script Properties
 * 在 Apps Script 編輯器直接執行此函式（不需 clasp）
 */
function bootstrapPlatform() {
  var props = PropertiesService.getScriptProperties();
  var existingId = props.getProperty('SPREADSHEET_ID');
  var ss;

  if (existingId) {
    ss = SpreadsheetApp.openById(existingId);
    Logger.log('Using existing spreadsheet: ' + ss.getUrl());
  } else {
    ss = SpreadsheetApp.create('永和區_115年_獨居長者訪查_主檔');
    props.setProperty('SPREADSHEET_ID', ss.getId());
    Logger.log('Created spreadsheet: ' + ss.getUrl());
  }

  // 暫時綁定以便 initAllSheets 讀取
  props.setProperty('SPREADSHEET_ID', ss.getId());
  SheetHelper.initAllSheets();

  // 寫入 _設定 預設值
  seedSettings_(ss.getId());

  // 產生 API Token（若尚未設定）
  if (!props.getProperty('API_TOKEN')) {
    props.setProperty('API_TOKEN', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  }
  props.setProperty('WORKSPACE_ID', props.getProperty('WORKSPACE_ID') || 'WS-YH-115');
  props.setProperty('ENCODE_PREFIX', props.getProperty('ENCODE_PREFIX') || 'YH-115');
  props.setProperty('DISTRICT', props.getProperty('DISTRICT') || '永和區');
  props.setProperty('FISCAL_YEAR', props.getProperty('FISCAL_YEAR') || '115');

  var result = {
    spreadsheet_url: ss.getUrl(),
    spreadsheet_id: ss.getId(),
    workspace_id: props.getProperty('WORKSPACE_ID'),
    api_token: props.getProperty('API_TOKEN'),
    encode_prefix: props.getProperty('ENCODE_PREFIX'),
    next_steps: [
      '1. 部署 → 新增部署 → Web App（執行身分：我，存取：任何人）',
      '2. 複製 Web App URL 到 .env.local 的 GAS_WEB_APP_URL',
      '3. 複製 api_token 到 .env.local 的 GAS_API_TOKEN',
    ],
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function seedSettings_(spreadsheetId) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName('_設定');
  if (!sheet) return;

  var defaults = [
    ['workspace_id', 'WS-YH-115', '工作區ID'],
    ['district', '永和區', '行政區'],
    ['fiscal_year', '115', '年度'],
    ['encode_prefix', 'YH-115', '去識別化前綴'],
    ['mohw_account', '', '衛福部平台帳號'],
    ['gas_version', '1.0.0', 'GAS版本'],
  ];

  if (sheet.getLastRow() <= 1) {
    defaults.forEach(function (row) {
      sheet.appendRow(row);
    });
  }
}

/**
 * 初始化試算表結構（clasp run initSpreadsheet）
 */
function initSpreadsheet() {
  SheetHelper.initAllSheets();
  Logger.log('Spreadsheet initialized.');
}

/**
 * 顯示目前設定（供除錯）
 */
function showConfig() {
  var props = PropertiesService.getScriptProperties().getProperties();
  Logger.log(JSON.stringify(props, null, 2));
  return props;
}
