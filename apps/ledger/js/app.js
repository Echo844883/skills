/**
 * 界面层：读写 state、渲染 DOM、绑事件。
 * 所有计算都走 Ledger（core.js），这里不重复实现业务逻辑。
 * 所有用户内容一律用 textContent 写入，不拼 innerHTML。
 */
(function () {
  'use strict';

  var L = window.Ledger;
  var Store = window.LedgerStore;

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    records: Store.load(),
    editingId: null,
    filters: { month: 'all', type: 'all', category: 'all', keyword: '' },
    lastDeleted: null
  };

  var el = {
    form: $('record-form'),
    id: $('record-id'),
    amount: $('amount'),
    date: $('date'),
    category: $('category'),
    note: $('note'),
    submitBtn: $('submit-btn'),
    cancelEdit: $('cancel-edit'),
    chips: $('category-chips'),
    datalist: $('category-options'),
    list: $('record-list'),
    empty: $('empty-state'),
    count: $('record-count'),
    breakdown: $('breakdown'),
    trend: $('trend'),
    toast: $('toast'),
    fileInput: $('file-input'),
    filterMonth: $('filter-month'),
    filterType: $('filter-type'),
    filterCategory: $('filter-category'),
    filterKeyword: $('filter-keyword')
  };

  var FIELDS = ['amount', 'date', 'category', 'note'];

  // ---------- 工具 ----------

  function money(cents, opts) {
    return '¥' + L.formatAmount(cents, opts);
  }

  function currentType() {
    var checked = el.form.querySelector('input[name="type"]:checked');
    return checked ? checked.value : 'expense';
  }

  function persist() {
    if (!Store.save(state.records)) {
      toast('保存失败：浏览器存储空间可能已满');
    }
  }

  var toastTimer = null;
  function toast(message, action) {
    window.clearTimeout(toastTimer);
    el.toast.textContent = '';
    el.toast.appendChild(document.createTextNode(message));

    if (action) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-btn';
      btn.style.marginLeft = '10px';
      btn.style.color = 'inherit';
      btn.style.textDecoration = 'underline';
      btn.textContent = action.label;
      btn.addEventListener('click', function () {
        el.toast.hidden = true;
        action.run();
      });
      el.toast.appendChild(btn);
    }

    el.toast.hidden = false;
    toastTimer = window.setTimeout(function () { el.toast.hidden = true; }, action ? 6000 : 2600);
  }

  function setFieldError(field, message) {
    var input = el[field];
    var box = $(field + '-error');
    if (box) box.textContent = message || '';
    if (input) {
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }

  function clearErrors() {
    FIELDS.forEach(function (f) { setFieldError(f, ''); });
  }

  // ---------- 分类 ----------

  /** 默认分类 + 用户实际用过的分类（用过的排在前面）。 */
  function knownCategories(type) {
    var used = [];
    var seen = {};
    L.filterRecords(state.records, { type: type }).forEach(function (r) {
      if (!seen[r.category]) { seen[r.category] = true; used.push(r.category); }
    });
    (L.DEFAULT_CATEGORIES[type] || []).forEach(function (c) {
      if (!seen[c]) { seen[c] = true; used.push(c); }
    });
    return used;
  }

  function renderCategoryHelpers() {
    var type = currentType();
    var options = knownCategories(type);
    var active = el.category.value.trim();

    el.chips.textContent = '';
    options.slice(0, 10).forEach(function (name) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = name;
      chip.setAttribute('aria-pressed', name === active ? 'true' : 'false');
      chip.addEventListener('click', function () {
        el.category.value = name === active ? '' : name;
        setFieldError('category', '');
        renderCategoryHelpers();
      });
      el.chips.appendChild(chip);
    });

    el.datalist.textContent = '';
    options.forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      el.datalist.appendChild(opt);
    });
  }

  // ---------- 筛选控件 ----------

  function monthLabel(key) {
    return key.slice(0, 4) + ' 年 ' + Number(key.slice(5, 7)) + ' 月';
  }

  function fillSelect(select, items, currentValue) {
    select.textContent = '';
    items.forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = item.value;
      opt.textContent = item.label;
      select.appendChild(opt);
    });
    // 之前选中的值如果没了（比如记录被删光），退回“全部”
    var exists = items.some(function (i) { return i.value === currentValue; });
    select.value = exists ? currentValue : items[0].value;
    return select.value;
  }

  function renderFilters() {
    var months = [{ value: 'all', label: '全部月份' }];
    L.availableMonths(state.records).forEach(function (m) {
      months.push({ value: m, label: monthLabel(m) });
    });
    state.filters.month = fillSelect(el.filterMonth, months, state.filters.month);

    var categories = [{ value: 'all', label: '全部分类' }];
    var seen = {};
    state.records.forEach(function (r) {
      if (!seen[r.category]) { seen[r.category] = true; categories.push({ value: r.category, label: r.category }); }
    });
    state.filters.category = fillSelect(el.filterCategory, categories, state.filters.category);

    el.filterType.value = state.filters.type;
  }

  // ---------- 渲染 ----------

  function visibleRecords() {
    return L.filterRecords(state.records, state.filters);
  }

  function renderStats(records) {
    var s = L.summarize(records);
    $('stat-income').textContent = money(s.income);
    $('stat-expense').textContent = money(s.expense);
    var balance = $('stat-balance');
    balance.textContent = money(s.balance);
    balance.style.color = s.balance < 0 ? 'var(--expense)' : (s.balance > 0 ? 'var(--income)' : '');
  }

  function makeRecordItem(record) {
    var li = document.createElement('li');
    li.className = 'record';

    var main = document.createElement('div');
    main.className = 'record-main';

    var category = document.createElement('div');
    category.className = 'record-category';
    category.textContent = record.category;
    main.appendChild(category);

    if (record.note) {
      var note = document.createElement('div');
      note.className = 'record-note';
      note.textContent = record.note;
      note.title = record.note;
      main.appendChild(note);
    }

    var amount = document.createElement('div');
    amount.className = 'record-amount ' + record.type;
    amount.textContent = (record.type === 'income' ? '+' : '−') + money(record.amount);

    var actions = document.createElement('div');
    actions.className = 'record-actions';

    var edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'icon-btn';
    edit.textContent = '编辑';
    edit.setAttribute('aria-label', '编辑 ' + record.category + ' ' + money(record.amount));
    edit.addEventListener('click', function () { startEdit(record.id); });

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn danger';
    del.textContent = '删除';
    del.setAttribute('aria-label', '删除 ' + record.category + ' ' + money(record.amount));
    del.addEventListener('click', function () { removeRecord(record.id); });

    actions.appendChild(edit);
    actions.appendChild(del);

    li.appendChild(main);
    li.appendChild(amount);
    li.appendChild(actions);
    return li;
  }

  function renderList(records) {
    el.list.textContent = '';
    el.count.textContent = records.length ? '共 ' + records.length + ' 笔' : '';

    if (records.length === 0) {
      el.empty.hidden = false;
      el.empty.textContent = state.records.length === 0
        ? '还没有记录，上面记第一笔吧。'
        : '这个筛选条件下没有记录。';
      return;
    }
    el.empty.hidden = true;

    var currentDay = null;
    records.forEach(function (record) {
      if (record.date !== currentDay) {
        currentDay = record.date;
        var sameDay = records.filter(function (r) { return r.date === currentDay; });
        var sum = L.summarize(sameDay);

        var head = document.createElement('li');
        head.className = 'day-head';

        var label = document.createElement('span');
        label.textContent = currentDay;

        var total = document.createElement('span');
        total.className = 'day-sum';
        var parts = [];
        if (sum.income) parts.push('收 ' + money(sum.income));
        if (sum.expense) parts.push('支 ' + money(sum.expense));
        total.textContent = parts.join(' · ');

        head.appendChild(label);
        head.appendChild(total);
        el.list.appendChild(head);
      }
      el.list.appendChild(makeRecordItem(record));
    });
  }

  function renderBreakdown(records) {
    var groups = L.groupByCategory(records, 'expense');
    el.breakdown.textContent = '';

    if (groups.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = '当前范围内没有支出。';
      el.breakdown.appendChild(empty);
      return;
    }

    groups.slice(0, 8).forEach(function (group) {
      var row = document.createElement('div');
      row.className = 'bar-row';

      var head = document.createElement('div');
      head.className = 'bar-head';

      var name = document.createElement('span');
      name.textContent = group.category;

      var value = document.createElement('span');
      value.className = 'bar-value';
      // 占比不足 1% 的显示成 <1%，避免出现「¥42.00 · 0%」这种看着像 bug 的行
      var percent = group.ratio * 100;
      var percentText = percent > 0 && percent < 0.5 ? '<1%' : Math.round(percent) + '%';
      value.textContent = money(group.total) + ' · ' + percentText;

      head.appendChild(name);
      head.appendChild(value);

      var track = document.createElement('div');
      track.className = 'bar-track';
      var fill = document.createElement('div');
      fill.className = 'bar-fill';
      // 相对最大项拉满，小分类也能看清
      fill.style.width = Math.max(2, (group.total / groups[0].total) * 100) + '%';
      track.appendChild(fill);

      row.appendChild(head);
      row.appendChild(track);
      el.breakdown.appendChild(row);
    });
  }

  function renderTrend() {
    var months = L.monthlyTrend(state.records, 6);
    var peak = months.reduce(function (max, m) {
      return Math.max(max, m.income, m.expense);
    }, 0);

    el.trend.textContent = '';

    var chart = document.createElement('div');
    chart.className = 'trend';

    months.forEach(function (m) {
      var col = document.createElement('div');
      col.className = 'trend-col';

      var bars = document.createElement('div');
      bars.className = 'trend-bars';

      [['income', m.income], ['expense', m.expense]].forEach(function (pair) {
        var bar = document.createElement('div');
        bar.className = 'trend-bar ' + pair[0];
        bar.style.height = (peak === 0 ? 0 : (pair[1] / peak) * 100) + '%';
        bar.title = m.month + ' ' + (pair[0] === 'income' ? '收入' : '支出') + ' ' + money(pair[1]);
        bars.appendChild(bar);
      });

      var label = document.createElement('div');
      label.className = 'trend-label';
      label.textContent = Number(m.month.slice(5, 7)) + '月';

      col.appendChild(bars);
      col.appendChild(label);
      chart.appendChild(col);
    });

    var legend = document.createElement('div');
    legend.className = 'legend';
    [['i-income', '收入'], ['i-expense', '支出']].forEach(function (pair) {
      var item = document.createElement('span');
      var swatch = document.createElement('i');
      swatch.className = pair[0];
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(pair[1]));
      legend.appendChild(item);
    });

    el.trend.appendChild(chart);
    el.trend.appendChild(legend);
  }

  function render() {
    renderFilters();
    var records = visibleRecords();
    renderStats(records);
    renderList(records);
    renderBreakdown(records);
    renderTrend();
    renderCategoryHelpers();
  }

  // ---------- 增删改 ----------

  function resetForm() {
    state.editingId = null;
    el.form.reset();
    el.id.value = '';
    el.date.value = L.todayString();
    el.submitBtn.textContent = '保存';
    el.cancelEdit.hidden = true;
    clearErrors();
    renderCategoryHelpers();
  }

  function startEdit(id) {
    var record = state.records.find(function (r) { return r.id === id; });
    if (!record) return;

    state.editingId = id;
    el.id.value = id;
    el.form.querySelector('input[name="type"][value="' + record.type + '"]').checked = true;
    el.amount.value = L.formatAmount(record.amount).replace(/,/g, '');
    el.category.value = record.category;
    el.date.value = record.date;
    el.note.value = record.note || '';
    el.submitBtn.textContent = '更新';
    el.cancelEdit.hidden = false;
    clearErrors();
    renderCategoryHelpers();

    el.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.amount.focus();
    el.amount.select();
  }

  function removeRecord(id) {
    var index = state.records.findIndex(function (r) { return r.id === id; });
    if (index === -1) return;

    var removed = state.records[index];
    state.records.splice(index, 1);
    if (state.editingId === id) resetForm();
    persist();
    render();

    toast('已删除 ' + removed.category + ' ' + money(removed.amount), {
      label: '撤销',
      run: function () {
        state.records.splice(Math.min(index, state.records.length), 0, removed);
        persist();
        render();
        toast('已恢复');
      }
    });
  }

  function handleSubmit(event) {
    event.preventDefault();
    clearErrors();

    var result = L.createRecord({
      id: state.editingId || undefined,
      type: currentType(),
      amount: el.amount.value,
      category: el.category.value,
      date: el.date.value,
      note: el.note.value
    });

    if (!result.ok) {
      Object.keys(result.errors).forEach(function (field) {
        setFieldError(field, result.errors[field]);
      });
      var firstBad = FIELDS.find(function (f) { return result.errors[f]; });
      if (firstBad && el[firstBad]) el[firstBad].focus();
      return;
    }

    var record = result.value;
    if (state.editingId) {
      var index = state.records.findIndex(function (r) { return r.id === state.editingId; });
      // 编辑期间这条被别处删了，就当新增处理
      if (index === -1) state.records.push(record);
      else state.records[index] = Object.assign({}, state.records[index], record);
      toast('已更新');
    } else {
      state.records.push(record);
      toast('已记下 ' + money(record.amount));
    }

    persist();
    resetForm();
    render();
    el.amount.focus();
  }

  // ---------- 导入导出 ----------

  function download(filename, text) {
    var blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // 立刻 revoke 在部分浏览器会中断下载，延后释放
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportCSV() {
    var records = visibleRecords();
    if (records.length === 0) {
      toast('当前没有可导出的记录');
      return;
    }
    var scope = state.filters.month === 'all' ? '全部' : state.filters.month;
    download('记账-' + scope + '.csv', L.toCSV(records));
    toast('已导出 ' + records.length + ' 笔');
  }

  function importCSV(file) {
    var reader = new FileReader();
    reader.onerror = function () { toast('读取文件失败'); };
    reader.onload = function () {
      var result = L.fromCSV(String(reader.result));
      if (result.records.length === 0) {
        toast(result.errors.length ? '没有可导入的行，第 ' + result.errors[0].line + ' 行：' + result.errors[0].message : '文件里没有记录');
        return;
      }
      var before = state.records.length;
      state.records = L.mergeRecords(state.records, result.records);
      persist();
      render();

      var added = state.records.length - before;
      var message = '已导入 ' + added + ' 笔';
      if (result.errors.length) message += '，跳过 ' + result.errors.length + ' 行格式有问题的数据';
      toast(message);
    };
    reader.readAsText(file, 'utf-8');
  }

  function clearAll() {
    if (state.records.length === 0) {
      toast('本来就是空的');
      return;
    }
    var ok = window.confirm(
      '确定清空全部 ' + state.records.length + ' 笔记录吗？\n' +
      '这个操作不能撤销，建议先导出 CSV 备份。'
    );
    if (!ok) return;

    state.records = [];
    state.filters = { month: 'all', type: 'all', category: 'all', keyword: '' };
    el.filterKeyword.value = '';
    persist();
    resetForm();
    render();
    toast('已清空');
  }

  // ---------- 事件绑定 ----------

  function bind() {
    el.form.addEventListener('submit', handleSubmit);
    el.cancelEdit.addEventListener('click', function () { resetForm(); });

    el.form.querySelectorAll('input[name="type"]').forEach(function (input) {
      input.addEventListener('change', renderCategoryHelpers);
    });

    el.category.addEventListener('input', function () {
      setFieldError('category', '');
      renderCategoryHelpers();
    });
    el.amount.addEventListener('input', function () { setFieldError('amount', ''); });
    el.date.addEventListener('input', function () { setFieldError('date', ''); });

    el.filterMonth.addEventListener('change', function () {
      state.filters.month = this.value;
      render();
    });
    el.filterType.addEventListener('change', function () {
      state.filters.type = this.value;
      render();
    });
    el.filterCategory.addEventListener('change', function () {
      state.filters.category = this.value;
      render();
    });

    var searchTimer = null;
    el.filterKeyword.addEventListener('input', function () {
      var value = this.value;
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(function () {
        state.filters.keyword = value;
        render();
      }, 150);
    });

    $('export-csv').addEventListener('click', exportCSV);
    $('import-csv').addEventListener('click', function () { el.fileInput.click(); });
    el.fileInput.addEventListener('change', function () {
      if (this.files && this.files[0]) importCSV(this.files[0]);
      this.value = '';
    });
    $('clear-all').addEventListener('click', clearAll);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state.editingId) resetForm();
    });
  }

  // ---------- 启动 ----------

  function init() {
    if (!Store.isAvailable()) $('storage-warning').hidden = false;
    bind();
    resetForm();
    render();
  }

  init();
})();
