const test = require('node:test');
const assert = require('node:assert');
const L = require('../js/core.js');

const settingsSmall = Object.assign({}, L.EXAMPLE_SETTINGS, { taxpayerType: 'small' });
const settingsGeneral = Object.assign({}, L.EXAMPLE_SETTINGS, { taxpayerType: 'general' });

const tx = (over = {}) => Object.assign({
  id: 'x' + Math.random().toString(36).slice(2),
  direction: 'income',
  category: '主营业务收入',
  counterparty: '',
  invoiceType: 'none',
  invoiceNo: '',
  taxRate: 0,
  grossAmount: 10000,
  netAmount: 10000,
  taxAmount: 0,
  deductible: false,
  date: '2026-08-01',
  note: '',
  createdAt: 1
}, over);

// ---------- 金额与税额拆分 ----------

test('parseAmount 接受常见写法、拒绝非法输入', () => {
  assert.strictEqual(L.parseAmount('1234.56'), 123456);
  assert.strictEqual(L.parseAmount('1,234.56'), 123456);
  ['', 'abc', '-5', '.', null].forEach((bad) => assert.strictEqual(L.parseAmount(bad), null));
});

test('parseRate 限定在 0~100，支持小数', () => {
  assert.strictEqual(L.parseRate(13), 13);
  assert.strictEqual(L.parseRate('1.5'), 1.5);
  assert.strictEqual(L.parseRate(-1), null);
  assert.strictEqual(L.parseRate(101), null);
});

test('splitTax 按价税合计反推不含税金额与税额（13% 税率）', () => {
  // 价税合计 113 元，13% 税率 -> 不含税 100 元，税额 13 元
  const r = L.splitTax(11300, 13);
  assert.strictEqual(r.net, 10000);
  assert.strictEqual(r.tax, 1300);
});

test('splitTax 舍入后金额与税额相加仍等于价税合计', () => {
  // 挑一个除不尽的金额验证舍入一致性
  const gross = 12345;
  const r = L.splitTax(gross, 9);
  assert.strictEqual(r.net + r.tax, gross);
});

test('splitTax 税率为 0 时不含税金额等于价税合计', () => {
  const r = L.splitTax(5000, 0);
  assert.deepStrictEqual(r, { net: 5000, tax: 0 });
});

// ---------- 日期与期间 ----------

test('quarterOf 正确归季度', () => {
  assert.strictEqual(L.quarterOf('2026-01-15'), '2026-Q1');
  assert.strictEqual(L.quarterOf('2026-03-31'), '2026-Q1');
  assert.strictEqual(L.quarterOf('2026-04-01'), '2026-Q2');
  assert.strictEqual(L.quarterOf('2026-12-31'), '2026-Q4');
});

test('periodKeyOf 按 periodType 切换月/季度', () => {
  assert.strictEqual(L.periodKeyOf('2026-08-15', 'month'), '2026-08');
  assert.strictEqual(L.periodKeyOf('2026-08-15', 'quarter'), '2026-Q3');
});

test('quarterMonths 展开季度包含的三个月', () => {
  assert.deepStrictEqual(L.quarterMonths('2026-Q3'), ['2026-07', '2026-08', '2026-09']);
});

// ---------- 抵扣判定 ----------

test('isDeductible：只有一般纳税人 + 支出 + 专票才可抵扣', () => {
  assert.strictEqual(L.isDeductible('expense', 'special', 'general'), true);
  assert.strictEqual(L.isDeductible('expense', 'special', 'small'), false, '小规模纳税人不能抵扣');
  assert.strictEqual(L.isDeductible('expense', 'general', 'general'), false, '普通发票不能抵扣');
  assert.strictEqual(L.isDeductible('income', 'special', 'general'), false, '收入方向不适用抵扣');
});

// ---------- 校验与创建 ----------

test('validateTransaction 逐项报错', () => {
  const r = L.validateTransaction({ direction: 'nope', grossAmount: '0', category: '', date: 'bad', taxRate: 200 }, settingsSmall);
  assert.ok(!r.ok);
  assert.deepStrictEqual(
    Object.keys(r.errors).sort(),
    ['category', 'date', 'direction', 'grossAmount', 'taxRate']
  );
});

