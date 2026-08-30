/**
 * 托管版存储层：数据（记账记录 + 税务参数）存回 artifact 自己的新版本，
 * 因此手机和电脑打开同一个链接看到的是同一份账。接口与 storage.js 完全
 * 一致（loadRecords/saveRecords/loadSettings/saveSettings/...），app.js
 * 不需要知道两版的差别。
 *
 * 三件事值得先说清楚：
 *
 * 1. publish 是「最后一个动作」——发布成功后所有打开的视图（包括当前这个）
 *    都会重新加载。所以发布前必须把用户正在填的表单存进 sessionStorage，
 *    重载后再放回去，否则手一快就会丢掉正在录入的那一笔。
 *
 * 2. 发布的文档必须自己重新拼出来，不能序列化当前 DOM（已经被渲染改过）。
 *    页面因此把自己的源码放在三个只读的孤岛里：#app-css、#app-shell、
 *    #app-js，渲染只动 #app，这几个孤岛从头到尾没人碰，可以安全读回来
 *    重新拼装。
 *
 * 3. localStorage 仍然写一份镜像。它不是数据源，是发布失败时的安全网：
 *    下次启动时把镜像里存在、但已发布版本里没有的记录并回去，免得丢账。
 */
window.LedgerStore = (function () {
  'use strict';

  var MIRROR_KEY = 'biz-ledger.mirror.v1';
  var PREF_KEY = 'biz-ledger.prefs.v1';
  var DRAFT_KEY = 'biz-ledger.draft.v1';
  var PUBLISH_DELAY = 900;

  var state = {
    records: [],
    settings: window.Ledger.normalizeSettings(null),
    api: null,
    downloads: null,
    mode: 'connecting',
    timer: null,
    publishing: false,
    awaitingReload: false,
    retried: false,
    rescuedCount: 0
  };

  // ---------- 安全的 localStorage ----------

  function readRaw(key) { try { return window.localStorage.getItem(key); } catch (err) { return null; } }
  function writeRaw(key, value) { try { window.localStorage.setItem(key, value); return true; } catch (err) { return false; } }

  function readJSON(key, fallback) {
    var raw = readRaw(key);
    if (!raw) return fallback;
    try {
      var parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (err) { return fallback; }
  }

  // ---------- 状态徽章 ----------

  var badge = null;

  function ensureBadge() {
    if (badge) return badge;
    var host = document.querySelector('.topbar-actions');
    if (!host) return null;
    badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'sync-badge';
    badge.addEventListener('click', function () {
      if (state.mode === 'synced' && !state.publishing) schedulePublish(0);
    });
    host.insertBefore(badge, host.firstChild);
    return badge;
  }

  var LABELS = {
    connecting: ['连接中…', 'is-idle'],
    synced: ['已同步', 'is-ok'],
    saving: ['保存中…', 'is-busy'],
    local: ['仅存本机', 'is-warn'],
    readonly: ['只读', 'is-warn'],
    error: ['未保存，点击重试', 'is-error']
  };

  function setStatus(key, title) {
    var node = ensureBadge();
    if (!node) return;
    var label = LABELS[key] || LABELS.connecting;
    node.textContent = label[0];
    node.className = 'sync-badge ' + label[1];
    node.title = title || '';
    node.disabled = key !== 'error';
  }

  // ---------- 把页面自己拼回去 ----------

  function jsonForScript(value) {
    // 用户备注/往来单位里可能写出脚本结束标签或注释开头，转义掉才不会截断内联脚本
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  function sourceOf(id) {
    var node = document.getElementById(id);
    return node ? node.textContent : '';
  }

  function renderDocument(records, settings) {
    var shell = document.getElementById('app-shell');
    var close = '<\/script>';
    return [
      '<!doctype html>',
      '<html lang="zh-CN">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>记账报税助手<\/title>',
      '<style id="app-css">' + sourceOf('app-css') + '<\/style>',
      '</head>',
      '<body>',
      '<template id="app-shell">' + (shell ? shell.innerHTML : '') + '<\/template>',
      '<div id="app"></div>',
      '<script type="application/json" id="app-data">' +
        jsonForScript({ version: 1, records: records, settings: settings, savedAt: Date.now() }) + close,
      // pdf.js 的两个孤岛原样搬过去，从头到尾没人碰它们，跟 app-css/app-shell/
      // app-js 一样安全地读回来重新拼装——漏搬这两个的话，下一次发布出去的
      // 版本就会丢了导入发票功能。
      '<script type="text/plain" id="pdf-lib-src-data">' + sourceOf('pdf-lib-src-data') + close,
      '<script type="text/plain" id="pdf-worker-src-data">' + sourceOf('pdf-worker-src-data') + close,
      '<script id="app-js">' + sourceOf('app-js') + close,
      '</body>',
      '</html>'
    ].join('\n');
  }

  // ---------- 正在填的内容：发布前存好，重载后放回 ----------

  function stashDraft() {
    try {
      var directionInput = document.querySelector('input[name="direction"]:checked');
      var invoiceChip = document.querySelector('#invoice-chips .chip[aria-pressed="true"]');
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        direction: directionInput ? directionInput.value : 'expense',
        grossAmount: (document.getElementById('grossAmount') || {}).value || '',
        taxRate: (document.getElementById('taxRate') || {}).value || '',
        invoiceType: invoiceChip ? invoiceChip.dataset.invoiceType : 'none',
        category: (document.getElementById('category') || {}).value || '',
        counterparty: (document.getElementById('counterparty') || {}).value || '',
        invoiceNo: (document.getElementById('invoiceNo') || {}).value || '',
        note: (document.getElementById('note') || {}).value || '',
        date: (document.getElementById('date') || {}).value || '',
        editingId: (document.getElementById('record-id') || {}).value || '',
        keyword: (document.getElementById('filter-keyword') || {}).value || '',
        scrollY: window.scrollY
      }));
    } catch (err) { /* sessionStorage 不可用就算了，不能因此挡住保存 */ }
  }

  function restoreDraft() {
    var draft;
    try {
      var raw = window.sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      window.sessionStorage.removeItem(DRAFT_KEY);
      draft = JSON.parse(raw);
    } catch (err) { return; }
    if (!draft) return;

    var setValue = function (id, value) {
      var node = document.getElementById(id);
      if (node && value) node.value = value;
    };
    var directionInput = document.querySelector('input[name="direction"][value="' + draft.direction + '"]');
    if (directionInput) {
      directionInput.checked = true;
      directionInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setValue('grossAmount', draft.grossAmount);
    setValue('taxRate', draft.taxRate);
    setValue('category', draft.category);
    setValue('counterparty', draft.counterparty);
    setValue('invoiceNo', draft.invoiceNo);
    setValue('note', draft.note);
    setValue('date', draft.date);

    if (draft.invoiceType) {
      var chip = document.querySelector('#invoice-chips .chip[data-invoice-type="' + draft.invoiceType + '"]');
      if (chip) chip.click();
    }
    // 手动触发一次预览刷新（grossAmount/taxRate 的 input 事件监听器会做这件事）
    var grossInput = document.getElementById('grossAmount');
    if (grossInput) grossInput.dispatchEvent(new Event('input', { bubbles: true }));

    if (draft.keyword) {
      setValue('filter-keyword', draft.keyword);
      document.getElementById('filter-keyword').dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (draft.scrollY) window.scrollTo(0, draft.scrollY);
  }

  // ---------- 发布 ----------

  function schedulePublish(delay) {
    if (!state.api || state.awaitingReload) return;
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(publishNow, delay == null ? PUBLISH_DELAY : delay);
  }

  function publishNow() {
    if (!state.api || state.publishing || state.awaitingReload) return;
    state.publishing = true;
    setStatus('saving');
    stashDraft();

    state.api.publish(renderDocument(state.records, state.settings)).then(function () {
      state.awaitingReload = true;
      state.publishing = false;
      setStatus('synced');
      window.setTimeout(function () {
        if (state.awaitingReload) window.location.reload();
      }, 3000);
    }).catch(function (err) {
      state.publishing = false;
      var code = err && err.code;

      if (code === 'conflict') {
        state.awaitingReload = true;
        setStatus('saving', '另一台设备刚保存过，正在取回最新的账');
        return;
      }
      if (code === 'not_writer' || code === 'not_granted' || code === 'not_declared') {
        state.api = null;
        state.mode = 'readonly';
        setStatus('readonly', '这个链接对你是只读的，改动只留在本机');
        return;
      }
      if (code === 'rate_limited' && !state.retried) {
        state.retried = true;
        setStatus('saving', '保存太频繁，稍后自动重试');
        schedulePublish(4000);
        return;
      }
      setStatus('error', '保存到云端失败，数据还在本机。点一下重试');
    });
  }

  // ---------- 对外接口（与 storage.js 一致） ----------

  function readPublished() {
    var node = document.getElementById('app-data');
    if (!node) return { records: [], settings: null };
    try {
      var parsed = JSON.parse(node.textContent || '{}');
      return {
        records: Array.isArray(parsed.records) ? parsed.records : [],
        settings: parsed.settings || null
      };
    } catch (err) { return { records: [], settings: null }; }
  }

  var publishedCache = null;
  function published() {
    if (!publishedCache) publishedCache = readPublished();
    return publishedCache;
  }

  function loadRecords() {
    var list = published().records.filter(function (r) {
      return r && typeof r.id === 'string' && typeof r.grossAmount === 'number' && r.date;
    });

    var mirror = readJSON(MIRROR_KEY, null);
    var rescued = [];
    if (mirror && Array.isArray(mirror.records)) {
      var known = {};
      list.forEach(function (r) { known[r.id] = true; });
      rescued = mirror.records.filter(function (r) { return r && typeof r.id === 'string' && !known[r.id]; });
    }

    state.records = rescued.length ? window.Ledger.mergeRecords(list, rescued) : list;
    if (rescued.length) state.rescuedCount = rescued.length;
    return state.records;
  }

  function loadSettings() {
    state.settings = window.Ledger.normalizeSettings(published().settings);
    return state.settings;
  }

  function saveRecords(records) {
    state.records = records;
    writeRaw(MIRROR_KEY, JSON.stringify({ version: 1, records: records, savedAt: Date.now() }));
    if (state.api) schedulePublish();
    return true;
  }

  function saveSettings(settings) {
    state.settings = settings;
    if (state.api) schedulePublish();
    return true;
  }

  function loadPrefs() { return readJSON(PREF_KEY, {}); }
  function savePrefs(prefs) { return writeRaw(PREF_KEY, JSON.stringify(prefs)); }
  function isAvailable() { return true; }

  /** 导出：查看器里页面自己发起的下载会被沙箱拦掉，走 downloads 能力。 */
  function download(filename, text, done) {
    var content = '﻿' + text;
    if (!state.downloads) {
      showCopyPanel(filename, text);
      if (done) done('这个环境不能直接下载，已把 CSV 放出来供复制');
      return;
    }
    state.downloads.save({ filename: filename, data: content }).then(function () {
      if (done) done();
    }).catch(function (err) {
      var code = err && err.code;
      if (code === 'declined') { if (done) done('已取消导出'); return; }
      showCopyPanel(filename, text);
      if (done) done('下载没成功，已把 CSV 放出来供复制');
    });
  }

  function showCopyPanel(filename, text) {
    var old = document.getElementById('copy-panel');
    if (old) old.remove();

    var panel = document.createElement('div');
    panel.className = 'copy-panel';
    panel.id = 'copy-panel';

    var head = document.createElement('div');
    head.className = 'copy-panel-head';
    var title = document.createElement('strong');
    title.textContent = filename;
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'icon-btn';
    close.textContent = '关闭';
    close.addEventListener('click', function () { panel.remove(); });
    head.appendChild(title);
    head.appendChild(close);

    var area = document.createElement('textarea');
    area.readOnly = true;
    area.value = text;
    area.setAttribute('aria-label', 'CSV 内容，可全选复制');

    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn btn-primary';
    copy.textContent = '复制全部';
    copy.addEventListener('click', function () {
      area.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      copy.textContent = ok ? '已复制' : '请手动按 Ctrl/⌘+C';
    });

    panel.appendChild(head);
    panel.appendChild(area);
    panel.appendChild(copy);
    document.body.appendChild(panel);
    area.focus();
    area.select();
  }

  // ---------- 启动时接上能力 ----------

  function connect() {
    var claude = window.claude;
    if (!claude || typeof claude.use !== 'function') {
      state.mode = 'local';
      setStatus('local', '当前环境不提供云端保存，数据只留在这台设备');
      return;
    }
    setStatus('connecting');

    claude.use('artifact').then(function (api) {
      if (!api) {
        state.mode = 'local';
        setStatus('local', '这个视图不能写入，数据只留在这台设备');
        return;
      }
      state.api = api;
      state.mode = 'synced';
      setStatus('synced', '手机和电脑打开同一个链接，看到的是同一份账');
      if (state.rescuedCount) schedulePublish(0);
    }).catch(function () {
      state.mode = 'local';
      setStatus('local', '连接云端失败，数据只留在这台设备');
    });

    claude.use('downloads').then(function (api) { state.downloads = api || null; }).catch(function () { state.downloads = null; });
  }

  window.LedgerHosted = { restoreDraft: restoreDraft, connect: connect, renderDocument: renderDocument };

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
