import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyReport } from '../src/lib/finance.ts';

const row = (date, amount, type, extras = {}) => ({
  id: crypto.randomUUID(), transaction_date: date, amount_minor: amount,
  reporting_amount_minor: amount, type, other_effect: null,
  category_id: null, payment_method_id: null, account_id: null, ...extras,
});

test('monthly report compares January with the previous December and groups converted amounts', () => {
  const report = monthlyReport([
    row('2025-12-31', 6000, 'expense'),
    row('2026-01-01', 10000, 'income', { account_id: 'checking', reporting_amount_minor: 7500 }),
    row('2026-01-02', 3000, 'expense', { category_id: 'food', payment_method_id: 'card' }),
    row('2026-01-02', 2000, 'expense', { category_id: 'food', payment_method_id: 'card' }),
    row('2026-01-04', 500, 'other', { other_effect: 'expense' }),
    row('2026-01-05', 700, 'other', { other_effect: 'neutral' }),
    row('2026-02-01', 9000, 'income'),
  ], 2026, 1);
  assert.equal(report.previousYear, 2025);
  assert.equal(report.previousMonth, 12);
  assert.equal(report.previous.expenses, 6000);
  assert.equal(report.summary.income, 7500);
  assert.equal(report.summary.expenses, 5500);
  assert.equal(report.summary.savings, 2000);
  assert.deepEqual(report.categories, [{ id: 'food', amount: 5000, count: 2 }, { id: null, amount: 500, count: 1 }]);
  assert.deepEqual(report.methods, [{ id: 'card', amount: 5000, count: 2 }, { id: null, amount: 500, count: 1 }]);
  assert.deepEqual(report.accounts, [{ id: 'checking', amount: 7500, count: 1 }]);
  assert.equal(report.days.length, 31);
  assert.equal(report.days[1].expenses, 5000);
  assert.equal(report.days[0].income, 7500);
});

test('monthly report fills empty days and groups missing income accounts', () => {
  const report = monthlyReport([row('2024-02-29', 2500, 'income')], 2024, 2);
  assert.equal(report.days.length, 29);
  assert.equal(report.days[28].income, 2500);
  assert.deepEqual(report.accounts, [{ id: null, amount: 2500, count: 1 }]);
  assert.equal(report.previous.count, 0);
  assert.throws(() => monthlyReport([], 2024, 13));
});
