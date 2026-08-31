/**
 * 一鍵建置：建立試算表 + 初始化 Tab + 設定 Script Properties
 * 在 Apps Script 編輯器直接執行此函式（不需 clasp）
 */
function bootstrapPlatform() {
  return bootstrapForClient_({});
}

/**
 * 客戶一鍵安裝：依 installer/client.config.json 參數建置
 * 用法：clasp run bootstrapForClient --params '["{...json...}"]'
 */
function bootstrapForClient(configJson) {
  var cfg = {};
  if (configJson) {
    try {
      cfg = typeof configJson === 'string' ? JSON.parse(configJson) : configJson;
    } catch (e) {
      throw new Error('bootstrapForClient: invalid JSON — ' + e.message);
    }
  }
  return bootstrapForClient_(cfg);
}

function bootstrapForClient_(cfg) {
  var props = PropertiesService.getScriptProperties();
  var district = cfg.district || '永和區';
  var fiscalYear = String(cfg.fiscalYear || '115');
  var workspaceId = cfg.workspaceId || ('WS-' + (cfg.clientCode || 'YH') + '-' + fiscalYear);
  var encodePrefix = cfg.encodePrefix || ((cfg.clientCode || 'YH') + '-' + fiscalYear);
  var spreadsheetName =
    cfg.spreadsheetName ||
    district + '_' + fiscalYear + '年_獨居長者訪查_主檔';

  var existingId = props.getProperty('SPREADSHEET_ID') || cfg.spreadsheetId || '';
  var ss;

  if (existingId) {
    ss = SpreadsheetApp.openById(existingId);
    Logger.log('Using existing spreadsheet: ' + ss.getUrl());
  } else {
    ss = SpreadsheetApp.create(spreadsheetName);
    props.setProperty('SPREADSHEET_ID', ss.getId());
    Logger.log('Created spreadsheet: ' + ss.getUrl());
  }

  props.setProperty('SPREADSHEET_ID', ss.getId());
  props.setProperty('WORKSPACE_ID', workspaceId);
  props.setProperty('ENCODE_PREFIX', encodePrefix);
  props.setProperty('DISTRICT', district);
  props.setProperty('FISCAL_YEAR', fiscalYear);
  props.setProperty('CLIENT_NAME', cfg.clientName || district);

  SheetHelper.initAllSheets();
  seedSettingsForClient_(ss.getId(), {
    workspaceId: workspaceId,
    district: district,
    fiscalYear: fiscalYear,
    encodePrefix: encodePrefix,
    clientName: cfg.clientName || district,
  });

  if (!props.getProperty('API_TOKEN')) {
    props.setProperty(
      'API_TOKEN',
      Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''),
    );
  }

  var result = {
    client_name: cfg.clientName || district,
    spreadsheet_url: ss.getUrl(),
    spreadsheet_id: ss.getId(),
    workspace_id: props.getProperty('WORKSPACE_ID'),
    api_token: props.getProperty('API_TOKEN'),
    encode_prefix: props.getProperty('ENCODE_PREFIX'),
    district: district,
    fiscal_year: fiscalYear,
    next_steps: [
      '1. 部署 → 新增部署 → Web App（執行身分：我，存取：任何人）',
      '2. 複製 Web App URL 到 .env.local 的 GAS_WEB_APP_URL',
      '3. 複製 api_token 到 .env.local 的 GAS_API_TOKEN',
      '4. 執行 npm run install:client -- --resume 完成 Vercel 部署',
    ],
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function seedSettingsForClient_(spreadsheetId, cfg) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName('_設定');
  if (!sheet) return;

  var defaults = [
    ['workspace_id', cfg.workspaceId, '工作區ID'],
    ['district', cfg.district, '行政區'],
    ['fiscal_year', cfg.fiscalYear, '年度'],
    ['encode_prefix', cfg.encodePrefix, '去識別化前綴'],
    ['client_name', cfg.clientName, '客戶名稱'],
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