test('createTransaction 生成派生字段：净额、税额、是否可抵扣', () => {
  const r = L.createTransaction({
    direction: 'expense', grossAmount: '1130', category: '采购成本',
    date: '2026-08-01', taxRate: 13, invoiceType: 'special'
  }, settingsGeneral);
  assert.ok(r.ok);
  assert.strictEqual(r.value.netAmount, 100000);
  assert.strictEqual(r.value.taxAmount, 13000);
  assert.strictEqual(r.value.deductible, true);
  assert.match(r.value.id, /^r/);
});

test('createTransaction 小规模纳税人下专票支出不可抵扣', () => {
  const r = L.createTransaction({
    direction: 'expense', grossAmount: '1130', category: '采购成本',
    date: '2026-08-01', taxRate: 13, invoiceType: 'special'
  }, settingsSmall);
  assert.strictEqual(r.value.deductible, false);
});

// ---------- 汇总 ----------

test('summarize 累计收入/支出/利润', () => {
  const s = L.summarize([
    tx({ direction: 'income', grossAmount: 113000, netAmount: 100000, taxAmount: 13000 }),
    tx({ direction: 'expense', grossAmount: 56500, netAmount: 50000, taxAmount: 6500 })
  ]);
  assert.strictEqual(s.incomeNet, 100000);
  assert.strictEqual(s.expenseNet, 50000);
  assert.strictEqual(s.profit, 50000);
});

test('groupByCategory 按不含税金额降序', () => {
  const groups = L.groupByCategory([
    tx({ direction: 'expense', category: '房租物业', netAmount: 3000 }),
    tx({ direction: 'expense', category: '办公费', netAmount: 1000 }),
    tx({ direction: 'income', category: '主营业务收入', netAmount: 99999 })
  ], 'expense');
  assert.deepStrictEqual(groups.map((g) => g.category), ['房租物业', '办公费']);
});

// ---------- 增值税：小规模纳税人 ----------

test('小规模纳税人：达到起征点时按征收率征税', () => {
  const records = [tx({ date: '2026-08-10', netAmount: 20000000, grossAmount: 20000000, taxAmount: 0 })];
  const r = L.vatCalc(records, settingsSmall, '2026-08', 'month');
  assert.strictEqual(r.taxpayerType, 'small');
  assert.strictEqual(r.belowThreshold, false);
  assert.strictEqual(r.payable, Math.round(20000000 * settingsSmall.vatSmallRate / 100));
});

test('小规模纳税人：未达起征点免征', () => {
  const records = [tx({ date: '2026-08-10', netAmount: 500000, grossAmount: 500000, taxAmount: 0 })];
  const r = L.vatCalc(records, settingsSmall, '2026-08', 'month');
  assert.strictEqual(r.belowThreshold, true);
  assert.strictEqual(r.payable, 0);
});

test('小规模纳税人：只统计当期收入，不看支出', () => {
  const records = [
    tx({ direction: 'income', date: '2026-08-10', netAmount: 20000000 }),
    tx({ direction: 'expense', date: '2026-08-10', netAmount: 99999999, taxAmount: 9999 })
  ];
  const r = L.vatCalc(records, settingsSmall, '2026-08', 'month');
  assert.strictEqual(r.netSales, 20000000);
});

// ---------- 增值税：一般纳税人 ----------

test('一般纳税人：销项减进项，含期初留抵', () => {
  const settings = Object.assign({}, settingsGeneral, { vatOpeningCredit: 500 });
  const records = [
    tx({ direction: 'income', date: '2026-08-05', taxAmount: 13000 }),
    tx({ direction: 'expense', date: '2026-08-06', taxAmount: 6000, deductible: true }),
    tx({ direction: 'expense', date: '2026-08-07', taxAmount: 9999, deductible: false }) // 不可抵扣的不计入
  ];
  const r = L.vatCalc(records, settings, '2026-08', 'month');
  assert.strictEqual(r.outputTax, 13000);
  assert.strictEqual(r.inputTax, 6000);
  assert.strictEqual(r.availableCredit, 6500);
  assert.strictEqual(r.payable, 6500);
  assert.strictEqual(r.closingCredit, 0);
});

