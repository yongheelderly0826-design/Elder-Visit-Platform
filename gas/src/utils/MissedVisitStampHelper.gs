/**
 * 一紙未遇備註戳記：`M/D HH:mm訪視未遇`
 * 同訪查員不可重複同一時間戳（多重分身稽核／送出自動解衝突）。
 */
var MissedVisitStampHelper = (function () {
  var BUMP_MINUTES = 10;
  var STAMP_RE = /(\d{1,2}\/\d{1,2})\s+(\d{1,2}:\d{2})訪視未遇/g;

  function pad2_(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function normalizeTime_(time) {
    var match = String(time || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return '';
    var hour = Number(match[1]);
    var minute = Number(match[2]);
    if (!isFinite(hour) || !isFinite(minute)) return '';
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';
    return pad2_(hour) + ':' + pad2_(minute);
  }

  function stampKey_(monthDay, time) {
    var md = String(monthDay || '').trim();
    var t = normalizeTime_(time);
    if (!md || !t) return '';
    return md + ' ' + t;
  }

  function parseStamps(text) {
    var raw = String(text || '');
    if (raw.indexOf('訪視未遇') === -1) return [];
    var out = [];
    var re = new RegExp(STAMP_RE.source, 'g');
    var match;
    while ((match = re.exec(raw)) !== null) {
      var monthDay = String(match[1] || '').trim();
      var time = normalizeTime_(match[2]);
      var key = stampKey_(monthDay, time);
      if (!key) continue;
      out.push({
        monthDay: monthDay,
        time: time,
        key: key,
        raw: match[0],
      });
    }
    return out;
  }

  function toMinutes_(time) {
    var t = normalizeTime_(time);
    if (!t) return null;
    var parts = t.split(':');
    return Number(parts[0]) * 60 + Number(parts[1]);
  }

  function minutesToTime_(total) {
    if (!isFinite(total) || total < 0 || total >= 24 * 60) return '';
    var hour = Math.floor(total / 60);
    var minute = total % 60;
    return pad2_(hour) + ':' + pad2_(minute);
  }

  function addMinutes_(time, delta) {
    var base = toMinutes_(time);
    if (base == null || !isFinite(delta)) return '';
    return minutesToTime_(base + delta);
  }

  function softEndForTime_(time) {
    var min = toMinutes_(time);
    if (min == null) return '23:50';
    if (min < 12 * 60) return '11:50';
    if (min < 17 * 60) return '16:50';
    return '23:50';
  }

  function resolveUniqueTime_(monthDay, preferredTime, occupied, bumpStep) {
    var time = normalizeTime_(preferredTime);
    if (!monthDay || !time) return '';
    var step = bumpStep > 0 ? bumpStep : BUMP_MINUTES;
    var softEnd = softEndForTime_(time);
    var softEndMin = toMinutes_(softEnd);
    for (var attempt = 0; attempt < 72; attempt++) {
      var key = stampKey_(monthDay, time);
      if (key && !occupied[key]) return time;
      var next = addMinutes_(time, step);
      if (!next) return '';
      var nextMin = toMinutes_(next);
      if (nextMin == null) return '';
      if (softEndMin != null && nextMin > softEndMin && attempt === 0) {
        // still bump
      }
      time = next;
    }
    return '';
  }

  function collectKeysFromTexts_(texts) {
    var occupied = {};
    (texts || []).forEach(function (text) {
      parseStamps(text).forEach(function (stamp) {
        occupied[stamp.key] = true;
      });
    });
    return occupied;
  }

  function rewriteNoteTimes_(note, replacements) {
    replacements = replacements || {};
    return String(note || '').replace(STAMP_RE, function (full, monthDay, time) {
      var key = stampKey_(monthDay, time);
      if (!key || !replacements[key]) return full;
      var next = normalizeTime_(replacements[key]);
      if (!next) return full;
      return String(monthDay).trim() + ' ' + next + '訪視未遇';
    });
  }

  /**
   * 若 note 內戳記與 occupied 衝突，回傳改寫後備註與變更清單。
   */
  function uniquifyNote(note, occupiedKeys, bumpStep) {
    var occupied = {};
    if (Object.prototype.toString.call(occupiedKeys) === '[object Array]') {
      (occupiedKeys || []).forEach(function (k) {
        if (k) occupied[String(k)] = true;
      });
    } else {
      Object.keys(occupiedKeys || {}).forEach(function (k) {
        if (k) occupied[k] = true;
      });
    }

    var stamps = parseStamps(note);
    if (!stamps.length) {
      return { note: String(note || ''), changed: false, replacements: {}, stamps: [] };
    }

    var replacements = {};
    var changed = false;
    stamps.forEach(function (stamp) {
      var nextTime = resolveUniqueTime_(stamp.monthDay, stamp.time, occupied, bumpStep || BUMP_MINUTES);
      if (!nextTime) nextTime = stamp.time;
      if (nextTime !== stamp.time) {
        replacements[stamp.key] = nextTime;
        changed = true;
      }
      var nextKey = stampKey_(stamp.monthDay, nextTime);
      if (nextKey) occupied[nextKey] = true;
    });

    var nextNote = changed ? rewriteNoteTimes_(note, replacements) : String(note || '');
    return {
      note: nextNote,
      changed: changed,
      replacements: replacements,
      stamps: parseStamps(nextNote),
    };
  }

  function parseAnswersJson_(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(String(raw));
    } catch (e) {
      return {};
    }
  }

  function noteTextsFromCareform_(careform) {
    var answers = parseAnswersJson_(careform && careform.answers_json);
    return [
      answers.living_address_other,
      answers.visit_notes,
      careform && careform.notes,
    ];
  }

  function teamVisitorIdsFromAssignment_(assignment) {
    var ids = [];
    if (!assignment) return ids;
    var primary = String(assignment.visitor_id || '').trim();
    if (primary) ids.push(primary);
    var notes = String(assignment.notes || '');
    var primaryMatch = notes.match(/主填:([^｜|]+)/);
    if (primaryMatch) {
      var pid = String(primaryMatch[1].split(':')[0] || '').trim();
      if (pid) ids.push(pid);
    }
    var companionMatch = notes.match(/同行:([^｜|]+)/);
    if (companionMatch) {
      companionMatch[1].split(',').forEach(function (part) {
        var id = String(part.split(':')[0] || '').trim();
        if (id) ids.push(id);
      });
    }
    var uniq = {};
    var out = [];
    ids.forEach(function (id) {
      if (!uniq[id]) {
        uniq[id] = true;
        out.push(id);
      }
    });
    return out;
  }

  function intersects_(a, b) {
    var set = {};
    (b || []).forEach(function (id) {
      set[String(id)] = true;
    });
    for (var i = 0; i < (a || []).length; i++) {
      if (set[String(a[i])]) return true;
    }
    return false;
  }

  return {
    BUMP_MINUTES: BUMP_MINUTES,
    parseStamps: parseStamps,
    stampKey: stampKey_,
    normalizeTime: normalizeTime_,
    uniquifyNote: uniquifyNote,
    rewriteNoteTimes: rewriteNoteTimes_,
    parseAnswersJson: parseAnswersJson_,
    noteTextsFromCareform: noteTextsFromCareform_,
    teamVisitorIdsFromAssignment: teamVisitorIdsFromAssignment_,
    intersects: intersects_,
    collectKeysFromTexts: collectKeysFromTexts_,
  };
})();
