import { NextRequest, NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase-server';
import { breakdown, byMonth, localDate, totals, weekBounds } from '@/lib/finance';
import type { Transaction } from '@/lib/types';
import { applyRate, rateKey } from '@/lib/exchange-rates';
import { isLocalMode } from '@/lib/local-mode';
import { localView } from '@/lib/local-ledger';
import { accountStatus } from '@/lib/account-deletion';

export const dynamic = 'force-dynamic';

async function allTransactions(db: Awaited<ReturnType<typeof serverSupabase>>, owner: string): Promise<Transaction[]> {
  const rows: Transaction[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db.from('transactions').select('*').eq('owner_id', owner)
      .order('transaction_date', { ascending: false }).order('id', { ascending: false }).range(start, start + 999);
    if (error) throw error;
    rows.push(...(data as Transaction[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function reportingRows(db: Awaited<ReturnType<typeof serverSupabase>>, owner: string, rows: Transaction[], quote: string) {
  const { data, error } = await db.from('exchange_rates').select('base_currency,quote_currency,requested_date,effective_date,rate,source,fetched_at')
    .eq('owner_id', owner).eq('quote_currency', quote);
  if (error) throw error;
  const rates = new Map((data ?? []).map(rate => [rateKey(rate.base_currency, rate.quote_currency, rate.requested_date), rate]));
  return rows.map(row => {
    if (row.currency_code === quote) return { ...row, reporting_amount_minor: row.amount_minor,
      reporting_currency_code: quote, exchange_rate: 1, exchange_rate_date: row.transaction_date };
    const rate = rates.get(rateKey(row.currency_code, quote, row.transaction_date));
    if (!rate) throw new Error(`Missing ${row.currency_code} → ${quote} rate for ${row.transaction_date}. Select ${quote} again while online.`);
    return applyRate(row, quote, rate);
  });
}

export async function GET(request: NextRequest) {
  try {
    if (isLocalMode) return NextResponse.json(await localView(request.nextUrl.searchParams));
    const db = await serverSupabase();
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    if (await accountStatus()) return NextResponse.json({ error: 'Account deletion is pending.' }, { status: 403 });
    const view = request.nextUrl.searchParams.get('view') ?? 'overview';
    const owner = user.id;
    if (view === 'meta') {
      const [settings, categories, accounts, methods, tags, rules, conversions, usedTransactions, usedRules, usedTags] = await Promise.all([
        db.from('user_settings').select('currency_code,time_zone,theme').eq('owner_id', owner).single(),
        db.from('categories').select('id,name,kind,active').eq('owner_id', owner).order('name'),
        db.from('accounts').select('id,name,kind,active').eq('owner_id', owner).order('name'),
        db.from('payment_methods').select('id,name,active').eq('owner_id', owner).order('name'),
        db.from('tags').select('id,name,active').eq('owner_id', owner).order('name'),
        db.from('recurring_rules').select('*').eq('owner_id', owner).order('next_due_on'),
        db.from('currency_conversion_batches').select('id,from_currency,to_currency,rate,created_at').eq('owner_id', owner).order('created_at', { ascending: false }).limit(10),
        db.from('transactions').select('category_id,account_id,payment_method_id').eq('owner_id', owner),
        db.from('recurring_rules').select('category_id,account_id,payment_method_id').eq('owner_id', owner),
        db.from('transaction_tags').select('tag_id').eq('owner_id', owner),
      ]);
      const failure = [settings, categories, accounts, methods, tags, rules, conversions, usedTransactions, usedRules, usedTags].find(x => x.error);
      if (failure?.error) throw failure.error;
      const count = (field: 'category_id' | 'account_id' | 'payment_method_id', id: string) =>
        [...(usedTransactions.data ?? []), ...(usedRules.data ?? [])].filter(row => row[field] === id).length;
      return NextResponse.json({ settings: settings.data,
        categories: (categories.data ?? []).map(row => ({ ...row, usage_count: count('category_id', row.id) })),
        accounts: (accounts.data ?? []).map(row => ({ ...row, usage_count: count('account_id', row.id) })),
        payment_methods: (methods.data ?? []).map(row => ({ ...row, usage_count: count('payment_method_id', row.id) })),
        tags: (tags.data ?? []).map(row => ({ ...row, usage_count: (usedTags.data ?? []).filter(link => link.tag_id === row.id).length })),
        recurring_rules: rules.data, conversion_batches: conversions.data });
    }
    if (view === 'tags') {
      const id = paramsId(request.nextUrl.searchParams.get('id'));
      const { data, error } = await db.from('transaction_tags').select('tag_id').eq('owner_id', owner).eq('transaction_id', id);
      if (error) throw error;
      return NextResponse.json({ tag_ids: (data ?? []).map(x => x.tag_id) });
    }

    const originalRows = await allTransactions(db, owner);
    const { data: settings, error: settingsError } = await db.from('user_settings').select('currency_code').eq('owner_id', owner).single();
    if (settingsError) throw settingsError;
    const rows = await reportingRows(db, owner, originalRows, settings.currency_code);
    const params = request.nextUrl.searchParams;
    if (view === 'transactions') {
      let filtered = rows;
      const from = params.get('from'); const to = params.get('to');
      const month = params.get('month'); const year = params.get('year');
      const type = params.get('type'); const category = params.get('category');
      const method = params.get('method'); const account = params.get('account');
      const min = Number(params.get('min') || 0); const max = Number(params.get('max') || 0);
      const keyword = (params.get('q') ?? '').trim().toLowerCase();
      if (from) filtered = filtered.filter(t => t.transaction_date >= from);
      if (to) filtered = filtered.filter(t => t.transaction_date <= to);
      if (month) filtered = filtered.filter(t => Number(t.transaction_date.slice(5, 7)) === Number(month));
      if (year) filtered = filtered.filter(t => Number(t.transaction_date.slice(0, 4)) === Number(year));
      if (type) filtered = filtered.filter(t => t.type === type);
      if (category) filtered = filtered.filter(t => t.category_id === category);
      if (method) filtered = filtered.filter(t => t.payment_method_id === method);
      if (account) filtered = filtered.filter(t => t.account_id === account);
      if (min > 0) filtered = filtered.filter(t => (t.reporting_amount_minor ?? t.amount_minor) >= Math.round(min * 100));
      if (max > 0) filtered = filtered.filter(t => (t.reporting_amount_minor ?? t.amount_minor) <= Math.round(max * 100));
      if (keyword) filtered = filtered.filter(t => `${t.description} ${t.notes}`.toLowerCase().includes(keyword));
      const order = params.get('order') ?? 'newest';
      if (order === 'oldest') filtered = [...filtered].reverse();
      if (order === 'amount_desc') filtered = [...filtered].sort((a, b) => (b.reporting_amount_minor ?? b.amount_minor) - (a.reporting_amount_minor ?? a.amount_minor));
      if (order === 'amount_asc') filtered = [...filtered].sort((a, b) => (a.reporting_amount_minor ?? a.amount_minor) - (b.reporting_amount_minor ?? b.amount_minor));
      const page = Math.max(1, Number(params.get('page') || 1));
      const pageRows = filtered.slice((page - 1) * 25, page * 25);
      const ids = pageRows.map(t => t.id);
      const tagLinks = ids.length ? await db.from('transaction_tags').select('transaction_id,tag_id').in('transaction_id', ids) : { data: [] };
      return NextResponse.json({ rows: pageRows, total: filtered.length, page, tagLinks: tagLinks.data ?? [] });
    }
    if (view === 'overview') {
      const now = new Date();
      const year = Number(params.get('year') || now.getFullYear());
      const month = Number(params.get('month') || now.getMonth() + 1);
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      const selected = rows.filter(t => t.transaction_date.startsWith(prefix));
      return NextResponse.json({ summary: totals(selected), months: byMonth(rows, year),
        categories: breakdown(selected, 'category_id'), methods: breakdown(selected, 'payment_method_id'),
        recent: selected.slice(0, 6) });
    }
    if (view === 'calendar') {
      const year = Number(params.get('year')); const month = Number(params.get('month'));
      const day = params.get('day') || `${year}-${String(month).padStart(2, '0')}-01`;
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      const monthRows = rows.filter(t => t.transaction_date.startsWith(prefix));
      const [start, end] = weekBounds(day);
      return NextResponse.json({ rows: monthRows, dayRows: rows.filter(t => t.transaction_date === day),
        dayTotals: totals(rows.filter(t => t.transaction_date === day)),
        weekTotals: totals(rows.filter(t => t.transaction_date >= start && t.transaction_date <= end)),
        monthTotals: totals(monthRows), today: localDate() });
    }
    return NextResponse.json({ error: 'Unknown view.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load data.' }, { status: 500 });
  }
}

function paramsId(value: string | null) {
  if (!value || !/^[0-9a-f-]{36}$/i.test(value)) throw new Error('Invalid transaction ID.');
  return value;
}