test('一般纳税人：进项大于销项时本期不缴税，结余结转为留抵', () => {
  const records = [
    tx({ direction: 'income', date: '2026-08-05', taxAmount: 1000 }),
    tx({ direction: 'expense', date: '2026-08-06', taxAmount: 4000, deductible: true })
  ];
  const r = L.vatCalc(records, settingsGeneral, '2026-08', 'month');
  assert.strictEqual(r.payable, 0);
  assert.strictEqual(r.closingCredit, 3000);
});

test('一般纳税人：只按当期筛选，不跨期混算', () => {
  const records = [
    tx({ direction: 'income', date: '2026-07-05', taxAmount: 9999 }),
    tx({ direction: 'income', date: '2026-08-05', taxAmount: 1000 })
  ];
  const r = L.vatCalc(records, settingsGeneral, '2026-08', 'month');
  assert.strictEqual(r.outputTax, 1000);
});

// ---------- 附加税 ----------

test('surtaxCalc 按应纳增值税乘以合计比例', () => {
  const r = L.surtaxCalc(10000, settingsGeneral);
  assert.strictEqual(r.amount, Math.round(10000 * settingsGeneral.surtaxRate / 100));
});

// ---------- 企业所得税：阶梯税率 ----------

test('bracketTax 跨档时逐档计算，不是整笔套最高档', () => {
  const brackets = [{ upTo: 1000, rate: 5 }, { upTo: null, rate: 25 }];
  const r = L.bracketTax(1500, brackets);
  // 前 1000 按 5% = 50，超出的 500 按 25% = 125，合计 175
  assert.strictEqual(r.tax, 175);
  assert.strictEqual(r.detail.length, 2);
});

test('bracketTax 未超过第一档时只有一档生效', () => {
  const brackets = [{ upTo: 1000, rate: 5 }, { upTo: null, rate: 25 }];
  const r = L.bracketTax(600, brackets);
  assert.strictEqual(r.tax, 30);
  assert.strictEqual(r.detail.length, 1);
});

test('citCalc：利润为负时应纳税所得额按 0 处理', () => {
  const records = [
    tx({ direction: 'income', netAmount: 1000 }),
    tx({ direction: 'expense', netAmount: 5000 })
  ];
  const r = L.citCalc(records, settingsGeneral);
  assert.strictEqual(r.profit, -4000);
  assert.strictEqual(r.taxableIncome, 0);
  assert.strictEqual(r.tax, 0);
});

test('citCalc：正常盈利按阶梯税率算', () => {
  const records = [
    tx({ direction: 'income', netAmount: 500000 }),
    tx({ direction: 'expense', netAmount: 100000 })
  ];
  const r = L.citCalc(records, settingsGeneral);
  assert.strictEqual(r.taxableIncome, 400000);
  assert.strictEqual(r.tax, Math.round(400000 * settingsGeneral.citBrackets[0].rate / 100));
});

// ---------- 扣除限额提示（仅供参考） ----------

test('deductionAdvisory 算业务招待费孰低限额', () => {
  const settings = settingsGeneral;
  const records = [
    tx({ direction: 'income', netAmount: 1000000 }),
    tx({ direction: 'expense', category: '业务招待费', netAmount: 10000 })
  ];
  const advisories = L.deductionAdvisory(records, settings);
  const item = advisories.find((a) => a.category === '业务招待费');
  const byRate = Math.round(10000 * settings.entertainmentDeductRate / 100); // 6000
  const byRevenue = Math.round(1000000 * settings.entertainmentRevenueCap / 100); // 5000
  assert.strictEqual(item.cap, Math.min(byRate, byRevenue));
  assert.strictEqual(item.excess, 10000 - Math.min(byRate, byRevenue));
});

test('deductionAdvisory 没有对应科目支出时不报告', () => {
  const records = [tx({ direction: 'income', netAmount: 1000000 })];
  assert.deepStrictEqual(L.deductionAdvisory(records, settingsGeneral), []);
});

// ---------- 筛选 ----------

