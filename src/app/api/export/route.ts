import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase-server';
import { accountStatus } from '@/lib/account-deletion';
import { csvCell } from '@/lib/csv';
import { isLocalMode } from '@/lib/local-mode';
import { localCsv } from '@/lib/local-ledger';
import { applyRate, rateKey } from '@/lib/exchange-rates';
import type { Transaction } from '@/lib/types';

export async function GET() {
  if (isLocalMode) return new NextResponse(await localCsv(), { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="finance-transactions.csv"',
    'Cache-Control': 'private, no-store',
  } });
  const db = await serverSupabase();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  if (await accountStatus()) return NextResponse.json({ error: 'Account deletion is pending.' }, { status: 403 });
  const [categories, methods, accounts, tags, settings, exchangeRates] = await Promise.all([
    db.from('categories').select('id,name').eq('owner_id', user.id),
    db.from('payment_methods').select('id,name').eq('owner_id', user.id),
    db.from('accounts').select('id,name').eq('owner_id', user.id),
    db.from('tags').select('id,name').eq('owner_id', user.id),
    db.from('user_settings').select('currency_code').eq('owner_id', user.id).single(),
    db.from('exchange_rates').select('base_currency,quote_currency,requested_date,effective_date,rate,source,fetched_at').eq('owner_id', user.id),
  ]);
  const error = [categories, methods, accounts, tags, settings, exchangeRates].find(x => x.error)?.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const nameOf = (items: { id: string; name: string }[] | null, id: string | null) => items?.find(x => x.id === id)?.name ?? '';
  const tagNames = new Map((tags.data ?? []).map(x => [x.id, x.name]));
  const tagsByTransaction = new Map<string, string[]>();
  for (let start = 0; ; start += 1000) {
    const { data, error: linksError } = await db.from('transaction_tags').select('transaction_id,tag_id').eq('owner_id', user.id)
      .order('transaction_id').order('tag_id').range(start, start + 999);
    if (linksError) return NextResponse.json({ error: linksError.message }, { status: 500 });
    for (const link of data ?? []) {
      const names = tagsByTransaction.get(link.transaction_id) ?? [];
      const name = tagNames.get(link.tag_id);
      if (name) names.push(name);
      tagsByTransaction.set(link.transaction_id, names);
    }
    if (!data || data.length < 1000) break;
  }
  const quote = settings.data!.currency_code;
  const rates = new Map((exchangeRates.data ?? []).map(rate => [rateKey(rate.base_currency, rate.quote_currency, rate.requested_date), rate]));
  const lines = [['Date','Original amount','Original currency','Reporting amount','Reporting currency','Exchange rate','Rate date','Type','Other effect','Category','Description','Notes','Payment method','Account','Tags'].join(',')];
  for (let start = 0; ; start += 1000) {
    const { data, error: rowsError } = await db.from('transactions').select('*').eq('owner_id', user.id)
      .order('transaction_date').order('id').range(start, start + 999);
    if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });
    for (const raw of data ?? []) {
      const original = raw as Transaction;
      let t: Transaction = { ...original, reporting_amount_minor: original.amount_minor, reporting_currency_code: quote, exchange_rate: 1, exchange_rate_date: original.transaction_date };
      if (original.currency_code !== quote) {
        const rate = rates.get(rateKey(original.currency_code, quote, original.transaction_date));
        if (!rate) return NextResponse.json({ error: `Missing ${original.currency_code} → ${quote} rate for ${original.transaction_date}.` }, { status: 409 });
        t = applyRate(original, quote, rate);
      }
      lines.push([t.transaction_date,(t.amount_minor / 100).toFixed(2),t.currency_code,
        ((t.reporting_amount_minor ?? t.amount_minor) / 100).toFixed(2),t.reporting_currency_code,t.exchange_rate,t.exchange_rate_date,t.type,t.other_effect,
        nameOf(categories.data,t.category_id),t.description,t.notes,nameOf(methods.data,t.payment_method_id),nameOf(accounts.data,t.account_id),
        (tagsByTransaction.get(t.id) ?? []).join('; ')].map(csvCell).join(','));
    }
    if (!data || data.length < 1000) break;
  }
  return new NextResponse(`\uFEFF${lines.join('\r\n')}`, { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="finance-transactions.csv"',
    'Cache-Control': 'private, no-store',
  } });
}
