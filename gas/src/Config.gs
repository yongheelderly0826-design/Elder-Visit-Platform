/**
 * 環境常數與 Script Properties
 */

var Config = (function () {
  var props = PropertiesService.getScriptProperties();

  function local(key) {
    return (typeof LocalConfig !== 'undefined' && LocalConfig[key]) || '';
  }

  function get(key, fallback) {
    return props.getProperty(key) || local(key) || fallback || '';
  }

  return {
    SPREADSHEET_ID: function () {
      return get('SPREADSHEET_ID');
    },
    WORKSPACE_ID: function () {
      return get('WORKSPACE_ID', 'WS-YH-115');
    },
    API_TOKEN: function () {
      return get('API_TOKEN');
    },
    ENCODE_PREFIX: function () {
      return get('ENCODE_PREFIX', 'YH-115');
    },
    DISTRICT: function () {
      return get('DISTRICT', '永和區');
    },
    FISCAL_YEAR: function () {
      return get('FISCAL_YEAR', '115');
    },

    SHEET_NAMES: {
      SETTINGS: '_設定',
      VISITORS: '訪查員主檔',
      CASES: '個案名冊',
      ASSIGNMENTS: '派案紀錄',
      ATTENDANCE: '簽到退紀錄',
      CAREFORMS: '關懷表登打',
      MISSED: '空訪紀錄',
      AUDIT: '稽核佇列',
      PAYMENTS: '車馬費核銷',
      EXPORTS: '匯出紀錄',
      REPORTS: '報表快照',
      LOG: '_操作日誌',
    },
  };
})();