test('filterRecords 按期间、方向、发票类型、关键词组合筛选', () => {
  const list = [
    tx({ date: '2026-08-01', category: '主营业务收入', counterparty: 'A公司', invoiceType: 'special' }),
    tx({ date: '2026-08-05', direction: 'expense', category: '办公费', counterparty: 'B商店', invoiceType: 'general' }),
    tx({ date: '2026-07-20', category: '主营业务收入', counterparty: 'C公司', invoiceType: 'none' })
  ];
  assert.strictEqual(L.filterRecords(list, { period: '2026-08', periodType: 'month' }).length, 2);
  assert.strictEqual(L.filterRecords(list, { direction: 'expense' }).length, 1);
  assert.strictEqual(L.filterRecords(list, { invoiceType: 'special' }).length, 1);
  assert.strictEqual(L.filterRecords(list, { keyword: 'B商店' }).length, 1);
});

test('availablePeriods 按 periodType 返回去重期间，倒序', () => {
  const list = [tx({ date: '2026-06-01' }), tx({ date: '2026-08-01' }), tx({ date: '2026-08-15' })];
  assert.deepStrictEqual(L.availablePeriods(list, 'month'), ['2026-08', '2026-06']);
});

// ---------- CSV ----------

test('CSV 往返不丢数据（含专票、往来单位）', () => {
  const list = [
    L.createTransaction({
      direction: 'income', grossAmount: '11300', category: '主营业务收入',
      counterparty: 'A公司', date: '2026-08-01', taxRate: 13, invoiceType: 'special', invoiceNo: 'NO-001', note: '八月销售'
    }, settingsGeneral).value,
    L.createTransaction({
      direction: 'expense', grossAmount: '565', category: '办公费',
      counterparty: '带,逗号"引号"', date: '2026-08-02', taxRate: 13, invoiceType: 'general'
    }, settingsGeneral).value
  ];
  const back = L.fromCSV(L.toCSV(list), settingsGeneral);
  assert.deepStrictEqual(back.errors, []);
  assert.strictEqual(back.records.length, 2);
  assert.deepStrictEqual(
    back.records.map((r) => [r.direction, r.grossAmount, r.category, r.counterparty, r.taxRate, r.invoiceType]),
    list.map((r) => [r.direction, r.grossAmount, r.category, r.counterparty, r.taxRate, r.invoiceType])
  );
});

test('fromCSV 跳过坏行并报出行号', () => {
  const csv = [
    '日期,方向,科目,往来单位,价税合计,税率(%),发票类型,发票号,备注',
    '2026-08-01,支出,办公费,B商店,113.00,13,普通发票,,打印纸',
    '2026-08-02,支出,办公费,B商店,乱写,13,普通发票,,坏金额',
    '2026-99-99,收入,主营业务收入,A公司,100,13,增值税专用发票,,坏日期'
  ].join('\n');
  const out = L.fromCSV(csv, settingsGeneral);
  assert.strictEqual(out.records.length, 1);
  assert.deepStrictEqual(out.errors.map((e) => e.line), [3, 4]);
});

test('mergeRecords 按 id 去重且保留原有的', () => {
  const a = tx({ id: 'same', note: '原有' });
  const b = tx({ id: 'same', note: '导入' });
  const c = tx({ id: 'new' });
  const merged = L.mergeRecords([a], [b, c]);
  assert.strictEqual(merged.length, 2);
  assert.strictEqual(merged[0].note, '原有');
});

// ---------- 税务参数校验 ----------

const settingsFormInput = () => ({
  taxpayerType: 'general',
  period: 'month',
  vatSmallRate: '1',
  vatSmallThresholdMonth: '100000',
  vatSmallThresholdQuarter: '300000',
  vatOpeningCredit: '0',
  surtaxRate: '12',
  citBracketCap: '3000000',
  citLowRate: '5',
  citHighRate: '25',
  entertainmentDeductRate: '60',
  entertainmentRevenueCap: '0.5',
  adRevenueCap: '15'
});

test('validateSettings 接受合法输入并组装 citBrackets', () => {
  const r = L.validateSettings(settingsFormInput());
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.deepStrictEqual(r.value.citBrackets, [
    { upTo: 300000000, rate: 5 },
    { upTo: null, rate: 25 }
  ]);
});

test('validateSettings 拒绝超范围税率', () => {
  const bad = Object.assign(settingsFormInput(), { vatSmallRate: '200' });
  const r = L.validateSettings(bad);
  assert.ok(!r.ok);
  assert.ok(r.errors.vatSmallRate);
});

