/**
 * 永和區 12 組志工出勤地點與組別目錄
 * 內建集合點 + 試算表「出勤集合點」自訂列。
 */

var VolunteerAttendanceCatalog = (function () {
  var CUSTOM_HEADERS = ['site_id', 'name', 'group_id', 'kind', 'note', 'status', 'created_at', 'created_by'];

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
    { id: 'SITE-VISIT', name: '到宅訪查', group_id: 'elder_care', kind: 'visit' },
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

  function ensureCustomSheet_() {
    return SheetHelper.ensureSheet(Config.SHEET_NAMES.ATTENDANCE_SITES, CUSTOM_HEADERS);
  }

  function listCustomSites_() {
    try {
      ensureCustomSheet_();
      var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(Config.SHEET_NAMES.ATTENDANCE_SITES));
      return rows
        .filter(function (row) {
          return String(row.status || 'active') !== 'disabled' && row.site_id;
        })
        .map(function (row) {
          return {
            id: String(row.site_id).trim().toUpperCase(),
            name: String(row.name || ''),
            group_id: String(row.group_id || 'other'),
            kind: String(row.kind || 'field'),
            note: String(row.note || ''),
            custom: true,
            created_at: row.created_at || '',
          };
        });
    } catch (e) {
      return [];
    }
  }

  function listBuiltinSites_() {
    return SITES.map(function (site) {
      return {
        id: site.id,
        name: site.name,
        group_id: site.group_id,
        kind: site.kind,
        note: '',
        custom: false,
      };
    });
  }

  function listSites() {
    var builtin = listBuiltinSites_();
    var custom = listCustomSites_();
    var seen = {};
    var merged = [];
    builtin.concat(custom).forEach(function (site) {
      if (seen[site.id]) return;
      seen[site.id] = true;
      merged.push(site);
    });
    return merged;
  }

  function getSite(id) {
    if (!id) return null;
    var key = String(id).trim().toUpperCase();
    var sites = listSites();
    for (var i = 0; i < sites.length; i++) {
      if (sites[i].id === key) return sites[i];
    }
    return null;
  }

  function slugifySiteId_(name) {
    var raw = String(name || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    var ascii = raw.replace(/[^A-Z0-9-]/g, '');
    if (ascii && ascii.length >= 2) {
      return ('SITE-' + ascii).slice(0, 28);
    }
    return 'SITE-C' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  }

  function normalizeSiteId_(value, fallbackName) {
    var raw = String(value || '').trim().toUpperCase();
    if (!raw) return slugifySiteId_(fallbackName);
    if (raw.indexOf('SITE-') !== 0) raw = 'SITE-' + raw;
    raw = raw.replace(/[^A-Z0-9-]/g, '');
    if (!/^SITE-[A-Z0-9-]{2,}$/.test(raw)) {
      var err = new Error('集合點代碼格式錯誤，請使用 SITE- 開頭英文數字');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    return raw.slice(0, 32);
  }

  function createSite(data) {
    data = data || {};
    var name = String(data.name || '').trim();
    if (!name) {
      var missing = new Error('請輸入集合點名稱');
      missing.code = 'VALIDATION_ERROR';
      throw missing;
    }

    var groupId = String(data.group_id || data.groupId || 'other').trim();
    var group = getGroup(groupId);
    if (!group) {
      var badGroup = new Error('請選擇有效組別');
      badGroup.code = 'VALIDATION_ERROR';
      throw badGroup;
    }

    var kind = String(data.kind || (group.field ? 'field' : 'office')).trim();
    if (kind !== 'office' && kind !== 'field') kind = group.field ? 'field' : 'office';

    var siteId = normalizeSiteId_(data.site_id || data.siteId || '', name);
    if (getSite(siteId)) {
      var dup = new Error('集合點代碼已存在：' + siteId);
      dup.code = 'CONFLICT';
      throw dup;
    }

    ensureCustomSheet_();
    var record = {
      site_id: siteId,
      name: name,
      group_id: groupId,
      kind: kind,
      note: String(data.note || '').trim(),
      status: 'active',
      created_at: new Date().toISOString(),
      created_by: String(data.created_by || data.createdBy || ''),
    };
    SheetHelper.appendRow(Config.SHEET_NAMES.ATTENDANCE_SITES, record);
    return {
      id: record.site_id,
      name: record.name,
      group_id: record.group_id,
      kind: record.kind,
      note: record.note,
      custom: true,
      created_at: record.created_at,
    };
  }

  return {
    listGroups: listGroups,
    getGroup: getGroup,
    listSites: listSites,
    getSite: getSite,
    createSite: createSite,
  };
})();
