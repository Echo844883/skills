/**
 * localStorage 读写。所有访问都包 try/catch —— 隐私模式、禁用站点数据、
 * 存储配额用满都会让 localStorage 直接抛异常，界面不能因此白屏。
 */
window.LedgerStore = (function () {
  'use strict';

  var RECORDS_KEY = 'biz-ledger.records.v1';
  var SETTINGS_KEY = 'biz-ledger.settings.v1';
  var PREF_KEY = 'biz-ledger.prefs.v1';

  function readRaw(key) {
    try { return window.localStorage.getItem(key); } catch (err) { return null; }
  }

  function writeRaw(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch (err) { return false; }
  }

  function loadRecords() {
    var raw = readRaw(RECORDS_KEY);
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.records)) return [];
      return parsed.records.filter(function (r) {
        return r && typeof r.id === 'string' && typeof r.grossAmount === 'number' && r.date;
      });
    } catch (err) { return []; }
  }

  function saveRecords(records) {
    return writeRaw(RECORDS_KEY, JSON.stringify({ version: 1, records: records, savedAt: Date.now() }));
  }

  function loadSettings() {
    var raw = readRaw(SETTINGS_KEY);
    if (!raw) return window.Ledger.normalizeSettings(null);
    try {
      return window.Ledger.normalizeSettings(JSON.parse(raw));
    } catch (err) {
      return window.Ledger.normalizeSettings(null);
    }
  }

  function saveSettings(settings) {
    return writeRaw(SETTINGS_KEY, JSON.stringify(settings));
  }

  function loadPrefs() {
    var raw = readRaw(PREF_KEY);
    if (!raw) return {};
    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) { return {}; }
  }

  function savePrefs(prefs) { return writeRaw(PREF_KEY, JSON.stringify(prefs)); }

  function isAvailable() {
    var probe = 'biz-ledger.probe';
    try {
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (err) { return false; }
  }

  /** 本地版：用 blob 触发浏览器下载。BOM 让 Excel 认得 UTF-8。 */
  function download(filename, text, done) {
    var blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (done) done();
  }

  return {
    loadRecords: loadRecords,
    saveRecords: saveRecords,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    loadPrefs: loadPrefs,
    savePrefs: savePrefs,
    isAvailable: isAvailable,
    download: download
  };
})();