test('validateSettings 拒绝非法金额', () => {
  const bad = Object.assign(settingsFormInput(), { citBracketCap: 'abc' });
  const r = L.validateSettings(bad);
  assert.ok(!r.ok);
  assert.ok(r.errors.citBracketCap);
});

test('normalizeSettings 用示例值补全缺失字段', () => {
  const merged = L.normalizeSettings({ taxpayerType: 'general' });
  assert.strictEqual(merged.taxpayerType, 'general');
  assert.strictEqual(merged.surtaxRate, L.EXAMPLE_SETTINGS.surtaxRate);
  assert.ok(Array.isArray(merged.citBrackets) && merged.citBrackets.length === 2);
});

test('normalizeSettings 对 null/undefined 也不报错', () => {
  assert.deepStrictEqual(L.normalizeSettings(null), L.EXAMPLE_SETTINGS);
  assert.deepStrictEqual(L.normalizeSettings(undefined), L.EXAMPLE_SETTINGS);
});

// ---------- 发票 PDF 导入：文字解析 ----------

// 模拟 PDF.js 从这张示例发票里抽出来、拼接成一整段的文字（顺序未必和视觉版面
// 完全一致，但常见标签锚点都在）。
const SAMPLE_INVOICE_TEXT = [
  '电子发票（普通发票） 发票号码：26117000000453434782 开票日期：2026年03月21日',
  '购买方信息 名称：北京康益森医疗器械有限公司',
  '统一社会信用代码/纳税人识别号：91110116MADJM3C53N',
  '销售方信息 名称：海鸿达（北京）餐饮管理有限公司',
  '统一社会信用代码/纳税人识别号：91110302X695414934',
  '项目名称 规格型号 单位 数量 单价 金额 税率/征收率 税额',
  '*餐饮服务*餐费 1 242.09 242.09 6% 14.53',
  '*餐饮服务*餐费 -29.09 6% -1.75',
  '合 计 ¥213.00 ¥12.78',
  '价税合计（大写） 贰佰贰拾伍圆柒角捌分 （小写） ¥225.78',
  '开票人：钟杰'
].join(' ');

test('parseInvoiceText 提取发票号码、日期、发票类型', () => {
  const { fields } = L.parseInvoiceText(SAMPLE_INVOICE_TEXT, L.EXAMPLE_SETTINGS);
  assert.strictEqual(fields.invoiceNo, '26117000000453434782');
  assert.strictEqual(fields.date, '2026-03-21');
  assert.strictEqual(fields.invoiceType, 'general');
});

test('parseInvoiceText 按先后顺序把名称和税号配成买卖双方两组', () => {
  const { fields } = L.parseInvoiceText(SAMPLE_INVOICE_TEXT, L.EXAMPLE_SETTINGS);
  assert.strictEqual(fields.buyerName, '北京康益森医疗器械有限公司');
  assert.strictEqual(fields.buyerTaxId, '91110116MADJM3C53N');
  assert.strictEqual(fields.sellerName, '海鸿达（北京）餐饮管理有限公司');
  assert.strictEqual(fields.sellerTaxId, '91110302X695414934');
});

test('parseInvoiceText 名称和税号分两组出现（不是紧挨着）时配对依然正确', () => {
  // 有些排版会先把两个「名称」都画出来，再画两个「统一社会信用代码」
  const reordered = [
    '购买方信息 名称：北京康益森医疗器械有限公司',
    '销售方信息 名称：海鸿达（北京）餐饮管理有限公司',
    '统一社会信用代码/纳税人识别号：91110116MADJM3C53N',
    '统一社会信用代码/纳税人识别号：91110302X695414934'
  ].join(' ');
  const { fields } = L.parseInvoiceText(reordered, L.EXAMPLE_SETTINGS);
  assert.strictEqual(fields.buyerTaxId, '91110116MADJM3C53N');
  assert.strictEqual(fields.sellerTaxId, '91110302X695414934');
});

