import test from 'node:test';
import assert from 'node:assert/strict';
import { expensePercent, pieBreakdown } from '../src/lib/breakdown-display.ts';

test('percentages use all selected-month expenses', () => {
  assert.equal(expensePercent(2500, 10000), 25);
  assert.equal(expensePercent(2500, 0), 0);
});

test('pie groups overflow without dropping expense amounts', () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({ id: `group-${index}`, amount: (10 - index) * 100 }));
  const slices = pieBreakdown(rows);
  assert.equal(slices.length, 8);
  assert.deepEqual(slices.at(-1), { id: 'other-groups', amount: 600 });
  assert.equal(slices.reduce((sum, row) => sum + row.amount, 0), rows.reduce((sum, row) => sum + row.amount, 0));
  assert.deepEqual(pieBreakdown([]), []);
});
