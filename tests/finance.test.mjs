import test from 'node:test';
import assert from 'node:assert/strict';
import { totals, byMonth, breakdown, weekBounds, convertMinor, parseMoneyInput } from '../src/lib/finance.ts';

const row = (date, amount, type, extras = {}) => ({
  id: crypto.randomUUID(), transaction_date: date, amount_minor: amount, type,
  other_effect: null, category_id: 'groceries', payment_method_id: 'card', ...extras,
});

test('expense, income and other effects calculate exact totals', () => {
  const result = totals([
    row('2026-09-01', 500000, 'income'), row('2026-09-02', 10000, 'expense'),
    row('2026-09-03', 2500, 'income'), row('2026-09-04', 200000, 'other', { other_effect: 'neutral' }),
    row('2026-09-05', 4000, 'other', { other_effect: 'expense' }),
    row('2026-09-06', 500, 'other', { other_effect: 'income' }),
  ]);
  assert.deepEqual(result, { income: 503000, expenses: 14000, netSpending: 14000, savings: 489000, count: 6 });
});

test('month totals and breakdown use the same simplified type rules', () => {
  const rows = [row('2026-08-31', 10000, 'expense'), row('2026-09-01', 8000, 'expense'), row('2026-09-02', 3000, 'income'), row('2026-10-01', 5000, 'income')];
  const months = byMonth(rows, 2026);
  assert.equal(months[7].netSpending, 10000);
  assert.equal(months[8].netSpending, 8000);
  assert.equal(months[9].income, 5000);
  assert.deepEqual(breakdown(rows.filter(x => x.transaction_date.startsWith('2026-09')), 'category_id'), [{ id: 'groceries', amount: 8000 }]);
});

test('reporting amounts drive totals without changing original amounts', () => {
  const original = row('2026-09-01', 10000, 'expense', { reporting_amount_minor: 7400 });
  assert.equal(totals([original]).expenses, 7400);
  assert.equal(original.amount_minor, 10000);
});

test('weeks start Monday and span month boundaries', () => {
  assert.deepEqual(weekBounds('2026-09-01'), ['2026-08-31', '2026-09-06']);
});

test('conversion preview rounds exact minor units', () => {
  assert.equal(convertMinor(10001, '0.74'), 7401);
  assert.equal(convertMinor(1, '0.5'), 1);
  assert.throws(() => convertMinor(1, '0'));
});

test('amount entry preserves cents exactly', () => {
  assert.equal(parseMoneyInput('52.40'), 5240);
  assert.equal(parseMoneyInput('0.01'), 1);
  assert.throws(() => parseMoneyInput('1.005'));
  assert.throws(() => parseMoneyInput('0'));
});
