/**
 * localStorage 读写。所有访问都包 try/catch —— 隐私模式、禁用站点数据、
 * 存储配额用满都会让 localStorage 直接抛异常，界面不能因此白屏。
 */
window.LedgerStore = (function () {
  'use strict';

  var KEY = 'ledger.v1';
  var PREF_KEY = 'ledger.prefs.v1';

  function readRaw(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function writeRaw(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (err) {
      return false;
    }
  }

  /** 读出记录数组；数据损坏时返回空数组而不是抛异常。 */
  function load() {
    var raw = readRaw(KEY);
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.records)) return [];
      return parsed.records.filter(function (r) {
        return r && typeof r.id === 'string' && typeof r.amount === 'number' && r.date;
      });
    } catch (err) {
      return [];
    }
  }

  /** 保存记录数组，返回是否写入成功。 */
  function save(records) {
    return writeRaw(KEY, JSON.stringify({ version: 1, records: records, savedAt: Date.now() }));
  }

  function loadPrefs() {
    var raw = readRaw(PREF_KEY);
    if (!raw) return {};
    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function savePrefs(prefs) {
    return writeRaw(PREF_KEY, JSON.stringify(prefs));
  }

  /** 探测存储是否真的可用，用于提示用户「数据不会被保存」。 */
  function isAvailable() {
    var probe = 'ledger.probe';
    try {
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (err) {
      return false;
    }
  }

  return {
    load: load,
    save: save,
    loadPrefs: loadPrefs,
    savePrefs: savePrefs,
    isAvailable: isAvailable
  };
})();
