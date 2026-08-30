/**
 * 记账核心逻辑：纯函数，不碰 DOM、不碰 localStorage。
 * 浏览器里通过 <script> 挂到 window.Ledger，Node 里通过 require 拿到同一个对象。
 *
 * 金额一律以「分」为单位的整数保存，避免浮点误差（0.1 + 0.2 !== 0.3）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Ledger = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TYPES = ['expense', 'income'];

  var DEFAULT_CATEGORIES = {
    expense: ['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '学习', '人情', '其他'],
    income: ['工资', '奖金', '兼职', '理财', '报销', '红包', '其他']
  };

  /** 把用户输入的金额字符串转成「分」。非法输入返回 null。 */
  function parseAmount(input) {
    if (typeof input === 'number') {
      if (!isFinite(input)) return null;
      return Math.round(input * 100);
    }
    if (typeof input !== 'string') return null;
    var text = input.trim().replace(/[,，\s]/g, '');
    if (text === '' || !/^\d*(\.\d*)?$/.test(text) || text === '.') return null;
    var cents = Math.round(parseFloat(text) * 100);
    if (!isFinite(cents)) return null;
    return cents;
  }

  /** 「分」转成展示用字符串，如 123456 -> "1,234.56"。 */
  function formatAmount(cents, options) {
    var opts = options || {};
    var negative = cents < 0;
    var abs = Math.abs(Math.round(cents));
    var yuan = Math.floor(abs / 100);
    var fraction = String(abs % 100).padStart(2, '0');
    var grouped = String(yuan).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var text = grouped + '.' + fraction;
    if (opts.sign === 'always' && !negative && cents !== 0) text = '+' + text;
    return (negative ? '-' : '') + text;
  }

  /** 本地时区的 YYYY-MM-DD，不用 toISOString（那是 UTC，会差一天）。 */
  function todayString(now) {
    var d = now || new Date();
    return (
      d.getFullYear() +
      '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0')
    );
  }

  function isValidDate(text) {
    if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    var parts = text.split('-').map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    return (
      d.getFullYear() === parts[0] &&
      d.getMonth() === parts[1] - 1 &&
      d.getDate() === parts[2]
    );
  }

  function monthOf(dateString) {
    return String(dateString).slice(0, 7);
  }

  /** 校验一条待保存的记录，返回 { ok, errors: {field: message}, value }。 */
  function validate(input) {
    var errors = {};
    var raw = input || {};

    if (TYPES.indexOf(raw.type) === -1) errors.type = '请选择收入或支出';

    var cents = parseAmount(raw.amount);
    if (cents === null) errors.amount = '金额格式不对，例如 25.5';
    else if (cents <= 0) errors.amount = '金额要大于 0';
    else if (cents > 99999999999) errors.amount = '金额太大了';

    var category = String(raw.category == null ? '' : raw.category).trim();
    if (category === '') errors.category = '请填写分类';
    else if (category.length > 20) errors.category = '分类最多 20 个字';

    var date = String(raw.date == null ? '' : raw.date).trim();
    if (!isValidDate(date)) errors.date = '日期格式应为 YYYY-MM-DD';

    var note = String(raw.note == null ? '' : raw.note).trim();
    if (note.length > 200) errors.note = '备注最多 200 个字';

    var ok = Object.keys(errors).length === 0;
    return {
      ok: ok,
      errors: errors,
      value: ok
        ? { type: raw.type, amount: cents, category: category, date: date, note: note }
        : null
    };
  }

  function makeId(now, random) {
    var t = (now || Date.now()).toString(36);
    var r = Math.floor((random == null ? Math.random() : random) * 1e8).toString(36);
    return 'r' + t + r;
  }

  /** 校验并补上 id / createdAt，失败时返回 { ok:false, errors }。 */
  function createRecord(input, now) {
    var result = validate(input);
    if (!result.ok) return result;
    var stamp = now || Date.now();
    result.value.id = input.id || makeId(stamp);
    result.value.createdAt = input.createdAt || stamp;
    return result;
  }

  /** 收入、支出、结余（单位：分）。 */
  function summarize(records) {
    var income = 0;
    var expense = 0;
    (records || []).forEach(function (r) {
      if (r.type === 'income') income += r.amount;
      else if (r.type === 'expense') expense += r.amount;
    });
    return { income: income, expense: expense, balance: income - expense, count: (records || []).length };
  }

  /** 按分类汇总某个方向的记录，金额从大到小；ratio 是占比 0~1。 */
  function groupByCategory(records, type) {
    var totals = {};
    var sum = 0;
    (records || []).forEach(function (r) {
      if (type && r.type !== type) return;
      totals[r.category] = (totals[r.category] || 0) + r.amount;
      sum += r.amount;
    });
    return Object.keys(totals)
      .map(function (category) {
        return {
          category: category,
          total: totals[category],
          ratio: sum === 0 ? 0 : totals[category] / sum
        };
      })
      .sort(function (a, b) {
        return b.total - a.total || (a.category < b.category ? -1 : 1);
      });
  }

  /** 按月汇总，返回按月份升序排列的数组。 */
  function groupByMonth(records) {
    var buckets = {};
    (records || []).forEach(function (r) {
      var key = monthOf(r.date);
      if (!buckets[key]) buckets[key] = { month: key, income: 0, expense: 0 };
      if (r.type === 'income') buckets[key].income += r.amount;
      else buckets[key].expense += r.amount;
    });
    return Object.keys(buckets)
      .sort()
      .map(function (key) {
        var b = buckets[key];
        b.balance = b.income - b.expense;
        return b;
      });
  }

  /** 最近 n 个月的汇总，缺失的月份补 0，方便画趋势图。 */
  function monthlyTrend(records, months, endMonth) {
    var count = months || 6;
    var byMonth = {};
    groupByMonth(records).forEach(function (b) { byMonth[b.month] = b; });

    var end = endMonth || monthOf(todayString());
    var year = Number(end.slice(0, 4));
    var month = Number(end.slice(5, 7)) - 1;
    var out = [];
    for (var i = count - 1; i >= 0; i--) {
      var d = new Date(year, month - i, 1);
      var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      out.push(byMonth[key] || { month: key, income: 0, expense: 0, balance: 0 });
    }
    return out;
  }

  /** 按筛选条件过滤，结果按日期倒序（同日按录入时间倒序）。 */
  function filterRecords(records, filters) {
    var f = filters || {};
    var keyword = (f.keyword || '').trim().toLowerCase();
    return (records || [])
      .filter(function (r) {
        if (f.month && f.month !== 'all' && monthOf(r.date) !== f.month) return false;
        if (f.type && f.type !== 'all' && r.type !== f.type) return false;
        if (f.category && f.category !== 'all' && r.category !== f.category) return false;
        if (keyword) {
          var hay = (r.category + ' ' + (r.note || '')).toLowerCase();
          if (hay.indexOf(keyword) === -1) return false;
        }
        return true;
      })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }

  /** 记录里出现过的月份，倒序。 */
  function availableMonths(records) {
    var seen = {};
    (records || []).forEach(function (r) { seen[monthOf(r.date)] = true; });
    return Object.keys(seen).sort().reverse();
  }

  function escapeCSVField(value) {
    var text = String(value == null ? '' : value);
    if (/[",\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  var CSV_HEADER = ['日期', '类型', '分类', '金额', '备注'];

  function toCSV(records) {
    var lines = [CSV_HEADER.join(',')];
    (records || []).forEach(function (r) {
      lines.push([
        escapeCSVField(r.date),
        escapeCSVField(r.type === 'income' ? '收入' : '支出'),
        escapeCSVField(r.category),
        escapeCSVField(formatAmount(r.amount).replace(/,/g, '')),
        escapeCSVField(r.note || '')
      ].join(','));
    });
    return lines.join('\r\n');
  }

  /** 一个够用的 CSV 解析器：支持引号包裹、转义双引号、字段内换行。 */
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var source = String(text).replace(/^﻿/, '');

    for (var i = 0; i < source.length; i++) {
      var ch = source[i];
      if (inQuotes) {
        if (ch === '"') {
          if (source[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
        continue;
      }
      if (ch === '"') { inQuotes = true; continue; }
      if (ch === ',') { row.push(field); field = ''; continue; }
      if (ch === '\r') continue;
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
      field += ch;
    }
    row.push(field);
    rows.push(row);
    return rows.filter(function (r) {
      return r.length > 1 || r[0].trim() !== '';
    });
  }

  /**
   * 解析 CSV 文本为记录。返回 { records, errors }，
   * errors 里每项是 { line, message }，坏行会被跳过而不是整份失败。
   */
  function fromCSV(text, now) {
    var rows = parseCSV(text);
    var records = [];
    var errors = [];
    if (rows.length === 0) return { records: records, errors: errors };

    var start = rows[0][0] && rows[0][0].trim() === CSV_HEADER[0] ? 1 : 0;
    for (var i = start; i < rows.length; i++) {
      var cells = rows[i];
      var lineNo = i + 1;
      if (cells.length < 4) {
        errors.push({ line: lineNo, message: '列数不足，至少需要 日期,类型,分类,金额' });
        continue;
      }
      var typeText = (cells[1] || '').trim();
      var type = typeText === '收入' || typeText === 'income'
        ? 'income'
        : (typeText === '支出' || typeText === 'expense' ? 'expense' : '');
      var result = createRecord({
        type: type,
        amount: cells[3],
        category: cells[2],
        date: (cells[0] || '').trim(),
        note: cells[4] || ''
      }, now ? now + i : undefined);

      if (!result.ok) {
        var first = Object.keys(result.errors)[0];
        errors.push({ line: lineNo, message: result.errors[first] });
        continue;
      }
      records.push(result.value);
    }
    return { records: records, errors: errors };
  }

  /** 合并导入的记录，按 id 去重，返回新数组。 */
  function mergeRecords(existing, incoming) {
    var seen = {};
    var out = [];
    (existing || []).concat(incoming || []).forEach(function (r) {
      if (seen[r.id]) return;
      seen[r.id] = true;
      out.push(r);
    });
    return out;
  }

  return {
    TYPES: TYPES,
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    CSV_HEADER: CSV_HEADER,
    parseAmount: parseAmount,
    formatAmount: formatAmount,
    todayString: todayString,
    isValidDate: isValidDate,
    monthOf: monthOf,
    validate: validate,
    createRecord: createRecord,
    summarize: summarize,
    groupByCategory: groupByCategory,
    groupByMonth: groupByMonth,
    monthlyTrend: monthlyTrend,
    filterRecords: filterRecords,
    availableMonths: availableMonths,
    toCSV: toCSV,
    parseCSV: parseCSV,
    fromCSV: fromCSV,
    mergeRecords: mergeRecords
  };
});
