/**
 * 记账 + 报税测算核心逻辑：纯函数，不碰 DOM、不碰存储。
 * 浏览器里挂到 window.Ledger，Node 里 require 拿到同一个对象，方便测试。
 *
 * 两条贯穿全文件的规则：
 *
 * 1. 金额一律以「分」为单位的整数保存。浮点数做钱的加减会有
 *    0.1 + 0.2 !== 0.3 这类误差，记多了肯定对不上账。
 *
 * 2. 本文件不允许出现任何写死的「现行政策」数字（税率、起征点、优惠幅度）。
 *    所有这类参数都通过调用方传入的 settings 对象给出，默认值只在 UI 层
 *    以「示例值，请核实最新政策」的样子出现。中国的增值税征收率、小微企业
 *    所得税优惠、起征点几乎每年都在调，写死在逻辑里过一阵就是错的。
 *
 * 这个工具算的是「测算」——用于自己核对、给会计提供数据、辅助决策，
 * 不是官方申报系统，也不追求覆盖全部纳税调整规则。复杂的限额扣除、
 * 亏损结转、跨年度事项都在文档里明确说了没做，而不是悄悄假装做了。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Ledger = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DIRECTIONS = ['income', 'expense'];
  var INVOICE_TYPES = ['none', 'general', 'special']; // 无票 / 普通发票 / 增值税专用发票
  var TAXPAYER_TYPES = ['small', 'general']; // 小规模纳税人 / 一般纳税人
  var PERIOD_TYPES = ['month', 'quarter'];

  var DEFAULT_CATEGORIES = {
    income: ['主营业务收入', '其他业务收入', '利息收入', '其他收入'],
    expense: [
      '主营业务成本', '采购成本', '人员薪酬', '社保公积金', '房租物业',
      '水电网络', '办公费', '交通费', '业务招待费', '广告宣传费',
      '咨询服务费', '折旧摊销', '税金及附加', '财务费用', '其他费用'
    ]
  };

  var COMMON_RATES = [13, 9, 6, 5, 3, 1, 0];

  /**
   * 一套「示例」税务参数——数值仅供界面展示默认值和测试用，
   * 不代表当前有效政策。UI 层永远要在旁边提示核实。
   */
  var EXAMPLE_SETTINGS = {
    taxpayerType: 'small',
    period: 'month',
    vatSmallRate: 1, // 小规模纳税人增值税征收率（示例，政策常在 1% / 3% 间调整）
    vatSmallThresholdMonth: 10000000, // 月不含税销售额起征点，示例 10 万元（单位：分）
    vatSmallThresholdQuarter: 30000000, // 季度起征点，示例 30 万元
    vatOpeningCredit: 0, // 一般纳税人期初留抵税额（分）
    surtaxRate: 12, // 城建税 + 教育费附加 + 地方教育费附加 合计比例（示例，各地不同）
    citBrackets: [
      { upTo: 300000000, rate: 5 }, // 示例：应纳税所得额 300 万元（=300,000,000 分）以下部分
      { upTo: null, rate: 25 }
    ],
    entertainmentDeductRate: 60, // 业务招待费按发生额的比例可扣除（示例 60%）
    entertainmentRevenueCap: 0.5, // 业务招待费扣除上限＝收入的该比例（示例 0.5%）
    adRevenueCap: 15 // 广告宣传费扣除上限＝收入的该比例（示例 15%，行业不同差异很大）
  };

  // ---------- 金额 ----------

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

  function parseRate(input) {
    var n = typeof input === 'number' ? input : parseFloat(String(input).trim());
    if (!isFinite(n) || n < 0 || n > 100) return null;
    return Math.round(n * 1000) / 1000; // 最多保留三位小数，够用又不会有诡异的浮点尾数
  }

  /**
   * 由价税合计（发票上写的实际收付金额）按税率反推不含税金额和税额。
   * 这是增值税专用发票上「金额 + 税额 = 价税合计」的逆运算。
   */
  function splitTax(grossCents, ratePercent) {
    var rate = ratePercent / 100;
    var net = Math.round(grossCents / (1 + rate));
    var tax = grossCents - net;
    return { net: net, tax: tax };
  }

  // ---------- 日期 ----------

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

  /** 日期所在季度，如 '2026-Q3'。 */
  function quarterOf(dateString) {
    var year = String(dateString).slice(0, 4);
    var month = Number(String(dateString).slice(5, 7));
    var q = Math.ceil(month / 3);
    return year + '-Q' + q;
  }

  /** periodType 是 'month' 还是 'quarter'，取对应的分组 key。 */
  function periodKeyOf(dateString, periodType) {
    return periodType === 'quarter' ? quarterOf(dateString) : monthOf(dateString);
  }

  /** 季度 key（'2026-Q3'）第一天到最后一天，用于换算成月份范围时展示。 */
  function quarterMonths(quarterKey) {
    var year = quarterKey.slice(0, 4);
    var q = Number(quarterKey.slice(6));
    var start = (q - 1) * 3 + 1;
    return [start, start + 1, start + 2].map(function (m) {
      return year + '-' + String(m).padStart(2, '0');
    });
  }

  // ---------- 是否可抵扣进项 ----------

  /**
   * 小规模纳税人不能抵扣进项税额（特殊情形如放弃减免、异常凭证等不在此列，
   * 需要用户自行核实）；一般纳税人取得专用发票的支出默认可抵扣。
   */
  function isDeductible(direction, invoiceType, taxpayerType) {
    if (direction !== 'expense') return false;
    if (taxpayerType !== 'general') return false;
    return invoiceType === 'special';
  }

  // ---------- 校验与创建 ----------

  function validateTransaction(input, settings) {
    var errors = {};
    var raw = input || {};
    var taxpayerType = (settings && settings.taxpayerType) || 'small';

    if (DIRECTIONS.indexOf(raw.direction) === -1) errors.direction = '请选择收入或支出';

    var gross = parseAmount(raw.grossAmount);
    if (gross === null) errors.grossAmount = '金额格式不对，例如 1000.00';
    else if (gross <= 0) errors.grossAmount = '金额要大于 0';
    else if (gross > 999999999999) errors.grossAmount = '金额太大了';

    var rate = parseRate(raw.taxRate == null || raw.taxRate === '' ? 0 : raw.taxRate);
    if (rate === null) errors.taxRate = '税率应为 0~100 之间的数字';

    var invoiceType = raw.invoiceType || 'none';
    if (INVOICE_TYPES.indexOf(invoiceType) === -1) errors.invoiceType = '发票类型不对';

    var category = String(raw.category == null ? '' : raw.category).trim();
    if (category === '') errors.category = '请填写科目';
    else if (category.length > 20) errors.category = '科目最多 20 个字';

    var date = String(raw.date == null ? '' : raw.date).trim();
    if (!isValidDate(date)) errors.date = '日期格式应为 YYYY-MM-DD';

    var counterparty = String(raw.counterparty == null ? '' : raw.counterparty).trim();
    if (counterparty.length > 60) errors.counterparty = '往来单位最多 60 个字';

    var invoiceNo = String(raw.invoiceNo == null ? '' : raw.invoiceNo).trim();
    if (invoiceNo.length > 40) errors.invoiceNo = '发票号最多 40 个字';

    var note = String(raw.note == null ? '' : raw.note).trim();
    if (note.length > 200) errors.note = '备注最多 200 个字';

    var ok = Object.keys(errors).length === 0;
    if (!ok) return { ok: false, errors: errors, value: null };

    var split = splitTax(gross, rate);
    return {
      ok: true,
      errors: {},
      value: {
        direction: raw.direction,
        date: date,
        category: category,
        counterparty: counterparty,
        invoiceType: invoiceType,
        invoiceNo: invoiceNo,
        taxRate: rate,
        grossAmount: gross,
        netAmount: split.net,
        taxAmount: split.tax,
        deductible: isDeductible(raw.direction, invoiceType, taxpayerType),
        note: note
      }
    };
  }

  function makeId(now, random) {
    var t = (now || Date.now()).toString(36);
    var r = Math.floor((random == null ? Math.random() : random) * 1e8).toString(36);
    return 'r' + t + r;
  }

  function createTransaction(input, settings, now) {
    var result = validateTransaction(input, settings);
    if (!result.ok) return result;
    var stamp = now || Date.now();
    result.value.id = input.id || makeId(stamp);
    result.value.createdAt = input.createdAt || stamp;
    return result;
  }

  // ---------- 汇总与筛选 ----------

  function summarize(records) {
    var s = {
      incomeGross: 0, incomeNet: 0, incomeTax: 0,
      expenseGross: 0, expenseNet: 0, expenseTax: 0,
      count: (records || []).length
    };
    (records || []).forEach(function (r) {
      if (r.direction === 'income') {
        s.incomeGross += r.grossAmount; s.incomeNet += r.netAmount; s.incomeTax += r.taxAmount;
      } else {
        s.expenseGross += r.grossAmount; s.expenseNet += r.netAmount; s.expenseTax += r.taxAmount;
      }
    });
    // 简化的账面利润：不含税收入 - 不含税成本费用。未考虑纳税调整事项。
    s.profit = s.incomeNet - s.expenseNet;
    return s;
  }

  function groupByCategory(records, direction) {
    var totals = {};
    var sum = 0;
    (records || []).forEach(function (r) {
      if (direction && r.direction !== direction) return;
      totals[r.category] = (totals[r.category] || 0) + r.netAmount;
      sum += r.netAmount;
    });
    return Object.keys(totals)
      .map(function (category) {
        return { category: category, total: totals[category], ratio: sum === 0 ? 0 : totals[category] / sum };
      })
      .sort(function (a, b) { return b.total - a.total || (a.category < b.category ? -1 : 1); });
  }

  function filterRecords(records, filters) {
    var f = filters || {};
    var keyword = (f.keyword || '').trim().toLowerCase();
    return (records || [])
      .filter(function (r) {
        if (f.period && f.period !== 'all') {
          var key = periodKeyOf(r.date, f.periodType || 'month');
          if (key !== f.period) return false;
        }
        if (f.direction && f.direction !== 'all' && r.direction !== f.direction) return false;
        if (f.category && f.category !== 'all' && r.category !== f.category) return false;
        if (f.invoiceType && f.invoiceType !== 'all' && r.invoiceType !== f.invoiceType) return false;
        if (keyword) {
          var hay = (r.category + ' ' + r.counterparty + ' ' + (r.note || '') + ' ' + (r.invoiceNo || '')).toLowerCase();
          if (hay.indexOf(keyword) === -1) return false;
        }
        return true;
      })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }

  /** 记录里出现过的period（月或季度）key，倒序。 */
  function availablePeriods(records, periodType) {
    var seen = {};
    (records || []).forEach(function (r) { seen[periodKeyOf(r.date, periodType)] = true; });
    return Object.keys(seen).sort().reverse();
  }

  // ---------- 增值税测算 ----------

  /** 小规模纳税人：不含税销售额 × 征收率；未达起征点则免征。 */
  function vatSmallScale(records, settings, periodKey, periodType) {
    var incomeRecords = (records || []).filter(function (r) {
      return r.direction === 'income' && periodKeyOf(r.date, periodType) === periodKey;
    });
    var netSales = incomeRecords.reduce(function (sum, r) { return sum + r.netAmount; }, 0);
    var threshold = periodType === 'quarter'
      ? settings.vatSmallThresholdQuarter
      : settings.vatSmallThresholdMonth;
    var belowThreshold = netSales < threshold;
    var payable = belowThreshold ? 0 : Math.round(netSales * settings.vatSmallRate / 100);
    return {
      taxpayerType: 'small',
      netSales: netSales,
      rate: settings.vatSmallRate,
      threshold: threshold,
      belowThreshold: belowThreshold,
      payable: payable
    };
  }

  /**
   * 一般纳税人：销项税额 - 可抵扣进项税额（含期初留抵），
   * 差额为负则本期不缴税，结余部分结转为下期期初留抵。
   */
  function vatGeneralScale(records, settings, periodKey, periodType) {
    var periodRecords = (records || []).filter(function (r) {
      return periodKeyOf(r.date, periodType) === periodKey;
    });
    var outputTax = periodRecords
      .filter(function (r) { return r.direction === 'income'; })
      .reduce(function (sum, r) { return sum + r.taxAmount; }, 0);
    var inputTax = periodRecords
      .filter(function (r) { return r.direction === 'expense' && r.deductible; })
      .reduce(function (sum, r) { return sum + r.taxAmount; }, 0);

    var openingCredit = settings.vatOpeningCredit || 0;
    var availableCredit = openingCredit + inputTax;
    var payable = Math.max(0, outputTax - availableCredit);
    var closingCredit = Math.max(0, availableCredit - outputTax);

    return {
      taxpayerType: 'general',
      outputTax: outputTax,
      inputTax: inputTax,
      openingCredit: openingCredit,
      availableCredit: availableCredit,
      payable: payable,
      closingCredit: closingCredit
    };
  }

  function vatCalc(records, settings, periodKey, periodType) {
    return settings.taxpayerType === 'general'
      ? vatGeneralScale(records, settings, periodKey, periodType)
      : vatSmallScale(records, settings, periodKey, periodType);
  }

  /** 附加税（城建税+教育费附加+地方教育费附加），以本期应纳增值税为计税基础。 */
  function surtaxCalc(vatPayable, settings) {
    var amount = Math.round(vatPayable * (settings.surtaxRate || 0) / 100);
    return { base: vatPayable, rate: settings.surtaxRate || 0, amount: amount };
  }

  // ---------- 企业所得税测算 ----------

  /** 阶梯（分段）税率速算：每一档只对超过前一档上限的部分按该档税率计算。 */
  function bracketTax(amountCents, brackets) {
    var sorted = (brackets || []).slice().sort(function (a, b) {
      var ua = a.upTo == null ? Infinity : a.upTo;
      var ub = b.upTo == null ? Infinity : b.upTo;
      return ua - ub;
    });
    var lower = 0;
    var tax = 0;
    var detail = [];
    for (var i = 0; i < sorted.length; i++) {
      var upper = sorted[i].upTo == null ? Infinity : sorted[i].upTo;
      var portion = Math.max(0, Math.min(amountCents, upper) - lower);
      var portionTax = Math.round(portion * sorted[i].rate / 100);
      if (portion > 0) detail.push({ from: lower, to: Math.min(amountCents, upper), rate: sorted[i].rate, tax: portionTax });
      tax += portionTax;
      lower = upper;
      if (amountCents <= upper) break;
    }
    return { tax: tax, detail: detail };
  }

  /**
   * 企业所得税测算：利润（不含税收入 - 不含税成本费用）作为应纳税所得额的
   * 简化近似，未考虑任何纳税调整事项（如超标费用调增、免税收入调减等）——
   * 这类调整规则多且常变，测算只给一个未调整的参考数，实际申报以纳税调整
   * 后的数字为准。
   */
  function citCalc(records, settings) {
    var s = summarize(records);
    var taxableIncome = Math.max(0, s.profit); // 亏损年度应纳税所得额按 0 处理，不做以后年度弥补测算
    var result = bracketTax(taxableIncome, settings.citBrackets);
    return {
      revenue: s.incomeNet,
      costAndExpense: s.expenseNet,
      profit: s.profit,
      taxableIncome: taxableIncome,
      tax: result.tax,
      brackets: result.detail
    };
  }

  /**
   * 业务招待费 / 广告宣传费扣除限额——仅供参考，不改变企业所得税测算的
   * 应纳税所得额（真实申报需要走纳税调整表）。
   */
  function deductionAdvisory(records, settings) {
    var s = summarize(records);
    var revenue = s.incomeNet;
    var entertainment = groupByCategory(records, 'expense').find(function (g) { return g.category === '业务招待费'; });
    var ad = groupByCategory(records, 'expense').find(function (g) { return g.category === '广告宣传费'; });
    var advisories = [];

    if (entertainment && entertainment.total > 0) {
      var byRate = Math.round(entertainment.total * (settings.entertainmentDeductRate || 0) / 100);
      var byRevenue = Math.round(revenue * (settings.entertainmentRevenueCap || 0) / 100);
      var cap = Math.min(byRate, byRevenue);
      advisories.push({
        category: '业务招待费',
        spent: entertainment.total,
        cap: cap,
        excess: Math.max(0, entertainment.total - cap),
        rule: settings.entertainmentDeductRate + '% 与收入 ' + settings.entertainmentRevenueCap + '% 孰低'
      });
    }
    if (ad && ad.total > 0) {
      var adCap = Math.round(revenue * (settings.adRevenueCap || 0) / 100);
      advisories.push({
        category: '广告宣传费',
        spent: ad.total,
        cap: adCap,
        excess: Math.max(0, ad.total - adCap),
        rule: '收入的 ' + settings.adRevenueCap + '%'
      });
    }
    return advisories;
  }

  // ---------- 税务参数校验 ----------

  function parseNonNegativeAmount(input) {
    var cents = parseAmount(input);
    return cents !== null && cents >= 0 ? cents : null;
  }

  /**
   * 校验并规整税务参数面板的输入。企业所得税阶梯在界面上简化成两档
   * （低档上限 + 低档税率 + 高档税率），这里转成 citBrackets 数组。
   */
  function validateSettings(input) {
    var errors = {};
    var raw = input || {};

    if (TAXPAYER_TYPES.indexOf(raw.taxpayerType) === -1) errors.taxpayerType = '请选择纳税人类型';
    if (PERIOD_TYPES.indexOf(raw.period) === -1) errors.period = '请选择申报周期';

    var vatSmallRate = parseRate(raw.vatSmallRate);
    if (vatSmallRate === null) errors.vatSmallRate = '征收率应为 0~100 的数字';

    var vatThresholdMonth = parseNonNegativeAmount(raw.vatSmallThresholdMonth);
    if (vatThresholdMonth === null) errors.vatSmallThresholdMonth = '起征点金额不对';

    var vatThresholdQuarter = parseNonNegativeAmount(raw.vatSmallThresholdQuarter);
    if (vatThresholdQuarter === null) errors.vatSmallThresholdQuarter = '起征点金额不对';

    var vatOpeningCredit = parseNonNegativeAmount(raw.vatOpeningCredit == null || raw.vatOpeningCredit === '' ? 0 : raw.vatOpeningCredit);
    if (vatOpeningCredit === null) errors.vatOpeningCredit = '留抵税额不对';

    var surtaxRate = parseRate(raw.surtaxRate);
    if (surtaxRate === null) errors.surtaxRate = '附加税比例应为 0~100 的数字';

    var citCap = parseNonNegativeAmount(raw.citBracketCap);
    if (citCap === null) errors.citBracketCap = '分档上限金额不对';

    var citLowRate = parseRate(raw.citLowRate);
    if (citLowRate === null) errors.citLowRate = '税率应为 0~100 的数字';

    var citHighRate = parseRate(raw.citHighRate);
    if (citHighRate === null) errors.citHighRate = '税率应为 0~100 的数字';

    var entertainmentDeductRate = parseRate(raw.entertainmentDeductRate);
    if (entertainmentDeductRate === null) errors.entertainmentDeductRate = '比例应为 0~100 的数字';

    var entertainmentRevenueCap = parseRate(raw.entertainmentRevenueCap);
    if (entertainmentRevenueCap === null) errors.entertainmentRevenueCap = '比例应为 0~100 的数字';

    var adRevenueCap = parseRate(raw.adRevenueCap);
    if (adRevenueCap === null) errors.adRevenueCap = '比例应为 0~100 的数字';

    var ok = Object.keys(errors).length === 0;
    if (!ok) return { ok: false, errors: errors, value: null };

    return {
      ok: true,
      errors: {},
      value: {
        taxpayerType: raw.taxpayerType,
        period: raw.period,
        vatSmallRate: vatSmallRate,
        vatSmallThresholdMonth: vatThresholdMonth,
        vatSmallThresholdQuarter: vatThresholdQuarter,
        vatOpeningCredit: vatOpeningCredit,
        surtaxRate: surtaxRate,
        citBrackets: [
          { upTo: citCap, rate: citLowRate },
          { upTo: null, rate: citHighRate }
        ],
        entertainmentDeductRate: entertainmentDeductRate,
        entertainmentRevenueCap: entertainmentRevenueCap,
        adRevenueCap: adRevenueCap
      }
    };
  }

  /** 用示例值补全缺失字段，保证旧数据加载时不会因为少个字段就整体出错。 */
  function normalizeSettings(input) {
    var raw = input && typeof input === 'object' ? input : {};
    var merged = Object.assign({}, EXAMPLE_SETTINGS, raw);
    if (!Array.isArray(merged.citBrackets) || merged.citBrackets.length === 0) {
      merged.citBrackets = EXAMPLE_SETTINGS.citBrackets;
    }
    return merged;
  }

  // ---------- CSV ----------

  var CSV_HEADER = ['日期', '方向', '科目', '往来单位', '价税合计', '税率(%)', '发票类型', '发票号', '备注'];

  function escapeCSVField(value) {
    var text = String(value == null ? '' : value);
    if (/[",\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  var INVOICE_LABEL = { none: '无票', general: '普通发票', special: '增值税专用发票' };
  var INVOICE_LABEL_REVERSE = { '无票': 'none', '普通发票': 'general', '增值税专用发票': 'special', general: 'general', special: 'special', none: 'none' };

  function toCSV(records) {
    var lines = [CSV_HEADER.join(',')];
    (records || []).forEach(function (r) {
      lines.push([
        escapeCSVField(r.date),
        escapeCSVField(r.direction === 'income' ? '收入' : '支出'),
        escapeCSVField(r.category),
        escapeCSVField(r.counterparty || ''),
        escapeCSVField(formatAmount(r.grossAmount).replace(/,/g, '')),
        escapeCSVField(r.taxRate),
        escapeCSVField(INVOICE_LABEL[r.invoiceType] || '无票'),
        escapeCSVField(r.invoiceNo || ''),
        escapeCSVField(r.note || '')
      ].join(','));
    });
    return lines.join('\r\n');
  }

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
    return rows.filter(function (r) { return r.length > 1 || r[0].trim() !== ''; });
  }

  function fromCSV(text, settings, now) {
    var rows = parseCSV(text);
    var records = [];
    var errors = [];
    if (rows.length === 0) return { records: records, errors: errors };

    var start = rows[0][0] && rows[0][0].trim() === CSV_HEADER[0] ? 1 : 0;
    for (var i = start; i < rows.length; i++) {
      var cells = rows[i];
      var lineNo = i + 1;
      if (cells.length < 6) {
        errors.push({ line: lineNo, message: '列数不足，至少需要 日期,方向,科目,往来单位,价税合计,税率' });
        continue;
      }
      var directionText = (cells[1] || '').trim();
      var direction = directionText === '收入' || directionText === 'income'
        ? 'income'
        : (directionText === '支出' || directionText === 'expense' ? 'expense' : '');
      var invoiceTypeRaw = (cells[6] || '无票').trim();
      var invoiceType = INVOICE_LABEL_REVERSE[invoiceTypeRaw] || 'none';

      var result = createTransaction({
        direction: direction,
        date: (cells[0] || '').trim(),
        category: cells[2],
        counterparty: cells[3] || '',
        grossAmount: cells[4],
        taxRate: cells[5],
        invoiceType: invoiceType,
        invoiceNo: cells[7] || '',
        note: cells[8] || ''
      }, settings, now ? now + i : undefined);

      if (!result.ok) {
        var first = Object.keys(result.errors)[0];
        errors.push({ line: lineNo, message: result.errors[first] });
        continue;
      }
      records.push(result.value);
    }
    return { records: records, errors: errors };
  }

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
    DIRECTIONS: DIRECTIONS,
    INVOICE_TYPES: INVOICE_TYPES,
    TAXPAYER_TYPES: TAXPAYER_TYPES,
    PERIOD_TYPES: PERIOD_TYPES,
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    COMMON_RATES: COMMON_RATES,
    EXAMPLE_SETTINGS: EXAMPLE_SETTINGS,
    CSV_HEADER: CSV_HEADER,
    INVOICE_LABEL: INVOICE_LABEL,

    parseAmount: parseAmount,
    formatAmount: formatAmount,
    parseRate: parseRate,
    splitTax: splitTax,

    todayString: todayString,
    isValidDate: isValidDate,
    monthOf: monthOf,
    quarterOf: quarterOf,
    periodKeyOf: periodKeyOf,
    quarterMonths: quarterMonths,

    isDeductible: isDeductible,
    validateTransaction: validateTransaction,
    createTransaction: createTransaction,
    validateSettings: validateSettings,
    normalizeSettings: normalizeSettings,

    summarize: summarize,
    groupByCategory: groupByCategory,
    filterRecords: filterRecords,
    availablePeriods: availablePeriods,

    vatSmallScale: vatSmallScale,
    vatGeneralScale: vatGeneralScale,
    vatCalc: vatCalc,
    surtaxCalc: surtaxCalc,
    bracketTax: bracketTax,
    citCalc: citCalc,
    deductionAdvisory: deductionAdvisory,

    toCSV: toCSV,
    parseCSV: parseCSV,
    fromCSV: fromCSV,
    mergeRecords: mergeRecords
  };
});
