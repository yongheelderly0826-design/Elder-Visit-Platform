var HighCareModule = (function () {
  var SHEET = '高關懷名冊';
  var COLOR_ORDER = ['橘', '黃', '綠'];
  var RULES = [
    { id: 'orange-no-help', color: '橘', key: 'help_sources_none', match: 'includes', values: ['找不到人可以協助', '找不到人可以問'], label: '找不到人可以協助' },
    { id: 'orange-suicide', color: '橘', key: 'mental_status', match: 'includes', values: ['在訪談過程中，長者有提到自殺意念', '有提到自殺意念'], label: '訪談中提到自殺意念' },
    { id: 'orange-need-help-move', color: '橘', key: 'self_care_observation', match: 'includes', values: ['需要別人幫助才能移動', '需要別人協助才能移動'], label: '需要別人幫助才能移動' },
    { id: 'yellow-health-bad', color: '黃', key: 'health_self_rating', match: 'equals', values: ['很不好'], label: '健康自評很不好' },
    { id: 'yellow-weight-loss', color: '黃', key: 'weight_change_3m', match: 'equals', values: ['減輕3公斤以上'], label: '近三個月體重減輕3公斤以上' },
    { id: 'yellow-heart', color: '黃', key: 'diseases', match: 'includes', values: ['心臟病'], label: '疾病史含心臟病' },
    { id: 'yellow-memory', color: '黃', key: 'life_difficulties', match: 'includes', values: ['最近記憶力不好', '記憶力不好'], label: '最近記憶力不好' },
    { id: 'yellow-unsafe-home', color: '黃', key: 'home_safety_feeling', match: 'equals', values: ['很不安全'], label: '在家感到很不安全' },
    { id: 'yellow-odor', color: '黃', key: 'self_care_observation', match: 'includes', values: ['身上有異味(例如尿騷味)', '身上有異味'], label: '身上有異味' },
    { id: 'green-health-poor', color: '綠', key: 'health_self_rating', match: 'equals', values: ['不太好'], label: '健康自評不太好' },
    { id: 'green-hearing', color: '綠', key: 'hearing_issue', match: 'equals', values: ['是'], label: '重聽' },
    { id: 'green-vision', color: '綠', key: 'vision_issue', match: 'equals', values: ['是'], label: '視力不好' },
    { id: 'green-transport', color: '綠', key: 'life_difficulties', match: 'includes', values: ['外出交通不方便（例如缺乏公車或客運）', '外出交通不方便'], label: '外出交通不方便' },
    { id: 'green-fraud', color: '綠', key: 'worries', match: 'includes', values: ['被詐騙'], label: '被詐騙' },
    { id: 'green-lonely', color: '綠', key: 'loneliness_2w', match: 'includes', values: ['幾乎每天：12至14天', '幾乎每天'], label: '過去兩週幾乎每天覺得寂寞' },
    { id: 'green-loss-interest', color: '綠', key: 'loss_interest_2w', match: 'includes', values: ['幾乎每天：12至14天', '幾乎每天'], label: '過去兩週幾乎每天失去興趣' },
    { id: 'green-aid', color: '綠', key: 'self_care_observation', match: 'includes', values: ['使用器具(例如輪椅、拐杖)就可以自行移動', '使用器具可自行移動'], label: '使用輔具才可自行移動' },
  ];

  function tokens(raw) {
    if (raw == null || raw === '') return [];
    if (Object.prototype.toString.call(raw) === '[object Array]') {
      return raw.map(function (item) { return String(item).trim(); }).filter(Boolean);
    }
    return String(raw).split(/[;；、,]/).map(function (item) { return item.trim(); }).filter(Boolean);
  }

  function evaluate(answers) {
    var triggers = [];
    RULES.forEach(function (rule) {
      var list = tokens(answers[rule.key]);
      if (!list.length) return;
      var hit = null;
      if (rule.match === 'equals') {
        list.forEach(function (token) {
          if (rule.values.indexOf(token) !== -1) hit = token;
        });
      } else {
        rule.values.forEach(function (value) {
          list.forEach(function (token) {
            if (token.indexOf(value) !== -1 || value.indexOf(token) !== -1) hit = value;
          });
        });
      }
      if (hit) {
        triggers.push({ id: rule.id, color: rule.color, key: rule.key, label: rule.label, value: hit });
      }
    });
    var colors = COLOR_ORDER.filter(function (color) {
      return triggers.some(function (item) { return item.color === color; });
    });
    return {
      triggered: triggers.length > 0,
      colors: colors,
      primaryColor: colors[0] || '',
      triggers: triggers,
    };
  }

  function ensureSheet() {
    SheetHelper.ensureSheet(SHEET, [
      'high_care_id', 'case_id', 'careform_id', 'assignment_id', 'encoded_id',
      'elder_name', 'colors', 'primary_color', 'trigger_keys', 'trigger_labels', 'trigger_values',
      'opened_at', 'status', 'owner', 'note', 'last_visit_triggered', 'updated_at',
    ]);
  }

  function list(params) {
    ensureSheet();
    var rows = SheetHelper.rowsToObjects(SheetHelper.getSheet(SHEET));
    var color = params && params.color;
    var status = params && params.status;
    return rows.filter(function (row) {
      if (color && String(row.colors || '').indexOf(color) === -1) return false;
      if (status && String(row.status) !== String(status)) return false;
      return true;
    });
  }

  function stats() {
    var rows = list({});
    var summary = { total: rows.length, 橘: 0, 黃: 0, 綠: 0, 追蹤中: 0, 已轉介: 0, 已結案: 0 };
    rows.forEach(function (row) {
      COLOR_ORDER.forEach(function (color) {
        if (String(row.colors || '').indexOf(color) !== -1) summary[color] += 1;
      });
      if (summary[row.status] !== undefined) summary[row.status] += 1;
    });
    return summary;
  }

  function upsertFromSubmit(payload) {
    ensureSheet();
    var answers = payload.answers || {};
    var result = evaluate(answers);
    var encodedId = payload.encoded_id || '';
    var existing = encodedId
      ? SheetHelper.findByKey(SHEET, 'encoded_id', encodedId).filter(function (row) {
          return row.status === '追蹤中';
        })[0]
      : null;

    if (!result.triggered) {
      if (existing) {
        SheetHelper.updateByKey(SHEET, 'high_care_id', existing.high_care_id, {
          last_visit_triggered: false,
          note: (existing.note ? existing.note + '｜' : '') + '本訪未觸發',
          updated_at: new Date().toISOString(),
          careform_id: payload.careform_id || existing.careform_id,
        });
      }
      return { evaluation: result, record: existing || null };
    }

    var patch = {
      case_id: payload.case_id || (existing && existing.case_id) || '',
      careform_id: payload.careform_id || '',
      assignment_id: payload.assignment_id || '',
      encoded_id: encodedId,
      elder_name: payload.elder_name || answers.name || '',
      colors: result.colors.join(';'),
      primary_color: result.primaryColor,
      trigger_keys: result.triggers.map(function (item) { return item.key; }).join(';'),
      trigger_labels: result.triggers.map(function (item) { return item.color + ':' + item.label; }).join('；'),
      trigger_values: result.triggers.map(function (item) { return item.value; }).join('；'),
      last_visit_triggered: true,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      var updated = SheetHelper.updateByKey(SHEET, 'high_care_id', existing.high_care_id, patch);
      return { evaluation: result, record: updated };
    }

    var created = {
      high_care_id: 'HC-' + Utilities.getUuid().slice(0, 8),
      opened_at: new Date().toISOString(),
      status: '追蹤中',
      owner: '',
      note: '',
    };
    Object.keys(patch).forEach(function (key) { created[key] = patch[key]; });
    SheetHelper.appendRow(SHEET, created);
    return { evaluation: result, record: created };
  }

  function update(data) {
    ensureSheet();
    Validation.requireFields(data, ['high_care_id']);
    var patch = {
      updated_at: new Date().toISOString(),
    };
    if (data.status) patch.status = data.status;
    if (data.owner !== undefined) patch.owner = data.owner;
    if (data.note !== undefined) patch.note = data.note;
    return SheetHelper.updateByKey(SHEET, 'high_care_id', data.high_care_id, patch);
  }

  return {
    list: list,
    stats: stats,
    evaluate: evaluate,
    upsertFromSubmit: upsertFromSubmit,
    update: update,
  };
})();
