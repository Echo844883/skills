const test = require('node:test');
const assert = require('node:assert');
const L = require('../js/core.js');

const rec = (over = {}) => Object.assign({
  id: 'x' + Math.random().toString(36).slice(2),
  type: 'expense',
  amount: 1000,
  category: '餐饮',
  date: '2026-08-01',
  note: '',
  createdAt: 1
}, over);

test('parseAmount 接受常见写法', () => {
  assert.strictEqual(L.parseAmount('25.5'), 2550);
  assert.strictEqual(L.parseAmount('  12 '), 1200);
  assert.strictEqual(L.parseAmount('1,234.56'), 123456);
  assert.strictEqual(L.parseAmount('0.1'), 10);
  assert.strictEqual(L.parseAmount(0.07), 7);
});

test('parseAmount 拒绝非法输入', () => {
  ['', 'abc', '1.2.3', '-5', '.', '1e3', null, undefined].forEach((bad) => {
    assert.strictEqual(L.parseAmount(bad), null, `应拒绝 ${JSON.stringify(bad)}`);
  });
});

test('金额用整数分存储，不会累积浮点误差', () => {
  const total = [L.parseAmount('0.1'), L.parseAmount('0.2')].reduce((a, b) => a + b, 0);
  assert.strictEqual(total, 30);
  assert.strictEqual(L.formatAmount(total), '0.30');
});

test('formatAmount 千分位与符号', () => {
  assert.strictEqual(L.formatAmount(0), '0.00');
  assert.strictEqual(L.formatAmount(5), '0.05');
  assert.strictEqual(L.formatAmount(123456789), '1,234,567.89');
  assert.strictEqual(L.formatAmount(-2550), '-25.50');
  assert.strictEqual(L.formatAmount(2550, { sign: 'always' }), '+25.50');
});

test('isValidDate 拒绝不存在的日期', () => {
  assert.ok(L.isValidDate('2024-02-29'));
  assert.ok(!L.isValidDate('2026-02-29'));
  assert.ok(!L.isValidDate('2026-13-01'));
  assert.ok(!L.isValidDate('2026-8-1'));
});

test('validate 逐项报错', () => {
  const r = L.validate({ type: 'nope', amount: '0', category: '  ', date: 'bad', note: '' });
  assert.ok(!r.ok);
  assert.deepStrictEqual(
    Object.keys(r.errors).sort(),
    ['amount', 'category', 'date', 'type']
  );
});

test('createRecord 生成 id 并保留已有 id', () => {
  const a = L.createRecord({ type: 'income', amount: '100', category: '工资', date: '2026-08-01' });
  assert.ok(a.ok);
  assert.match(a.value.id, /^r/);
  assert.strictEqual(a.value.amount, 10000);

  const b = L.createRecord({ id: 'keep-me', type: 'income', amount: '1', category: '工资', date: '2026-08-01' });
  assert.strictEqual(b.value.id, 'keep-me');
});

test('summarize 算收支与结余', () => {
  const s = L.summarize([
    rec({ type: 'income', amount: 500000 }),
    rec({ type: 'expense', amount: 12345 }),
    rec({ type: 'expense', amount: 55 })
  ]);
  assert.deepStrictEqual(s, { income: 500000, expense: 12400, balance: 487600, count: 3 });
});

test('groupByCategory 按金额降序并给出占比', () => {
  const groups = L.groupByCategory([
    rec({ category: '餐饮', amount: 3000 }),
    rec({ category: '交通', amount: 1000 }),
    rec({ category: '餐饮', amount: 1000 }),
    rec({ category: '工资', amount: 99999, type: 'income' })
  ], 'expense');
  assert.deepStrictEqual(groups.map((g) => g.category), ['餐饮', '交通']);
  assert.strictEqual(groups[0].total, 4000);
  assert.strictEqual(groups[0].ratio, 0.8);
});

