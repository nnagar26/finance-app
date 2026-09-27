import 'server-only';

import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { breakdown, byMonth, localDate, monthlyReport, totals, weekBounds } from './finance';
import { csvCell } from './csv';
import { applyRate, fetchHistoricalRate, isSupportedCurrency, rateKey } from './exchange-rates';
import type { ExchangeRate, LegacyTransactionType, Meta, RecurringRule, ReferenceItem, Transaction } from './types';

type Link = { transaction_id: string; tag_id: string };
type Occurrence = { id: string; rule_id: string; due_on: string; status: 'posted' | 'skipped' };
type ConversionLine = { batch_id: string; entity_type: 'transaction' | 'recurring_rule'; entity_id: string; old_amount_minor: number; new_amount_minor: number };
type Ledger = Meta & { schema_version: number; transactions: Transaction[]; tag_links: Link[]; occurrences: Occurrence[]; conversion_lines: ConversionLine[]; exchange_rates: ExchangeRate[] };

const directory = path.join(process.cwd(), '.local-data');
const file = path.join(directory, 'finance.json');
const owner = '00000000-0000-4000-8000-000000000001';
const id = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const type = z.enum(['expense', 'income', 'other']);
const effect = z.enum(['income', 'expense', 'neutral']);
const optionalId = id.nullable().optional();
const money = z.number().int().min(1).max(1_000_000_000_000);
const transactionInput = z.object({
  transaction_date: date, amount_minor: money, currency_code: z.string().refine(isSupportedCurrency), type,
  other_effect: effect.nullable().optional(), category_id: optionalId,
  payment_method_id: optionalId, account_id: optionalId,
  description: z.string().max(300).default(''), notes: z.string().max(2000).default(''),
  tag_ids: z.array(id).max(20).default([]),
}).refine(value => value.type !== 'other' || value.other_effect, { message: 'Choose how Other affects totals.' });
const recurringInput = z.object({
  name: z.string().trim().min(1).max(120), amount_minor: money, currency_code: z.string().refine(isSupportedCurrency), type,
  other_effect: effect.nullable().optional(), category_id: optionalId,
  payment_method_id: optionalId, account_id: optionalId,
  description: z.string().max(300).default(''),
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']),
  next_due_on: date, active: z.boolean().default(true),
}).refine(value => value.type !== 'other' || value.other_effect, { message: 'Choose how Other affects totals.' });

function item(name: string, kind?: string): ReferenceItem {
  return { id: randomUUID(), name, active: true, ...(kind ? { kind } : {}) };
}

function newLedger(): Ledger {
  return {
    schema_version: 2,
    settings: { currency_code: 'CAD', time_zone: 'America/Toronto', theme: 'light' },
    categories: [item('Salary', 'income'), item('Other Income', 'income'),
      ...['Groceries', 'Dining', 'Rent', 'Utilities', 'Mortgage', 'Gas', 'Car Maintenance',
        'Car Insurance', 'Car loan', 'Internet (WiFi)', 'Phone', 'Household Supplies',
        'Shopping', 'Entertainment', 'Travel', 'Subscriptions', 'Gifts', 'Banking/Fees',
        'Home Maintenance', 'House Insurance', 'Transportation'].map(name => item(name, 'expense')),
      item('Miscellaneous', 'both')],
    accounts: [item('Cash Wallet', 'cash')],
    payment_methods: ['Cash', 'Debit Card', 'Credit Card', 'Bank Account', 'E-transfer',
      'Apple Pay', 'Google Pay', 'Other'].map(name => item(name)),
    tags: [], recurring_rules: [], conversion_batches: [],
    transactions: [], tag_links: [], occurrences: [], conversion_lines: [], exchange_rates: [],
  };
}

function migrateType(value: LegacyTransactionType, currentEffect: Transaction['other_effect']): { type: Transaction['type']; effect: Transaction['other_effect'] } {
  if (value === 'salary' || value === 'refund') return { type: 'income', effect: null };
  if (value === 'transfer') return { type: 'other', effect: 'neutral' };
  return { type: value, effect: value === 'other' ? currentEffect ?? 'neutral' : null };
}

