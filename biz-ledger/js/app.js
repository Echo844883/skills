/**
 * 界面层：读写 state、渲染 DOM、绑事件。
 * 所有记账和税务计算都走 Ledger（core.js），这里不重复实现业务逻辑，
 * 只负责把计算结果摆到页面上。所有用户内容一律用 textContent 写入。
 */
(function () {
  'use strict';

  var L = window.Ledger;
  var Store = window.LedgerStore;

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    records: [],
    settings: L.normalizeSettings(null),
    editingId: null,
    filters: { period: 'all', direction: 'all', category: 'all', invoiceType: 'all', keyword: '' },
    vatPeriod: null,
    citYear: null
  };

  var el = {
    form: $('record-form'),
    id: $('record-id'),
    grossAmount: $('grossAmount'),
    date: $('date'),
    taxRate: $('taxRate'),
    rateChips: $('rate-chips'),
    invoiceChips: $('invoice-chips'),
    category: $('category'),
    counterparty: $('counterparty'),
    invoiceNo: $('invoiceNo'),
    note: $('note'),
    taxPreview: $('tax-preview'),
    submitBtn: $('submit-btn'),
    cancelEdit: $('cancel-edit'),
    categoryChips: $('category-chips'),
    datalist: $('category-options'),
    list: $('record-list'),
    empty: $('empty-state'),
    count: $('record-count'),
    toast: $('toast'),
    fileInput: $('file-input'),
    filterPeriod: $('filter-period'),
    filterDirection: $('filter-direction'),
    filterCategory: $('filter-category'),
    filterInvoice: $('filter-invoice'),
    filterKeyword: $('filter-keyword'),
    vatPeriodSelect: $('vat-period'),
    vatReport: $('vat-report'),
    surtaxReport: $('surtax-report'),
    citYearSelect: $('cit-year'),
    citReport: $('cit-report'),
    invoiceReport: $('invoice-report'),
    settingsToggle: $('settings-toggle'),
    settingsBody: $('settings-body'),
    settingsSummary: $('settings-summary'),
    settingsSmallFields: $('settings-small-fields'),
    settingsGeneralFields: $('settings-general-fields'),
    settingsSaveHint: $('settings-save-hint')
  };

  var FORM_FIELDS = ['grossAmount', 'date', 'taxRate', 'category', 'counterparty', 'invoiceNo', 'note'];
  var INVOICE_ORDER = ['none', 'general', 'special'];
  var invoiceType = 'none';

  // ---------- 工具 ----------

  function money(cents, opts) { return '¥' + L.formatAmount(cents, opts); }
  function yuanInputValue(cents) { return (cents / 100).toFixed(2); }
  function currentDirection() {
    var checked = el.form.querySelector('input[name="direction"]:checked');
    return checked ? checked.value : 'expense';
  }

  function persistRecords() {
    if (!Store.saveRecords(state.records)) toast('保存失败：浏览器存储空间可能已满');
  }
  function persistSettings() { Store.saveSettings(state.settings); }

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
      btn.addEventListener('click', function () { el.toast.hidden = true; action.run(); });
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
  function clearErrors(fields) { fields.forEach(function (f) { setFieldError(f, ''); }); }

  // ---------- 税务参数面板 ----------

  function fillSettingsForm(s) {
    document.querySelector('input[name="taxpayerType"][value="' + s.taxpayerType + '"]').checked = true;
    document.querySelector('input[name="period"][value="' + s.period + '"]').checked = true;
    $('s-vat-small-rate').value = String(s.vatSmallRate);
    $('s-vat-threshold-month').value = yuanInputValue(s.vatSmallThresholdMonth);
    $('s-vat-threshold-quarter').value = yuanInputValue(s.vatSmallThresholdQuarter);
    $('s-vat-opening-credit').value = yuanInputValue(s.vatOpeningCredit);
    $('s-surtax-rate').value = String(s.surtaxRate);
    $('s-cit-cap').value = yuanInputValue(s.citBrackets[0].upTo || 0);
    $('s-cit-low').value = String(s.citBrackets[0].rate);
    $('s-cit-high').value = String(s.citBrackets[1].rate);
    $('s-entertain-rate').value = String(s.entertainmentDeductRate);
    $('s-entertain-cap').value = String(s.entertainmentRevenueCap);
    $('s-ad-cap').value = String(s.adRevenueCap);
    $('s-my-tax-id').value = s.myTaxId || '';
    toggleSettingsFieldsByType();
  }

  function toggleSettingsFieldsByType() {
    var type = document.querySelector('input[name="taxpayerType"]:checked').value;
    el.settingsSmallFields.hidden = type !== 'small';
    el.settingsGeneralFields.hidden = type !== 'general';
  }

  function renderSettingsSummary() {
    var s = state.settings;
    var typeLabel = s.taxpayerType === 'general' ? '一般纳税人' : '小规模纳税人';
    var periodLabel = s.period === 'quarter' ? '按季申报' : '按月申报';
    var extra = s.taxpayerType === 'general'
      ? '附加税 ' + s.surtaxRate + '%'
      : '征收率 ' + s.vatSmallRate + '%';
    el.settingsSummary.textContent = typeLabel + ' · ' + periodLabel + ' · ' + extra;
  }

  function readSettingsForm() {
    return {
      taxpayerType: document.querySelector('input[name="taxpayerType"]:checked').value,
      period: document.querySelector('input[name="period"]:checked').value,
      vatSmallRate: $('s-vat-small-rate').value,
      vatSmallThresholdMonth: $('s-vat-threshold-month').value,
      vatSmallThresholdQuarter: $('s-vat-threshold-quarter').value,
      vatOpeningCredit: $('s-vat-opening-credit').value,
      surtaxRate: $('s-surtax-rate').value,
      citBracketCap: $('s-cit-cap').value,
      citLowRate: $('s-cit-low').value,
      citHighRate: $('s-cit-high').value,
      entertainmentDeductRate: $('s-entertain-rate').value,
      entertainmentRevenueCap: $('s-entertain-cap').value,
      adRevenueCap: $('s-ad-cap').value,
      myTaxId: $('s-my-tax-id').value
    };
  }

  var SETTINGS_FIELD_MAP = {
    vatSmallRate: 's-vat-small-rate', vatSmallThresholdMonth: 's-vat-threshold-month',
    vatSmallThresholdQuarter: 's-vat-threshold-quarter', vatOpeningCredit: 's-vat-opening-credit',
    surtaxRate: 's-surtax-rate', citBracketCap: 's-cit-cap', citLowRate: 's-cit-low',
    citHighRate: 's-cit-high', entertainmentDeductRate: 's-entertain-rate',
    entertainmentRevenueCap: 's-entertain-cap', adRevenueCap: 's-ad-cap',
    myTaxId: 's-my-tax-id',
    taxpayerType: null, period: null
  };

  function saveSettingsFromForm() {
    Object.values(SETTINGS_FIELD_MAP).filter(Boolean).forEach(function (id) {
      var box = document.getElementById(id + '-error');
      if (box) box.textContent = '';
      document.getElementById(id).removeAttribute('aria-invalid');
    });

    var result = L.validateSettings(readSettingsForm());
    if (!result.ok) {
      Object.keys(result.errors).forEach(function (field) {
        var id = SETTINGS_FIELD_MAP[field];
        if (!id) return;
        var box = document.getElementById(id + '-error');
        if (box) box.textContent = result.errors[field];
        document.getElementById(id).setAttribute('aria-invalid', 'true');
      });
      el.settingsSaveHint.textContent = '';
      toast('部分参数不对，请检查标红的项');
      return;
    }

    state.settings = result.value;
    persistSettings();
    el.settingsSaveHint.textContent = '已保存';
    window.setTimeout(function () { el.settingsSaveHint.textContent = ''; }, 2500);
    render();
  }

  // ---------- 科目 chips ----------

  function knownCategories(direction) {
    var used = [];
    var seen = {};
    L.filterRecords(state.records, { direction: direction }).forEach(function (r) {
      if (!seen[r.category]) { seen[r.category] = true; used.push(r.category); }
    });
    (L.DEFAULT_CATEGORIES[direction] || []).forEach(function (c) {
      if (!seen[c]) { seen[c] = true; used.push(c); }
    });
    return used;
  }

  function renderCategoryHelpers() {
    var direction = currentDirection();
    var options = knownCategories(direction);
    var active = el.category.value.trim();

    el.categoryChips.textContent = '';
    options.slice(0, 12).forEach(function (name) {
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
      el.categoryChips.appendChild(chip);
    });

    el.datalist.textContent = '';
    options.forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      el.datalist.appendChild(opt);
    });
  }

  // ---------- 税率 / 发票类型 chips ----------

  function renderRateChips() {
    var current = el.taxRate.value.trim();
    el.rateChips.textContent = '';
    L.COMMON_RATES.forEach(function (rate) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = rate + '%';
      chip.setAttribute('aria-pressed', String(rate) === current ? 'true' : 'false');
      chip.addEventListener('click', function () {
        el.taxRate.value = String(rate);
        setFieldError('taxRate', '');
        renderRateChips();
        renderTaxPreview();
      });
      el.rateChips.appendChild(chip);
    });
  }

  var INVOICE_LABEL_TEXT = { none: '无票', general: '普通发票', special: '增值税专用发票' };

  function renderInvoiceChips() {
    el.invoiceChips.textContent = '';
    INVOICE_ORDER.forEach(function (type) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = INVOICE_LABEL_TEXT[type];
      chip.dataset.invoiceType = type; // 托管版发布前存草稿时，靠这个属性读出/点回当前选中的发票类型
      chip.setAttribute('aria-pressed', type === invoiceType ? 'true' : 'false');
      chip.addEventListener('click', function () {
        invoiceType = type;
        renderInvoiceChips();
        renderTaxPreview();
      });
      el.invoiceChips.appendChild(chip);
    });
  }

  function renderTaxPreview() {
    var gross = L.parseAmount(el.grossAmount.value);
    var rate = L.parseRate(el.taxRate.value === '' ? 0 : el.taxRate.value);
    if (gross === null || gross <= 0 || rate === null) {
      el.taxPreview.textContent = '填写金额和税率后，这里会显示拆分出的不含税金额与税额。';
      return;
    }
    var split = L.splitTax(gross, rate);
    var deductible = L.isDeductible(currentDirection(), invoiceType, state.settings.taxpayerType);

    el.taxPreview.textContent = '';
    var parts = [
      ['不含税金额', money(split.net)],
      ['税额', money(split.tax)]
    ];
    if (currentDirection() === 'expense') {
      parts.push(['进项抵扣', deductible ? '可抵扣' : '不可抵扣']);
    }
    parts.forEach(function (pair) {
      var span = document.createElement('span');
      var label = document.createTextNode(pair[0] + ' ');
      var b = document.createElement('b');
      b.textContent = pair[1];
      span.appendChild(label);
      span.appendChild(b);
      el.taxPreview.appendChild(span);
    });
  }

  // ---------- 筛选控件 ----------

  function periodLabel(key, periodType) {
    if (periodType === 'quarter') {
      return key.slice(0, 4) + ' 年第 ' + key.slice(6) + ' 季度';
    }
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
    var exists = items.some(function (i) { return i.value === currentValue; });
    select.value = exists ? currentValue : items[0].value;
    return select.value;
  }

  function renderFilters() {
    var periods = [{ value: 'all', label: '全部期间' }];
    L.availablePeriods(state.records, state.settings.period).forEach(function (p) {
      periods.push({ value: p, label: periodLabel(p, state.settings.period) });
    });
    state.filters.period = fillSelect(el.filterPeriod, periods, state.filters.period);
    state.filters.periodType = state.settings.period;

    var categories = [{ value: 'all', label: '全部科目' }];
    var seen = {};
    state.records.forEach(function (r) {
      if (!seen[r.category]) { seen[r.category] = true; categories.push({ value: r.category, label: r.category }); }
    });
    state.filters.category = fillSelect(el.filterCategory, categories, state.filters.category);

    el.filterDirection.value = state.filters.direction;
    el.filterInvoice.value = state.filters.invoiceType;
  }

  // ---------- 明细渲染 ----------

  function visibleRecords() { return L.filterRecords(state.records, state.filters); }

  function renderStats(records) {
    var s = L.summarize(records);
    $('stat-income').textContent = money(s.incomeNet);
    $('stat-expense').textContent = money(s.expenseNet);
    var profit = $('stat-profit');
    profit.textContent = money(s.profit);
    profit.style.color = s.profit < 0 ? 'var(--expense)' : (s.profit > 0 ? 'var(--income)' : '');
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

    var meta = document.createElement('div');
    meta.className = 'record-meta';
    if (record.counterparty) {
      var cp = document.createElement('span');
      cp.textContent = record.counterparty;
      meta.appendChild(cp);
    }
    var invoiceTag = document.createElement('span');
    invoiceTag.className = 'tag' + (record.invoiceType === 'special' ? ' tag-special' : '');
    invoiceTag.textContent = L.INVOICE_LABEL[record.invoiceType];
    meta.appendChild(invoiceTag);
    if (record.taxRate) {
      var rateTag = document.createElement('span');
      rateTag.className = 'tag';
      rateTag.textContent = record.taxRate + '%';
      meta.appendChild(rateTag);
    }
    main.appendChild(meta);

    if (record.note) {
      var note = document.createElement('div');
      note.className = 'record-note';
      note.textContent = record.note;
      note.title = record.note;
      main.appendChild(note);
    }

    var amount = document.createElement('div');
    amount.className = 'record-amount ' + record.direction;
    var gross = document.createElement('span');
    gross.className = 'gross';
    gross.textContent = (record.direction === 'income' ? '+' : '−') + money(record.grossAmount);
    amount.appendChild(gross);
    if (record.taxAmount) {
      var taxSpan = document.createElement('span');
      taxSpan.className = 'tax';
      taxSpan.textContent = '税 ' + money(record.taxAmount);
      amount.appendChild(taxSpan);
    }

    var actions = document.createElement('div');
    actions.className = 'record-actions';
    var edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'icon-btn';
    edit.textContent = '编辑';
    edit.addEventListener('click', function () { startEdit(record.id); });
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn danger';
    del.textContent = '删除';
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
      el.empty.textContent = state.records.length === 0 ? '还没有记录，上面记第一笔吧。' : '这个筛选条件下没有记录。';
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
        if (sum.incomeGross) parts.push('收 ' + money(sum.incomeGross));
        if (sum.expenseGross) parts.push('支 ' + money(sum.expenseGross));
        total.textContent = parts.join(' · ');
        head.appendChild(label);
        head.appendChild(total);
        el.list.appendChild(head);
      }
      el.list.appendChild(makeRecordItem(record));
    });
  }

  // ---------- 增值税报表 ----------

  function renderVatReport() {
    var periods = L.availablePeriods(state.records, state.settings.period);
    if (periods.length === 0) periods = [L.periodKeyOf(L.todayString(), state.settings.period)];
    var items = periods.map(function (p) { return { value: p, label: periodLabel(p, state.settings.period) }; });
    state.vatPeriod = fillSelect(el.vatPeriodSelect, items, state.vatPeriod);

    var result = L.vatCalc(state.records, state.settings, state.vatPeriod, state.settings.period);
    el.vatReport.textContent = '';

    var table = document.createElement('table');
    table.className = 'report-table';
    var rows = [];

    if (result.taxpayerType === 'small') {
      rows.push(['不含税销售额', money(result.netSales)]);
      rows.push(['征收率', result.rate + '%']);
      if (result.belowThreshold) {
        rows.push(['起征点', money(result.threshold) + '（未达标，免征）']);
      } else {
        rows.push(['起征点', money(result.threshold)]);
      }
    } else {
      rows.push(['销项税额', money(result.outputTax)]);
      rows.push(['本期进项税额（可抵扣）', money(result.inputTax)]);
      rows.push(['期初留抵税额', money(result.openingCredit)]);
      rows.push(['期末留抵税额（结转下期）', money(result.closingCredit)]);
    }

    rows.forEach(function (pair) {
      var tr = document.createElement('tr');
      var td1 = document.createElement('td'); td1.className = 'label'; td1.textContent = pair[0];
      var td2 = document.createElement('td'); td2.className = 'num'; td2.textContent = pair[1];
      tr.appendChild(td1); tr.appendChild(td2);
      table.appendChild(tr);
    });

    var totalRow = document.createElement('tr');
    totalRow.className = 'total';
    var totalLabel = document.createElement('td'); totalLabel.className = 'label'; totalLabel.textContent = '应纳增值税';
    var totalValue = document.createElement('td'); totalValue.className = 'num'; totalValue.textContent = money(result.payable);
    totalRow.appendChild(totalLabel); totalRow.appendChild(totalValue);
    table.appendChild(totalRow);

    el.vatReport.appendChild(table);

    if (result.taxpayerType === 'small' && result.belowThreshold) {
      var pill = document.createElement('span');
      pill.className = 'pill pill-ok';
      pill.style.marginTop = '10px';
      pill.style.display = 'inline-block';
      pill.textContent = '本期未达起征点，测算为免征';
      el.vatReport.appendChild(pill);
    }

    renderSurtaxReport(result.payable);
  }

  function renderSurtaxReport(vatPayable) {
    var r = L.surtaxCalc(vatPayable, state.settings);
    el.surtaxReport.textContent = '';
    var table = document.createElement('table');
    table.className = 'report-table';
    [['计税依据（应纳增值税）', money(r.base)], ['合计比例', r.rate + '%']].forEach(function (pair) {
      var tr = document.createElement('tr');
      var td1 = document.createElement('td'); td1.className = 'label'; td1.textContent = pair[0];
      var td2 = document.createElement('td'); td2.className = 'num'; td2.textContent = pair[1];
      tr.appendChild(td1); tr.appendChild(td2);
      table.appendChild(tr);
    });
    var totalRow = document.createElement('tr');
    totalRow.className = 'total';
    var totalLabel = document.createElement('td'); totalLabel.className = 'label'; totalLabel.textContent = '应纳附加税合计';
    var totalValue = document.createElement('td'); totalValue.className = 'num'; totalValue.textContent = money(r.amount);
    totalRow.appendChild(totalLabel); totalRow.appendChild(totalValue);
    table.appendChild(totalRow);
    el.surtaxReport.appendChild(table);

    var note = document.createElement('p');
    note.className = 'report-note';
    note.textContent = '城建税、教育费附加、地方教育费附加分税种税率不同，此处按合计比例简化测算，具体请以当地规定为准。';
    el.surtaxReport.appendChild(note);
  }

  // ---------- 企业所得税报表 ----------

  function renderCitReport() {
    var years = {};
    state.records.forEach(function (r) { years[r.date.slice(0, 4)] = true; });
    var currentYear = L.todayString().slice(0, 4);
    years[currentYear] = true;
    var yearList = Object.keys(years).sort().reverse();
    var items = yearList.map(function (y) { return { value: y, label: y + ' 年' }; });
    state.citYear = fillSelect(el.citYearSelect, items, state.citYear);

    var yearRecords = state.records.filter(function (r) { return r.date.slice(0, 4) === state.citYear; });
    var result = L.citCalc(yearRecords, state.settings);
    var advisories = L.deductionAdvisory(yearRecords, state.settings);

    el.citReport.textContent = '';
    var table = document.createElement('table');
    table.className = 'report-table';
    var rows = [
      ['收入（不含税）', money(result.revenue)],
      ['成本费用（不含税）', money(result.costAndExpense)],
      ['利润（简化，未做纳税调整）', money(result.profit)],
      ['应纳税所得额', money(result.taxableIncome)]
    ];
    rows.forEach(function (pair) {
      var tr = document.createElement('tr');
      var td1 = document.createElement('td'); td1.className = 'label'; td1.textContent = pair[0];
      var td2 = document.createElement('td'); td2.className = 'num'; td2.textContent = pair[1];
      tr.appendChild(td1); tr.appendChild(td2);
      table.appendChild(tr);
    });
    var totalRow = document.createElement('tr');
    totalRow.className = 'total';
    var totalLabel = document.createElement('td'); totalLabel.className = 'label'; totalLabel.textContent = '应纳企业所得税';
    var totalValue = document.createElement('td'); totalValue.className = 'num'; totalValue.textContent = money(result.tax);
    totalRow.appendChild(totalLabel); totalRow.appendChild(totalValue);
    table.appendChild(totalRow);
    el.citReport.appendChild(table);

    var note = document.createElement('p');
    note.className = 'report-note';
    note.textContent = '未考虑具体纳税调整事项（超标费用调增、免税收入调减、以前年度亏损弥补等），仅作参考。';
    el.citReport.appendChild(note);

    advisories.forEach(function (a) {
      var box = document.createElement('div');
      box.className = 'advisory-item';
      box.textContent = '';
      var line1 = document.createTextNode(a.category + ' 本期发生 ');
      var b1 = document.createElement('b'); b1.textContent = money(a.spent);
      var line2 = document.createTextNode('，按「' + a.rule + '」孰低估算税前扣除限额约 ');
      var b2 = document.createElement('b'); b2.textContent = money(a.cap);
      box.appendChild(line1); box.appendChild(b1); box.appendChild(line2); box.appendChild(b2);
      if (a.excess > 0) {
        var line3 = document.createTextNode('，超出部分约 ');
        var b3 = document.createElement('b'); b3.textContent = money(a.excess);
        var line4 = document.createTextNode(' 需在企业所得税申报时做纳税调增。');
        box.appendChild(line3); box.appendChild(b3); box.appendChild(line4);
      } else {
        box.appendChild(document.createTextNode('，未超限额。'));
      }
      el.citReport.appendChild(box);
    });
  }

  // ---------- 发票概览 ----------

  function renderInvoiceReport() {
    var periodKey = state.vatPeriod || L.periodKeyOf(L.todayString(), state.settings.period);
    var periodRecords = state.records.filter(function (r) {
      return L.periodKeyOf(r.date, state.settings.period) === periodKey;
    });
    var outputInvoices = periodRecords.filter(function (r) { return r.direction === 'income' && r.invoiceType !== 'none'; });
    var specialInputs = periodRecords.filter(function (r) { return r.direction === 'expense' && r.invoiceType === 'special'; });
    var deductibleInputs = specialInputs.filter(function (r) { return r.deductible; });
    var deductibleTax = deductibleInputs.reduce(function (sum, r) { return sum + r.taxAmount; }, 0);

    el.invoiceReport.textContent = '';
    var grid = document.createElement('div');
    grid.className = 'mini-stats';
    [
      ['本期销项发票', outputInvoices.length + ' 张'],
      ['本期进项专票', specialInputs.length + ' 张'],
      ['可抵扣进项税额', money(deductibleTax)],
      ['统计期间', periodLabel(periodKey, state.settings.period)]
    ].forEach(function (pair) {
      var box = document.createElement('div');
      box.className = 'mini-stat';
      var n = document.createElement('span'); n.className = 'n'; n.textContent = pair[1];
      var l = document.createElement('span'); l.className = 'l'; l.textContent = pair[0];
      box.appendChild(n); box.appendChild(l);
      grid.appendChild(box);
    });
    el.invoiceReport.appendChild(grid);

    var note = document.createElement('p');
    note.className = 'report-note';
    note.textContent = '发票明细已包含在导出的 CSV 里（发票类型、发票号列），可用表格软件按需筛选。';
    el.invoiceReport.appendChild(note);
  }

  // ---------- 汇总渲染 ----------

  function render() {
    renderSettingsSummary();
    renderFilters();
    var records = visibleRecords();
    renderStats(records);
    renderList(records);
    renderVatReport();
    renderCitReport();
    renderInvoiceReport();
    renderCategoryHelpers();
  }

  // ---------- 增删改 ----------

  function resetForm() {
    state.editingId = null;
    el.form.reset();
    el.id.value = '';
    el.date.value = L.todayString();
    el.taxRate.value = '';
    invoiceType = 'none';
    el.submitBtn.textContent = '保存';
    el.cancelEdit.hidden = true;
    clearErrors(FORM_FIELDS);
    renderCategoryHelpers();
    renderRateChips();
    renderInvoiceChips();
    renderTaxPreview();
  }

  function startEdit(id) {
    var record = state.records.find(function (r) { return r.id === id; });
    if (!record) return;

    state.editingId = id;
    el.id.value = id;
    el.form.querySelector('input[name="direction"][value="' + record.direction + '"]').checked = true;
    el.grossAmount.value = (record.grossAmount / 100).toFixed(2);
    el.taxRate.value = String(record.taxRate);
    invoiceType = record.invoiceType;
    el.category.value = record.category;
    el.counterparty.value = record.counterparty || '';
    el.invoiceNo.value = record.invoiceNo || '';
    el.date.value = record.date;
    el.note.value = record.note || '';
    el.submitBtn.textContent = '更新';
    el.cancelEdit.hidden = false;
    clearErrors(FORM_FIELDS);
    renderCategoryHelpers();
    renderRateChips();
    renderInvoiceChips();
    renderTaxPreview();

    el.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.grossAmount.focus();
    el.grossAmount.select();
  }

  function removeRecord(id) {
    var index = state.records.findIndex(function (r) { return r.id === id; });
    if (index === -1) return;
    var removed = state.records[index];
    state.records.splice(index, 1);
    if (state.editingId === id) resetForm();
    persistRecords();
    render();
    toast('已删除 ' + removed.category + ' ' + money(removed.grossAmount), {
      label: '撤销',
      run: function () {
        state.records.splice(Math.min(index, state.records.length), 0, removed);
        persistRecords();
        render();
        toast('已恢复');
      }
    });
  }

  function handleSubmit(event) {
    event.preventDefault();
    clearErrors(FORM_FIELDS);

    var result = L.createTransaction({
      id: state.editingId || undefined,
      direction: currentDirection(),
      grossAmount: el.grossAmount.value,
      taxRate: el.taxRate.value === '' ? 0 : el.taxRate.value,
      invoiceType: invoiceType,
      category: el.category.value,
      counterparty: el.counterparty.value,
      invoiceNo: el.invoiceNo.value,
      date: el.date.value,
      note: el.note.value
    }, state.settings);

    if (!result.ok) {
      Object.keys(result.errors).forEach(function (field) { setFieldError(field, result.errors[field]); });
      var firstBad = FORM_FIELDS.find(function (f) { return result.errors[f]; });
      if (firstBad && el[firstBad]) el[firstBad].focus();
      return;
    }

    var record = result.value;
    if (state.editingId) {
      var index = state.records.findIndex(function (r) { return r.id === state.editingId; });
      if (index === -1) state.records.push(record);
      else state.records[index] = Object.assign({}, state.records[index], record);
      toast('已更新');
    } else {
      state.records.push(record);
      toast('已记下 ' + money(record.grossAmount));
    }

    persistRecords();
    resetForm();
    render();
    el.grossAmount.focus();
  }

  // ---------- 导入导出 ----------

  function exportCSV() {
    var records = visibleRecords();
    if (records.length === 0) { toast('当前没有可导出的记录'); return; }
    var scope = state.filters.period === 'all' ? '全部' : state.filters.period;
    Store.download('记账-' + scope + '.csv', L.toCSV(records), function (message) {
      toast(message || ('已导出 ' + records.length + ' 笔'));
    });
  }

  function importCSV(file) {
    var reader = new FileReader();
    reader.onerror = function () { toast('读取文件失败'); };
    reader.onload = function () {
      var result = L.fromCSV(String(reader.result), state.settings);
      if (result.records.length === 0) {
        toast(result.errors.length ? '没有可导入的行，第 ' + result.errors[0].line + ' 行：' + result.errors[0].message : '文件里没有记录');
        return;
      }
      var before = state.records.length;
      state.records = L.mergeRecords(state.records, result.records);
      persistRecords();
      render();
      var added = state.records.length - before;
      var message = '已导入 ' + added + ' 笔';
      if (result.errors.length) message += '，跳过 ' + result.errors.length + ' 行格式有问题的数据';
      toast(message);
    };
    reader.readAsText(file, 'utf-8');
  }

  // ---------- 导入发票 PDF ----------
  //
  // 分两半：pdf.js 的加载和文字提取是「碰运气」的部分（不同 PDF 质量不同，
  // 库本身也不小），parseInvoiceText（core.js）是纯逻辑、已经单测过的部分。
  // 这里只负责把提取出的文字交给 core.js，再把结果铺到已有的记账表单上——
  // 复用同一个「保存」按钮和校验逻辑，导入进来的东西跟手填的一视同仁，
  // 保存前必须让人看一眼、改一改。

  var pdfjsReadyPromise = null;

  /** 把一个字符串当作经典脚本执行（不用 eval，用真实的 <script> 标签）。 */
  function runScriptSource(source) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.textContent = source;
      script.onerror = function () { reject(new Error('脚本执行失败')); };
      document.head.appendChild(script);
      // 内联脚本没有 onload，写完就是执行完了
      resolve();
    });
  }

  /** 加载一个外部脚本文件（本地/Pages 部署用这个）。 */
  function loadScriptFile(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('加载 ' + src + ' 失败')); };
      document.head.appendChild(script);
    });
  }

  /**
   * 懒加载 pdf.js。第一次点「导入发票」才会跑这个，平时打开页面不用多下载
   * 这将近 2.5MB。托管版（Artifact）把库内容整段放在 <script type="text/plain">
   * 孤岛里（因为发布出去是单个文件，没有旁边的 js/vendor/ 目录可以引用）；
   * 本地版/Pages 版就是正常的独立文件，直接 <script src> 加载。
   */
  function ensurePdfJs() {
    if (pdfjsReadyPromise) return pdfjsReadyPromise;

    var libIsland = $('pdf-lib-src-data');
    var workerIsland = $('pdf-worker-src-data');

    var loadLib = libIsland
      ? runScriptSource(libIsland.textContent)
      : loadScriptFile('js/vendor/pdf.bundle.js');
    var loadWorker = workerIsland
      ? runScriptSource(workerIsland.textContent)
      : loadScriptFile('js/vendor/pdf-worker-src.js');

    pdfjsReadyPromise = Promise.all([loadLib, loadWorker]).then(function () {
      if (!window.pdfjsLib || !window.__PDF_WORKER_SRC__) {
        throw new Error('pdf.js 没能正常加载');
      }
      var blob = new Blob([window.__PDF_WORKER_SRC__], { type: 'text/javascript' });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
      return window.pdfjsLib;
    }).catch(function (err) {
      pdfjsReadyPromise = null; // 加载失败不要缓存，下次点了能重试
      throw err;
    });
    return pdfjsReadyPromise;
  }

  /** 从 PDF 文件里提取所有页面的文字，拼成一段。 */
  function extractPdfText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('读取文件失败')); };
      reader.onload = function () {
        ensurePdfJs().then(function (pdfjsLib) {
          return pdfjsLib.getDocument({ data: new Uint8Array(reader.result) }).promise;
        }).then(function (doc) {
          var pageTexts = [];
          var pagePromise = Promise.resolve();
          var collect = function (pageNo) {
            return doc.getPage(pageNo).then(function (page) { return page.getTextContent(); }).then(function (content) {
              pageTexts.push(content.items.map(function (item) { return item.str; }).join(' '));
            });
          };
          for (var i = 1; i <= doc.numPages; i++) {
            pagePromise = pagePromise.then(collect.bind(null, i));
          }
          return pagePromise.then(function () { return pageTexts.join(' '); });
        }).then(resolve, reject);
      };
      reader.readAsArrayBuffer(file);
    });
  }

  var FIELD_LABELS = {
    invoiceNo: '发票号码', date: '开票日期', buyerName: '购买方', buyerTaxId: '购买方税号',
    sellerName: '销售方', sellerTaxId: '销售方税号', grossAmount: '价税合计',
    taxRate: '税率', itemNote: '项目名称'
  };

  /** 把识别结果铺到「记一笔」表单上；识别不出来的字段保持原样，不清空已填的值。 */
  function applyInvoiceFields(fields) {
    if (fields.direction) {
      var input = el.form.querySelector('input[name="direction"][value="' + fields.direction + '"]');
      if (input) input.checked = true;
    }
    if (fields.grossAmount !== null) el.grossAmount.value = (fields.grossAmount / 100).toFixed(2);
    if (fields.taxRate !== null) el.taxRate.value = String(fields.taxRate);
    if (fields.invoiceType) invoiceType = fields.invoiceType;
    if (fields.category) el.category.value = fields.category;
    if (fields.counterparty) el.counterparty.value = fields.counterparty;
    if (fields.invoiceNo) el.invoiceNo.value = fields.invoiceNo;
    if (fields.date) el.date.value = fields.date;
    if (fields.itemNote) el.note.value = fields.itemNote;

    renderCategoryHelpers();
    renderRateChips();
    renderInvoiceChips();
    renderTaxPreview();
  }

  /** 在识别结果卡片里列出找到了什么、没找到什么，不用 innerHTML 拼。 */
  function renderInvoiceImportSummary(fields, warnings) {
    var host = $('invoice-import-summary');
    host.textContent = '';

    var table = document.createElement('table');
    table.className = 'report-table';
    Object.keys(FIELD_LABELS).forEach(function (key) {
      var value = fields[key];
      var display = value === null || value === undefined || value === ''
        ? '（未识别）'
        : (key === 'grossAmount' ? money(value) : (key === 'taxRate' ? value + '%' : String(value)));
      var tr = document.createElement('tr');
      var td1 = document.createElement('td'); td1.className = 'label'; td1.textContent = FIELD_LABELS[key];
      var td2 = document.createElement('td'); td2.className = 'num'; td2.textContent = display;
      if (value === null || value === undefined || value === '') td2.style.color = 'var(--advisory)';
      tr.appendChild(td1); tr.appendChild(td2);
      table.appendChild(tr);
    });
    host.appendChild(table);

    if (warnings.length > 0) {
      var list = document.createElement('ul');
      list.className = 'invoice-warnings';
      warnings.forEach(function (w) {
        var li = document.createElement('li');
        li.textContent = w;
        list.appendChild(li);
      });
      host.appendChild(list);
    }
  }

  function showInvoiceImportCard() { $('invoice-import-card').hidden = false; }
  function hideInvoiceImportCard() { $('invoice-import-card').hidden = true; }

  function setInvoiceImportStatus(text) {
    var box = $('invoice-import-status');
    box.hidden = !text;
    box.textContent = text || '';
  }

  /** 解析文字、铺表单、显示识别结果——PDF 提取和手动粘贴两条路都走到这一步。 */
  function processInvoiceText(text) {
    if (!text || !text.trim()) {
      toast('没有提取到任何文字，这份 PDF 可能是扫描件或图片，试试下面的手动粘贴');
      showInvoiceImportCard();
      $('invoice-paste-fallback').open = true;
      return;
    }
    var result = L.parseInvoiceText(text, state.settings);
    applyInvoiceFields(result.fields);
    renderInvoiceImportSummary(result.fields, result.warnings);
    showInvoiceImportCard();
    setInvoiceImportStatus('');

    el.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('已识别，保存前请核对一遍表单');
  }

  function handleInvoicePDF(file) {
    showInvoiceImportCard();
    setInvoiceImportStatus('正在读取 PDF…');
    extractPdfText(file).then(function (text) {
      processInvoiceText(text);
    }).catch(function (err) {
      setInvoiceImportStatus('');
      toast('读取失败：' + (err && err.message ? err.message : '未知错误') + '，可以试试下面的手动粘贴');
      $('invoice-paste-fallback').open = true;
    });
  }

  function handleInvoicePaste() {
    var text = $('invoice-paste-text').value;
    if (!text.trim()) { toast('先粘贴点文字进来'); return; }
    processInvoiceText(text);
  }

  function clearAll() {
    if (state.records.length === 0) { toast('本来就是空的'); return; }
    var ok = window.confirm('确定清空全部 ' + state.records.length + ' 笔记录吗？\n这个操作不能撤销，建议先导出 CSV 备份。');
    if (!ok) return;
    state.records = [];
    state.filters = { period: 'all', direction: 'all', category: 'all', invoiceType: 'all', keyword: '' };
    el.filterKeyword.value = '';
    persistRecords();
    resetForm();
    render();
    toast('已清空');
  }

  // ---------- 事件绑定 ----------

  function bind() {
    el.form.addEventListener('submit', handleSubmit);
    el.cancelEdit.addEventListener('click', function () { resetForm(); });

    el.form.querySelectorAll('input[name="direction"]').forEach(function (input) {
      input.addEventListener('change', function () { renderCategoryHelpers(); renderTaxPreview(); });
    });

    el.category.addEventListener('input', function () { setFieldError('category', ''); renderCategoryHelpers(); });
    el.grossAmount.addEventListener('input', function () { setFieldError('grossAmount', ''); renderTaxPreview(); });
    el.taxRate.addEventListener('input', function () { setFieldError('taxRate', ''); renderRateChips(); renderTaxPreview(); });
    el.date.addEventListener('input', function () { setFieldError('date', ''); });
    el.counterparty.addEventListener('input', function () { setFieldError('counterparty', ''); });
    el.invoiceNo.addEventListener('input', function () { setFieldError('invoiceNo', ''); });

    el.filterPeriod.addEventListener('change', function () { state.filters.period = this.value; render(); });
    el.filterDirection.addEventListener('change', function () { state.filters.direction = this.value; render(); });
    el.filterCategory.addEventListener('change', function () { state.filters.category = this.value; render(); });
    el.filterInvoice.addEventListener('change', function () { state.filters.invoiceType = this.value; render(); });

    var searchTimer = null;
    el.filterKeyword.addEventListener('input', function () {
      var value = this.value;
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(function () { state.filters.keyword = value; render(); }, 150);
    });

    el.vatPeriodSelect.addEventListener('change', function () { state.vatPeriod = this.value; renderVatReport(); renderInvoiceReport(); });
    el.citYearSelect.addEventListener('change', function () { state.citYear = this.value; renderCitReport(); });

    el.settingsToggle.addEventListener('click', function () {
      var expanded = el.settingsToggle.getAttribute('aria-expanded') === 'true';
      el.settingsToggle.setAttribute('aria-expanded', String(!expanded));
      el.settingsBody.hidden = expanded;
    });
    document.querySelectorAll('input[name="taxpayerType"]').forEach(function (input) {
      input.addEventListener('change', toggleSettingsFieldsByType);
    });
    $('settings-save').addEventListener('click', saveSettingsFromForm);

    $('export-csv').addEventListener('click', exportCSV);
    $('import-csv').addEventListener('click', function () { el.fileInput.click(); });
    el.fileInput.addEventListener('change', function () {
      if (this.files && this.files[0]) importCSV(this.files[0]);
      this.value = '';
    });
    $('clear-all').addEventListener('click', clearAll);

    $('import-invoice').addEventListener('click', function () { $('invoice-file-input').click(); });
    $('invoice-file-input').addEventListener('change', function () {
      if (this.files && this.files[0]) handleInvoicePDF(this.files[0]);
      this.value = '';
    });
    $('invoice-import-close').addEventListener('click', hideInvoiceImportCard);
    $('invoice-paste-parse').addEventListener('click', handleInvoicePaste);
    $('invoice-paste-open').addEventListener('click', function () {
      showInvoiceImportCard();
      $('invoice-paste-fallback').open = true;
      $('invoice-paste-text').focus();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state.editingId) resetForm();
    });
  }

  // ---------- 启动 ----------

  function init() {
    state.records = Store.loadRecords();
    state.settings = Store.loadSettings();
    if (!Store.isAvailable()) $('storage-warning').hidden = false;
    bind();
    fillSettingsForm(state.settings);
    resetForm();
    render();
  }

  window.LedgerApp = { init: init, getState: function () { return state; } };

  init();
})();
