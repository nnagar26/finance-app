import type { Transaction } from './types';

export interface Totals { income: number; expenses: number; netSpending: number; savings: number; count: number }
export const emptyTotals = (): Totals => ({ income: 0, expenses: 0, netSpending: 0, savings: 0, count: 0 });

export function effectOf(t: Pick<Transaction, 'type' | 'other_effect'>): 'income' | 'expense' | 'neutral' {
  if (t.type === 'income') return 'income';
  if (t.type === 'expense') return 'expense';
  if (t.type === 'other') return t.other_effect === 'income' ? 'income' : t.other_effect === 'expense' ? 'expense' : 'neutral';
  return 'neutral';
}

export function reportingAmount(t: Pick<Transaction, 'amount_minor' | 'reporting_amount_minor'>) {
  return t.reporting_amount_minor ?? t.amount_minor;
}

export function totals(rows: Transaction[]): Totals {
  const result = emptyTotals();
  for (const t of rows) {
    result.count += 1;
    switch (effectOf(t)) {
      case 'income': result.income += reportingAmount(t); break;
      case 'expense': result.expenses += reportingAmount(t); break;
    }
  }
  result.netSpending = result.expenses;
  result.savings = result.income - result.expenses;
  return result;
}

export function byMonth(rows: Transaction[], year: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const key = `${year}-${String(index + 1).padStart(2, '0')}`;
    return { key, month: index + 1, ...totals(rows.filter(t => t.transaction_date.startsWith(key))) };
  });
}

export function breakdown(rows: Transaction[], key: 'category_id' | 'payment_method_id') {
  const groups = new Map<string, number>();
  for (const t of rows) {
    const effect = effectOf(t);
    if (effect !== 'expense') continue;
    const id = t[key] ?? 'uncategorized';
    groups.set(id, (groups.get(id) ?? 0) + reportingAmount(t));
  }
  return [...groups].map(([id, amount]) => ({ id, amount })).sort((a, b) => b.amount - a.amount);
}

export function localDate(date = new Date(), timeZone = 'America/Toronto') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function weekBounds(isoDate: string): [string, string] {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const weekday = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - weekday);
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  return [monday.toISOString().slice(0, 10), sunday.toISOString().slice(0, 10)];
}

export function formatMoney(minor: number, currency = 'CAD') {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(minor / 100);
}

export function parseMoneyInput(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Enter an amount with up to two decimal places.');
  const [whole, cents = ''] = value.split('.');
  const amount = BigInt(whole) * BigInt(100) + BigInt(cents.padEnd(2, '0') || '0');
  if (amount < BigInt(1) || amount > BigInt(1_000_000_000_000)) throw new Error('Enter an amount greater than zero and below the limit.');
  return Number(amount);
}

export function convertMinor(minor: number, rate: string): number {
  if (!Number.isSafeInteger(minor) || minor < 0 || !/^\d+(?:\.\d{1,12})?$/.test(rate) || Number(rate) <= 0) throw new Error('Invalid conversion.');
  const [whole, fraction = ''] = rate.split('.');
  const denominator = BigInt(10) ** BigInt(fraction.length);
  const numerator = BigInt(whole) * denominator + BigInt(fraction || '0');
  const result = (BigInt(minor) * numerator + denominator / BigInt(2)) / denominator;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Converted amount is too large.');
  return Number(result);
}