async function migrateLedger(raw: Ledger): Promise<Ledger> {
  if ((raw.schema_version ?? 1) >= 2) return raw;
  const backup = path.join(directory, `finance-pre-v2-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await copyFile(file, backup);
  raw.schema_version = 2;
  raw.exchange_rates = raw.exchange_rates ?? [];
  for (const row of raw.transactions) {
    const migrated = migrateType(row.type as LegacyTransactionType, row.other_effect);
    row.type = migrated.type;
    row.other_effect = migrated.type === 'other' ? migrated.effect : null;
  }
  for (const rule of raw.recurring_rules) {
    const migrated = migrateType(rule.type as LegacyTransactionType, rule.other_effect);
    rule.type = migrated.type;
    rule.other_effect = migrated.type === 'other' ? migrated.effect : null;
  }
  await saveLedger(raw);
  return raw;
}

async function readLedger(): Promise<Ledger> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    return migrateLedger(JSON.parse(await readFile(file, 'utf8')) as Ledger);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    try { await writeFile(file, JSON.stringify(newLedger(), null, 2), { flag: 'wx', mode: 0o600 }); }
    catch (writeError) { if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError; }
    return migrateLedger(JSON.parse(await readFile(file, 'utf8')) as Ledger);
  }
}

async function saveLedger(ledger: Ledger) {
  const temporary = path.join(directory, `finance-${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(ledger, null, 2), { mode: 0o600 });
  await rename(temporary, file);
}

let writeTail: Promise<unknown> = Promise.resolve();
function update<T>(operation: (ledger: Ledger) => T | Promise<T>): Promise<T> {
  const work = writeTail.then(async () => {
    const ledger = await readLedger();
    const result = await operation(ledger);
    await saveLedger(ledger);
    return result;
  });
  writeTail = work.then(() => undefined, () => undefined);
  return work;
}

function ensureReference(ledger: Ledger, key: 'categories' | 'accounts' | 'payment_methods' | 'tags', value: string | null | undefined) {
  if (value && !ledger[key].some(row => row.id === value)) throw new Error(`Unknown ${key.replace('_', ' ')} choice.`);
}

function orderedTransactions(ledger: Ledger) {
  return [...ledger.transactions].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.id.localeCompare(a.id));
}

function usageCount(ledger: Ledger, entity: 'categories' | 'accounts' | 'payment_methods' | 'tags', referenceId: string) {
  if (entity === 'tags') return ledger.tag_links.filter(link => link.tag_id === referenceId).length;
  const field = entity === 'categories' ? 'category_id' : entity === 'accounts' ? 'account_id' : 'payment_method_id';
  return ledger.transactions.filter(row => row[field] === referenceId).length +
    ledger.recurring_rules.filter(rule => rule[field] === referenceId).length;
}

