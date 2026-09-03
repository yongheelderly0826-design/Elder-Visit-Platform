/**
 * 永和區 12 組志工出勤地點與組別目錄
 * 組名可依公所正式編組調整，ID 請保持穩定。
 */

var VolunteerAttendanceCatalog = (function () {
  var GROUPS = [
    { id: 'elder_care', name: '獨居關懷組', field: true },
    { id: 'meal', name: '送餐服務組', field: true },
    { id: 'road', name: '道路維護組', field: true },
    { id: 'park', name: '公園綠化組', field: true },
    { id: 'cleaning', name: '清潔美化組', field: true },
    { id: 'disaster', name: '防災巡守組', field: true },
    { id: 'traffic', name: '交通服務組', field: true },
    { id: 'community', name: '社區關懷組', field: true },
    { id: 'culture', name: '圖書文化組', field: true },
    { id: 'event', name: '活動支援組', field: true },
    { id: 'office', name: '行政內勤組', field: false },
    { id: 'other', name: '其他支援組', field: true },
  ];

  var SITES = [
    { id: 'SITE-ELDER', name: '獨居關懷組集合點', group_id: 'elder_care', kind: 'field' },
    { id: 'SITE-MEAL', name: '送餐服務組集合點', group_id: 'meal', kind: 'field' },
    { id: 'SITE-ROAD', name: '道路維護組集合點', group_id: 'road', kind: 'field' },
    { id: 'SITE-PARK', name: '公園綠化組集合點', group_id: 'park', kind: 'field' },
    { id: 'SITE-CLEAN', name: '清潔美化組集合點', group_id: 'cleaning', kind: 'field' },
    { id: 'SITE-DISASTER', name: '防災巡守組集合點', group_id: 'disaster', kind: 'field' },
    { id: 'SITE-TRAFFIC', name: '交通服務組集合點', group_id: 'traffic', kind: 'field' },
    { id: 'SITE-COMMUNITY', name: '社區關懷組集合點', group_id: 'community', kind: 'field' },
    { id: 'SITE-CULTURE', name: '圖書文化組集合點', group_id: 'culture', kind: 'field' },
    { id: 'SITE-EVENT', name: '活動支援組集合點', group_id: 'event', kind: 'field' },
    { id: 'SITE-OTHER', name: '其他支援組集合點', group_id: 'other', kind: 'field' },
    { id: 'SITE-KIOSK', name: '公所刷證櫃台', group_id: 'office', kind: 'office' },
  ];

  function listGroups() {
    return GROUPS.slice();
  }

  function getGroup(id) {
    for (var i = 0; i < GROUPS.length; i++) {
      if (GROUPS[i].id === id) return GROUPS[i];
    }
    return null;
  }

  function listSites() {
    return SITES.slice();
  }

  function getSite(id) {
    if (!id) return null;
    var key = String(id).trim().toUpperCase();
    for (var i = 0; i < SITES.length; i++) {
      if (SITES[i].id === key) return SITES[i];
    }
    return null;
  }

  return {
    listGroups: listGroups,
    getGroup: getGroup,
    listSites: listSites,
    getSite: getSite,
  };
})();
