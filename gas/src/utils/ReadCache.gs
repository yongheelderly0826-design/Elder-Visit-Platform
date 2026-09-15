/**
 * 短時讀取快取：列表／日報／訪員任務 25 秒。
 * 寫入時 bump() 讓舊 key 全部失效。單筆上限約 90KB（CacheService 100KB）。
 */
var ReadCache = (function () {
  var TTL_SECONDS = 25;
  var GEN_TTL_SECONDS = 21600;
  var GEN_KEY = 'gas_read_gen';
  var MAX_BYTES = 90000;

  function cache_() {
    return CacheService.getScriptCache();
  }

  function gen() {
    return cache_().get(GEN_KEY) || '0';
  }

  function bump() {
    try {
      cache_().put(GEN_KEY, String(Date.now()), GEN_TTL_SECONDS);
    } catch (e) {
      // 快取寫入失敗不阻擋業務寫入
    }
  }

  function key(prefix) {
    return prefix + ':' + gen();
  }

  function getJson(cacheKey) {
    try {
      var raw = cache_().get(cacheKey);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function putJson(cacheKey, value) {
    try {
      var raw = JSON.stringify(value);
      if (!raw || raw.length > MAX_BYTES) return false;
      cache_().put(cacheKey, raw, TTL_SECONDS);
      return true;
    } catch (e) {
      return false;
    }
  }

  return {
    TTL_SECONDS: TTL_SECONDS,
    gen: gen,
    bump: bump,
    key: key,
    getJson: getJson,
    putJson: putJson,
  };
})();