function withUsage(ledger: Ledger, entity: 'categories' | 'accounts' | 'payment_methods' | 'tags') {
  return ledger[entity].map(row => ({ ...row, usage_count: usageCount(ledger, entity, row.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function cachedRate(ledger: Ledger, base: string, quote: string, requestedDate: string) {
  return ledger.exchange_rates.find(rate => rateKey(rate.base_currency, rate.quote_currency, rate.requested_date) === rateKey(base, quote, requestedDate));
}

async function ensureRates(ledger: Ledger, rows: Pick<Transaction, 'currency_code' | 'transaction_date'>[], quote: string) {
  const needed = new Map<string, { base: string; date: string }>();
  for (const row of rows) {
    if (row.currency_code === quote || cachedRate(ledger, row.currency_code, quote, row.transaction_date)) continue;
    needed.set(rateKey(row.currency_code, quote, row.transaction_date), { base: row.currency_code, date: row.transaction_date });
  }
  const fetched = await Promise.all([...needed.values()].map(value => fetchHistoricalRate(value.base, quote, value.date)));
  ledger.exchange_rates.push(...fetched);
}

function reportingRows(ledger: Ledger, rows: Transaction[]): Transaction[] {
  const quote = ledger.settings.currency_code;
  return rows.map(row => {
    if (row.currency_code === quote) return { ...row, reporting_amount_minor: row.amount_minor,
      reporting_currency_code: quote, exchange_rate: 1, exchange_rate_date: row.transaction_date };
    const rate = cachedRate(ledger, row.currency_code, quote, row.transaction_date);
    if (!rate) throw new Error(`Missing ${row.currency_code} → ${quote} rate for ${row.transaction_date}. Connect to the internet and select ${quote} again.`);
    return applyRate(row, quote, rate);
  });
}

function nextDate(rule: RecurringRule): string {
  const next = new Date(`${rule.next_due_on}T12:00:00Z`);
  if (rule.frequency === 'weekly' || rule.frequency === 'biweekly') {
    next.setUTCDate(next.getUTCDate() + (rule.frequency === 'weekly' ? 7 : 14));
  } else {
    const months = rule.frequency === 'monthly' ? 1 : rule.frequency === 'quarterly' ? 3 : 12;
    const first = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + months, 1, 12));
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12)).getUTCDate();
    first.setUTCDate(Math.min(rule.anchor_day, lastDay));
    return first.toISOString().slice(0, 10);
  }
  return next.toISOString().slice(0, 10);
}

export async function localView(params: URLSearchParams): Promise<unknown> {
  const ledger = await readLedger();
  const view = params.get('view') ?? 'overview';
  if (view === 'meta') {
    return {
      settings: ledger.settings,
      categories: withUsage(ledger, 'categories'),
      accounts: withUsage(ledger, 'accounts'),
      payment_methods: withUsage(ledger, 'payment_methods'),
      tags: withUsage(ledger, 'tags'),
      recurring_rules: [...ledger.recurring_rules].sort((a, b) => a.next_due_on.localeCompare(b.next_due_on)),
      conversion_batches: [...ledger.conversion_batches].reverse().slice(0, 10),
    };
  }
  if (view === 'tags') {
    const transactionId = id.parse(params.get('id'));
    return { tag_ids: ledger.tag_links.filter(link => link.transaction_id === transactionId).map(link => link.tag_id) };
  }
  const rows = reportingRows(ledger, orderedTransactions(ledger));
  if (view === 'transactions') {
    let filtered = rows;
    const from = params.get('from'); const to = params.get('to');
    const month = params.get('month'); const year = params.get('year');
    const type = params.get('type'); const category = params.get('category');
    const method = params.get('method'); const account = params.get('account');
    const min = Number(params.get('min') || 0); const max = Number(params.get('max') || 0);
    const keyword = (params.get('q') ?? '').trim().toLowerCase();
    if (from) filtered = filtered.filter(row => row.transaction_date >= from);
    if (to) filtered = filtered.filter(row => row.transaction_date <= to);
    if (month) filtered = filtered.filter(row => Number(row.transaction_date.slice(5, 7)) === Number(month));
    if (year) filtered = filtered.filter(row => Number(row.transaction_date.slice(0, 4)) === Number(year));
    if (type) filtered = filtered.filter(row => row.type === type);
    if (category) filtered = filtered.filter(row => row.category_id === category);
    if (method) filtered = filtered.filter(row => row.payment_method_id === method);
    if (account) filtered = filtered.filter(row => row.account_id === account);
    if (min > 0) filtered = filtered.filter(row => (row.reporting_amount_minor ?? row.amount_minor) >= Math.round(min * 100));
    if (max > 0) filtered = filtered.filter(row => (row.reporting_amount_minor ?? row.amount_minor) <= Math.round(max * 100));
    if (keyword) filtered = filtered.filter(row => `${row.description} ${row.notes}`.toLowerCase().includes(keyword));
    const order = params.get('order') ?? 'newest';
    if (order === 'oldest') filtered = [...filtered].reverse();
    if (order === 'amount_desc') filtered = [...filtered].sort((a, b) => (b.reporting_amount_minor ?? b.amount_minor) - (a.reporting_amount_minor ?? a.amount_minor));
    if (order === 'amount_asc') filtered = [...filtered].sort((a, b) => (a.reporting_amount_minor ?? a.amount_minor) - (b.reporting_amount_minor ?? b.amount_minor));
    const page = Math.max(1, Number(params.get('page') || 1));
    const pageRows = filtered.slice((page - 1) * 25, page * 25);
    const ids = new Set(pageRows.map(row => row.id));
    return { rows: pageRows, total: filtered.length, page,
      tagLinks: ledger.tag_links.filter(link => ids.has(link.transaction_id)) };
  }
  if (view === 'overview') {
    const now = new Date();
    const year = Number(params.get('year') || now.getFullYear());
    const month = Number(params.get('month') || now.getMonth() + 1);
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const selected = rows.filter(row => row.transaction_date.startsWith(prefix));
    return { summary: totals(selected), months: byMonth(rows, year),
      categories: breakdown(selected, 'category_id'), methods: breakdown(selected, 'payment_method_id'),
      recent: selected.slice(0, 12) };
  }
  if (view === 'report') {
    const now = new Date();
    const year = Number(params.get('year') || now.getFullYear());
    const month = Number(params.get('month') || now.getMonth() + 1);
    return monthlyReport(rows, year, month);
  }
  if (view === 'calendar') {
    const year = Number(params.get('year'));
    const month = Number(params.get('month'));
    const day = params.get('day') || `${year}-${String(month).padStart(2, '0')}-01`;
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const monthRows = rows.filter(row => row.transaction_date.startsWith(prefix));
    const dayRows = rows.filter(row => row.transaction_date === day);
    const [start, end] = weekBounds(day);
    return { rows: monthRows, dayRows, dayTotals: totals(dayRows),
      weekTotals: totals(rows.filter(row => row.transaction_date >= start && row.transaction_date <= end)),
      monthTotals: totals(monthRows), today: localDate() };
  }
  throw new Error('Unknown view.');
}

export async function localMutation(body: unknown): Promise<unknown> {
  const input = z.object({ action: z.string() }).passthrough().parse(body);
  return update(async ledger => {
    if (input.action === 'transaction.save') {
      const { tag_ids, ...values } = transactionInput.parse(input.values);
      await ensureRates(ledger, [{ currency_code: values.currency_code, transaction_date: values.transaction_date }], ledger.settings.currency_code);
      ensureReference(ledger, 'categories', values.category_id);
      ensureReference(ledger, 'payment_methods', values.payment_method_id);
      ensureReference(ledger, 'accounts', values.account_id);
      for (const tagId of tag_ids) ensureReference(ledger, 'tags', tagId);
      const transactionId = input.id ? id.parse(input.id) : randomUUID();
      const previous = ledger.transactions.find(row => row.id === transactionId);
      if (input.id && !previous) throw new Error('Transaction not found.');
      const row: Transaction = { ...values, id: transactionId, owner_id: owner,
        other_effect: values.type === 'other' ? values.other_effect ?? null : null,
        category_id: values.category_id ?? null, payment_method_id: values.payment_method_id ?? null,
        account_id: values.account_id ?? null,
        recurring_occurrence_id: previous?.recurring_occurrence_id ?? null,
        created_at: previous?.created_at ?? new Date().toISOString() };
      ledger.transactions = ledger.transactions.filter(item => item.id !== transactionId);
      ledger.transactions.push(row);
      ledger.tag_links = ledger.tag_links.filter(link => link.transaction_id !== transactionId);
      ledger.tag_links.push(...[...new Set(tag_ids)].map(tag_id => ({ transaction_id: transactionId, tag_id })));
      return { id: transactionId };
    }
    if (input.action === 'transaction.delete') {
      const transactionId = id.parse(input.id);
      ledger.transactions = ledger.transactions.filter(row => row.id !== transactionId);
      ledger.tag_links = ledger.tag_links.filter(link => link.transaction_id !== transactionId);
      return null;
    }
    if (input.action === 'reference.save') {
      const entity = z.enum(['categories', 'accounts', 'payment_methods', 'tags']).parse(input.entity);
      const name = z.string().trim().min(1).max(entity === 'tags' ? 40 : 80).parse(input.name);
      const kind = entity === 'categories' ? z.enum(['income', 'expense', 'both']).parse(input.kind) :
        entity === 'accounts' ? z.enum(['cash', 'bank', 'card', 'other']).parse(input.kind) : undefined;
      const referenceId = input.id ? id.parse(input.id) : randomUUID();
      const existing = ledger[entity].find(row => row.id === referenceId);
      if (input.id && !existing) throw new Error('List item not found.');
      if (ledger[entity].some(row => row.name === name && row.id !== referenceId)) throw new Error('This name already exists.');
      if (existing) { existing.name = name; if (kind) existing.kind = kind; }
      else ledger[entity].push({ id: referenceId, name, active: true, ...(kind ? { kind } : {}) });
      return null;
    }
    if (input.action === 'reference.archive') {
      const entity = z.enum(['categories', 'accounts', 'payment_methods', 'tags']).parse(input.entity);
      const referenceId = id.parse(input.id);
      const row = ledger[entity].find(item => item.id === referenceId);
      if (!row) throw new Error('List item not found.');
      row.active = z.boolean().parse(input.active);
      return null;
    }
    if (input.action === 'reference.delete') {
      const entity = z.enum(['categories', 'accounts', 'payment_methods', 'tags']).parse(input.entity);
      const referenceId = id.parse(input.id);
      const row = ledger[entity].find(item => item.id === referenceId);
      if (!row) throw new Error('List item not found.');
      const count = usageCount(ledger, entity, referenceId);
      if (count) throw new Error(`This item is used by ${count} record${count === 1 ? '' : 's'}. Archive it instead.`);
      ledger[entity] = ledger[entity].filter(item => item.id !== referenceId) as never;
      return null;
    }
    if (input.action === 'recurring.save') {
      const values = recurringInput.parse(input.values);
      ensureReference(ledger, 'categories', values.category_id);
      ensureReference(ledger, 'payment_methods', values.payment_method_id);
      ensureReference(ledger, 'accounts', values.account_id);
      const ruleId = input.id ? id.parse(input.id) : randomUUID();
      const existing = ledger.recurring_rules.find(rule => rule.id === ruleId);
      if (input.id && !existing) throw new Error('Recurring item not found.');
      const rule: RecurringRule = { ...values, id: ruleId,
        other_effect: values.type === 'other' ? values.other_effect ?? null : null,
        category_id: values.category_id ?? null, payment_method_id: values.payment_method_id ?? null,
        account_id: values.account_id ?? null, anchor_day: Number(values.next_due_on.slice(-2)) };
      ledger.recurring_rules = ledger.recurring_rules.filter(item => item.id !== ruleId);
      ledger.recurring_rules.push(rule);
      return null;
    }
    if (input.action === 'recurring.archive') {
      const ruleId = id.parse(input.id);
      const rule = ledger.recurring_rules.find(item => item.id === ruleId);
      if (!rule) throw new Error('Recurring item not found.');
      rule.active = z.boolean().parse(input.active);
      return null;
    }
    if (input.action === 'recurring.delete') {
      const ruleId = id.parse(input.id);
      if (!ledger.recurring_rules.some(item => item.id === ruleId)) throw new Error('Recurring item not found.');
      const occurrenceIds = new Set(ledger.occurrences.filter(item => item.rule_id === ruleId).map(item => item.id));
      ledger.transactions.forEach(item => {
        if (item.recurring_occurrence_id && occurrenceIds.has(item.recurring_occurrence_id)) item.recurring_occurrence_id = null;
      });
      ledger.occurrences = ledger.occurrences.filter(item => item.rule_id !== ruleId);
      ledger.recurring_rules = ledger.recurring_rules.filter(item => item.id !== ruleId);
      return null;
    }
    if (input.action === 'recurring.review') {
      const ruleId = id.parse(input.id);
      const choice = z.enum(['post', 'skip']).parse(input.choice);
      const rule = ledger.recurring_rules.find(item => item.id === ruleId);
      if (!rule || !rule.active) throw new Error('Recurring item is unavailable.');
      if (rule.next_due_on > localDate(new Date(), ledger.settings.time_zone)) throw new Error('This item is not due yet.');
      if (ledger.occurrences.some(item => item.rule_id === ruleId && item.due_on === rule.next_due_on)) {
        throw new Error('This due item has already been reviewed.');
      }
      const occurrence: Occurrence = { id: randomUUID(), rule_id: ruleId, due_on: rule.next_due_on,
        status: choice === 'post' ? 'posted' : 'skipped' };
      ledger.occurrences.push(occurrence);
      if (choice === 'post') ledger.transactions.push({ id: randomUUID(), owner_id: owner,
        transaction_date: rule.next_due_on, amount_minor: rule.amount_minor,
        currency_code: rule.currency_code, type: rule.type, other_effect: rule.other_effect,
        category_id: rule.category_id, payment_method_id: rule.payment_method_id,
        account_id: rule.account_id, description: rule.description || rule.name, notes: '',
        recurring_occurrence_id: occurrence.id, created_at: new Date().toISOString() });
      if (choice === 'post') await ensureRates(ledger, [{ currency_code: rule.currency_code, transaction_date: rule.next_due_on }], ledger.settings.currency_code);
      rule.next_due_on = nextDate(rule);
      return { id: occurrence.id };
    }
    if (input.action === 'settings.save') {
      const values = z.object({ theme: z.enum(['light', 'dark', 'system']).optional(),
        time_zone: z.string().min(1).max(100).optional() }).parse(input.values);
      if (values.time_zone) {
        try { new Intl.DateTimeFormat('en-US', { timeZone: values.time_zone }); }
        catch { throw new Error('Invalid time zone.'); }
      }
      Object.assign(ledger.settings, values);
      return null;
    }
    if (input.action === 'currency.setReporting') {
      const to = z.string().refine(isSupportedCurrency).parse(input.currency);
      if (to === ledger.settings.currency_code) return null;
      await ensureRates(ledger, ledger.transactions, to);
      ledger.settings.currency_code = to;
      return null;
    }
    throw new Error('Unknown action.');
  });
}

export async function localCsv(): Promise<string> {
  const ledger = await readLedger();
  const nameOf = (items: ReferenceItem[], referenceId: string | null) => items.find(item => item.id === referenceId)?.name ?? '';
  const tagNames = new Map(ledger.tags.map(tag => [tag.id, tag.name]));
  const lines = [['Date', 'Original amount', 'Original currency', 'Reporting amount', 'Reporting currency',
    'Exchange rate', 'Rate date', 'Type', 'Other effect', 'Category', 'Description',
    'Notes', 'Payment method', 'Account', 'Tags'].join(',')];
  const rows = reportingRows(ledger, [...ledger.transactions].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date) || a.id.localeCompare(b.id)));
  for (const row of rows) {
    const tags = ledger.tag_links.filter(link => link.transaction_id === row.id)
      .map(link => tagNames.get(link.tag_id)).filter((name): name is string => Boolean(name));
    lines.push([row.transaction_date, (row.amount_minor / 100).toFixed(2), row.currency_code,
      ((row.reporting_amount_minor ?? row.amount_minor) / 100).toFixed(2), row.reporting_currency_code,
      row.exchange_rate, row.exchange_rate_date, row.type, row.other_effect, nameOf(ledger.categories, row.category_id), row.description,
      row.notes, nameOf(ledger.payment_methods, row.payment_method_id), nameOf(ledger.accounts, row.account_id),
      tags.join('; ')].map(csvCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}