test('monthlyTrend 补齐没有记录的月份', () => {
  const trend = L.monthlyTrend([rec({ date: '2026-08-10', amount: 500 })], 3, '2026-08');
  assert.deepStrictEqual(trend.map((t) => t.month), ['2026-06', '2026-07', '2026-08']);
  assert.strictEqual(trend[0].expense, 0);
  assert.strictEqual(trend[2].expense, 500);
});

test('monthlyTrend 跨年不出错', () => {
  const trend = L.monthlyTrend([], 3, '2026-01');
  assert.deepStrictEqual(trend.map((t) => t.month), ['2025-11', '2025-12', '2026-01']);
});

test('filterRecords 组合筛选并按日期倒序', () => {
  const list = [
    rec({ date: '2026-08-01', category: '餐饮', note: '午饭' }),
    rec({ date: '2026-08-05', category: '交通', note: '地铁' }),
    rec({ date: '2026-07-30', category: '餐饮', note: '晚饭' }),
    rec({ date: '2026-08-03', category: '工资', type: 'income', note: '' })
  ];
  assert.deepStrictEqual(
    L.filterRecords(list, { month: '2026-08' }).map((r) => r.date),
    ['2026-08-05', '2026-08-03', '2026-08-01']
  );
  assert.strictEqual(L.filterRecords(list, { type: 'income' }).length, 1);
  assert.strictEqual(L.filterRecords(list, { keyword: '地铁' }).length, 1);
  assert.strictEqual(L.filterRecords(list, { month: '2026-08', category: '餐饮' }).length, 1);
});

test('filterRecords 同一天按录入时间倒序', () => {
  const out = L.filterRecords([
    rec({ date: '2026-08-01', createdAt: 100, note: '早' }),
    rec({ date: '2026-08-01', createdAt: 300, note: '晚' })
  ], {});
  assert.deepStrictEqual(out.map((r) => r.note), ['晚', '早']);
});

test('CSV 往返不丢数据', () => {
  const list = [
    rec({ type: 'income', amount: 1234567, category: '工资', date: '2026-08-01', note: '八月' }),
    rec({ type: 'expense', amount: 55, category: '餐饮', date: '2026-08-02', note: '带,逗号和"引号"' })
  ];
  const back = L.fromCSV(L.toCSV(list));
  assert.deepStrictEqual(back.errors, []);
  assert.strictEqual(back.records.length, 2);
  assert.deepStrictEqual(
    back.records.map((r) => [r.type, r.amount, r.category, r.date, r.note]),
    list.map((r) => [r.type, r.amount, r.category, r.date, r.note])
  );
});

test('fromCSV 跳过坏行并报出行号', () => {
  const csv = [
    '日期,类型,分类,金额,备注',
    '2026-08-01,支出,餐饮,25.50,午饭',
    '2026-08-02,支出,餐饮,乱写,坏行',
    '2026-99-99,收入,工资,100,坏日期'
  ].join('\n');
  const out = L.fromCSV(csv);
  assert.strictEqual(out.records.length, 1);
  assert.deepStrictEqual(out.errors.map((e) => e.line), [3, 4]);
});

test('parseCSV 处理引号内的换行', () => {
  const rows = L.parseCSV('a,"多\n行",c');
  assert.deepStrictEqual(rows, [['a', '多\n行', 'c']]);
});

test('mergeRecords 按 id 去重且保留原有的', () => {
  const a = rec({ id: 'same', note: '原有' });
  const b = rec({ id: 'same', note: '导入' });
  const c = rec({ id: 'new' });
  const merged = L.mergeRecords([a], [b, c]);
  assert.strictEqual(merged.length, 2);
  assert.strictEqual(merged[0].note, '原有');
});

test('todayString 用本地时区', () => {
  assert.strictEqual(L.todayString(new Date(2026, 7, 1, 0, 30)), '2026-08-01');
  assert.strictEqual(L.todayString(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
});
