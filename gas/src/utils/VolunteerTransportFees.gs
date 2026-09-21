/**
 * 永和區志工交通費核銷規則
 * 依據：新北市永和區公所推行志願服務實施計畫（115.07.01）
 * 送餐：早／中／晚每次 100 元。時數表只發達標檔總額，不按小時乘算。
 */
var VolunteerTransportFees = (function () {
  var MEAL_FEE = 100;
  var MAX_MEAL_TRIPS_PER_DAY = 3;

  var QUARTERLY_BRACKETS = [
    { minHours: 30, maxHours: null, amount: 620 },
    { minHours: 27, maxHours: null, amount: 550 },
    { minHours: 24, maxHours: null, amount: 480 },
    { minHours: 21, maxHours: null, amount: 400 },
    { minHours: 18, maxHours: null, amount: 250 },
    { minHours: 15, maxHours: null, amount: 200 },
  ];

  var ANNUAL_BRACKETS = [
    { minHours: 108, maxHours: null, amount: 2350 },
    { minHours: 71, maxHours: 107, amount: 1850 },
    { minHours: 41, maxHours: 70, amount: 1200 },
    { minHours: 31, maxHours: 40, amount: 600 },
    { minHours: 20, maxHours: 30, amount: 310 },
    { minHours: 12, maxHours: 19, amount: 190 },
  ];

  var PLANS = [
    {
      schedule: 'per_trip',
      code: 'meal',
      title: '送餐組（早／中／晚每次 100 元）',
      names: ['meal', '送餐', '送餐組', '送餐服務組', '獨居送早(中)餐', '獨老送早(中)餐', '獨居送餐'],
      perTripAmount: MEAL_FEE,
    },
    {
      schedule: 'quarterly_hours',
      code: 'quarterly',
      title: '每季結算（累積達標時數）',
      names: [
        'patrol', 'easycard', 'road', 'park', 'shuttle', 'mediation', 'phone_care', 'elder_care', 'traffic',
        '巡迴', '巡迴組', '悠遊卡', '悠遊卡組', '道路維護', '道路維護組', '公園綠化', '公園綠化組',
        '接駁車', '接駁車組', '調解會', '調解會組', '電話問安', '電話問安組', '獨居關懷組', '交通服務組',
      ],
      brackets: QUARTERLY_BRACKETS,
    },
    {
      schedule: 'annual_hours',
      code: 'annual',
      title: '年度結算（累積達標時數）',
      names: [
        'veteran', 'culture', 'disaster', 'office', 'clerical',
        '榮服', '榮民', '榮民(眷)服務', '榮民(眷)服務組', '榮民服務組',
        '文化', '文化組', '圖書文化組',
        '防災收容', '防災收容組', '防災巡守組',
        '文書', '文書組', '行政內勤組',
      ],
      brackets: ANNUAL_BRACKETS,
    },
  ];

  function normalizeGroup_(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s()（）]/g, '');
  }

  function findPlan(group) {
    var key = normalizeGroup_(group);
    if (!key) return null;
    for (var i = 0; i < PLANS.length; i++) {
      var names = PLANS[i].names;
      for (var j = 0; j < names.length; j++) {
        if (normalizeGroup_(names[j]) === key) return PLANS[i];
      }
    }
    return null;
  }

  function matchBracket_(hours, brackets) {
    var sorted = brackets.slice().sort(function (a, b) { return b.minHours - a.minHours; });
    for (var i = 0; i < sorted.length; i++) {
      if (hours + 1e-9 >= sorted[i].minHours) return sorted[i];
    }
    return null;
  }

  function rocYearToGregorian_(year) {
    return year < 1911 ? year + 1911 : year;
  }

  function dateInPeriod(dateValue, period) {
    var date = String(dateValue || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    var raw = String(period || '').trim();
    if (!raw) return true;
    var quarter = raw.match(/^(\d{2,4})-Q([1-4])$/i);
    if (quarter) {
      var year = rocYearToGregorian_(Number(quarter[1]));
      var q = Number(quarter[2]);
      var startMonth = (q - 1) * 3 + 1;
      var endMonth = startMonth + 2;
      var start = year + '-' + ('0' + startMonth).slice(-2) + '-01';
      var end = year + '-' + ('0' + endMonth).slice(-2) + '-31';
      return date >= start && date <= end;
    }
    var yearMonth = raw.match(/^(\d{2,4})-(\d{2})$/);
    if (yearMonth) {
      var ymYear = rocYearToGregorian_(Number(yearMonth[1]));
      return date.indexOf(ymYear + '-' + yearMonth[2]) === 0;
    }
    var yearOnly = raw.match(/^(\d{2,4})$/);
    if (yearOnly) {
      return date.indexOf(String(rocYearToGregorian_(Number(yearOnly[1])))) === 0;
    }
    return date.indexOf(raw) === 0;
  }

  function detectMealSlot(row) {
    var raw = [row.meal_slot, row.notes, row.note, row.site_name, row.group_name].join(' ');
    if (/晚餐|晚上|晚膳/.test(raw)) return '晚';
    if (/中餐|午餐|中午/.test(raw)) return '中';
    if (/早餐|早上|早晨/.test(raw)) return '早';
    return '';
  }

  function countMealTrips(rows) {
    var byDay = {};
    (rows || []).forEach(function (row) {
      var day = String(row.session_date || row.checkin_at || '').slice(0, 10);
      if (!day) return;
      if (!byDay[day]) byDay[day] = { slots: {}, unmarked: 0 };
      var slot = detectMealSlot(row);
      if (slot) byDay[day].slots[slot] = true;
      else byDay[day].unmarked += 1;
    });
    var total = 0;
    Object.keys(byDay).forEach(function (day) {
      var slots = Object.keys(byDay[day].slots).length;
      total += Math.min(MAX_MEAL_TRIPS_PER_DAY, slots + byDay[day].unmarked);
    });
    return total;
  }

  function calculate(input) {
    input = input || {};
    var hours = Math.max(0, Number(input.hours) || 0);
    var tripCount = Math.max(0, Math.floor(Number(input.tripCount) || 0));
    var plan = findPlan(input.group);
    if (!plan) {
      return {
        amount: 0,
        rule_code: 'none',
        rule_label: '此組別未列交通費級距',
        schedule: 'none',
        matched_hours: hours,
        trip_count: tripCount,
      };
    }
    if (plan.schedule === 'per_trip') {
      var mealAmount = tripCount * (plan.perTripAmount || MEAL_FEE);
      return {
        amount: mealAmount,
        rule_code: plan.code,
        rule_label: plan.title + '；' + tripCount + ' 次 × ' + (plan.perTripAmount || MEAL_FEE) + ' 元',
        schedule: plan.schedule,
        matched_hours: hours,
        trip_count: tripCount,
      };
    }
    var bracket = matchBracket_(hours, plan.brackets || []);
    if (!bracket) {
      var floor = plan.brackets && plan.brackets.length ? plan.brackets[plan.brackets.length - 1].minHours : 0;
      return {
        amount: 0,
        rule_code: plan.code,
        rule_label: plan.title + '；累積 ' + hours + ' 小時未達 ' + floor + ' 小時',
        schedule: plan.schedule,
        matched_hours: hours,
        trip_count: tripCount,
      };
    }
    var rangeLabel = bracket.maxHours == null
      ? bracket.minHours + ' 小時以上'
      : bracket.minHours + '–' + bracket.maxHours + ' 小時';
    return {
      amount: bracket.amount,
      rule_code: plan.code,
      rule_label: plan.title + '；' + rangeLabel + ' → ' + bracket.amount + ' 元',
      schedule: plan.schedule,
      matched_hours: hours,
      trip_count: tripCount,
    };
  }

  return {
    findPlan: findPlan,
    dateInPeriod: dateInPeriod,
    detectMealSlot: detectMealSlot,
    countMealTrips: countMealTrips,
    calculate: calculate,
  };
})();