test('parseInvoiceText 本方是购买方时，方向判定为支出，往来单位是销售方', () => {
  const settings = Object.assign({}, L.EXAMPLE_SETTINGS, { myTaxId: '91110116MADJM3C53N' });
  const { fields, warnings } = L.parseInvoiceText(SAMPLE_INVOICE_TEXT, settings);
  assert.strictEqual(fields.direction, 'expense');
  assert.strictEqual(fields.counterparty, '海鸿达（北京）餐饮管理有限公司');
  assert.ok(!warnings.some((w) => w.includes('无法判断')));
});

test('parseInvoiceText 本方是销售方时，方向判定为收入，往来单位是购买方', () => {
  const settings = Object.assign({}, L.EXAMPLE_SETTINGS, { myTaxId: '91110302x695414934' }); // 大小写不敏感
  const { fields } = L.parseInvoiceText(SAMPLE_INVOICE_TEXT, settings);
  assert.strictEqual(fields.direction, 'income');
  assert.strictEqual(fields.counterparty, '北京康益森医疗器械有限公司');
});

test('parseInvoiceText 没设置本方纳税人识别号时不猜方向，并给出提示', () => {
  const { fields, warnings } = L.parseInvoiceText(SAMPLE_INVOICE_TEXT, L.EXAMPLE_SETTINGS);
  assert.strictEqual(fields.direction, null);
  assert.ok(warnings.some((w) => w.includes('无法判断')));
});

test('parseInvoiceText 提取价税合计小写金额（分）', () => {
  const { fields } = L.parseInvoiceText(SAMPLE_INVOICE_TEXT, L.EXAMPLE_SETTINGS);
  assert.strictEqual(fields.grossAmount, 22578);
});

test('parseInvoiceText 找不到小写金额时，退回合计金额+税额相加', () => {
  const noXiaoxie = SAMPLE_INVOICE_TEXT.replace(/价税合计（大写）[\s\S]*$/, '合 计 ¥213.00 ¥12.78');
  const { fields } = L.parseInvoiceText(noXiaoxie, L.EXAMPLE_SETTINGS);
  assert.strictEqual(fields.grossAmount, 22578);
});

test('parseInvoiceText 单一税率时直接采用，不产生多档提示', () => {
  const { fields, warnings } = L.parseInvoiceText(SAMPLE_INVOICE_TEXT, L.EXAMPLE_SETTINGS);
  assert.strictEqual(fields.taxRate, 6);
  assert.ok(!warnings.some((w) => w.includes('不止一档')));
});

test('parseInvoiceText 多档税率时取出现最多的一档，并给出提示', () => {
  const mixedRate = SAMPLE_INVOICE_TEXT.replace('*餐饮服务*餐费 -29.09 6% -1.75', '*办公用品*文具 100.00 13% 13.00');
  const { fields, warnings } = L.parseInvoiceText(mixedRate, L.EXAMPLE_SETTINGS);
  assert.strictEqual(fields.taxRate, 6); // 6% 出现两次，13% 一次
  assert.ok(warnings.some((w) => w.includes('不止一档')));
});

test('parseInvoiceText 提取项目名称并据此猜科目', () => {
  const { fields } = L.parseInvoiceText(SAMPLE_INVOICE_TEXT, L.EXAMPLE_SETTINGS);
  assert.strictEqual(fields.itemNote, '餐饮服务');
  assert.strictEqual(fields.category, '业务招待费');
});

test('parseInvoiceText 增值税专用发票能识别出发票类型', () => {
  const special = SAMPLE_INVOICE_TEXT.replace('电子发票（普通发票）', '电子发票（增值税专用发票）');
  const { fields } = L.parseInvoiceText(special, L.EXAMPLE_SETTINGS);
  assert.strictEqual(fields.invoiceType, 'special');
});

test('parseInvoiceText 空文本时优雅退化，每个字段都给出未找到的提示', () => {
  const { fields, warnings } = L.parseInvoiceText('', L.EXAMPLE_SETTINGS);
  assert.strictEqual(fields.invoiceNo, null);
  assert.strictEqual(fields.grossAmount, null);
  assert.ok(warnings.length >= 4);
});

test('guessCategory 覆盖不到的项目名称返回空字符串，不瞎猜', () => {
  assert.strictEqual(L.guessCategory(['某种从没见过的服务']), '');
});
