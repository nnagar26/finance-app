export interface BreakdownItem { id: string; amount: number }

export function expensePercent(amount: number, totalExpenses: number) {
  return totalExpenses > 0 ? amount / totalExpenses * 100 : 0;
}

export function pieBreakdown(rows: BreakdownItem[], maxSlices = 8): BreakdownItem[] {
  const positive = rows.filter(row => row.amount > 0);
  if (positive.length <= maxSlices) return positive;
  const leading = positive.slice(0, maxSlices - 1);
  return [...leading, { id: 'other-groups', amount: positive.slice(maxSlices - 1).reduce((sum, row) => sum + row.amount, 0) }];
}
