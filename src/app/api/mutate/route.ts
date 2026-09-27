import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { serverSupabase } from '@/lib/supabase-server';
import { accountStatus } from '@/lib/account-deletion';
import { isLocalMode } from '@/lib/local-mode';
import { localMutation } from '@/lib/local-ledger';
import { fetchHistoricalRate, isSupportedCurrency, rateKey } from '@/lib/exchange-rates';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(x => {
  const parsed = new Date(`${x}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === x;
});
const transactionType = z.enum(['expense', 'income', 'other']);
const effect = z.enum(['income', 'expense', 'neutral']);
const nullableId = uuid.nullable().optional();
const transaction = z.object({
  transaction_date: date, amount_minor: z.number().int().min(1).max(1_000_000_000_000), currency_code: z.string().refine(isSupportedCurrency),
  type: transactionType, other_effect: effect.nullable().optional(),
  category_id: nullableId, payment_method_id: nullableId, account_id: nullableId,
  description: z.string().max(300).default(''), notes: z.string().max(2000).default(''),
  tag_ids: z.array(uuid).max(20).default([]),
}).refine(x => x.type !== 'other' || x.other_effect, { message: 'Choose how Other affects totals.' });
const recurring = z.object({
  name: z.string().trim().min(1).max(120), amount_minor: z.number().int().min(1).max(1_000_000_000_000), currency_code: z.string().refine(isSupportedCurrency),
  type: transactionType, other_effect: effect.nullable().optional(), category_id: nullableId,
  payment_method_id: nullableId, account_id: nullableId, description: z.string().max(300).default(''),
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']), next_due_on: date,
  active: z.boolean().default(true),
}).refine(x => x.type !== 'other' || x.other_effect, { message: 'Choose how Other affects totals.' });

async function ensureRates(db: Awaited<ReturnType<typeof serverSupabase>>, ownerId: string,
  rows: { currency_code: string; transaction_date: string }[], quote: string) {
  const needed = new Map<string, { base: string; date: string }>();
  for (const row of rows) if (row.currency_code !== quote) {
    needed.set(rateKey(row.currency_code, quote, row.transaction_date), { base: row.currency_code, date: row.transaction_date });
  }
  if (!needed.size) return;
  const { data: cached, error } = await db.from('exchange_rates').select('base_currency,quote_currency,requested_date')
    .eq('owner_id', ownerId).eq('quote_currency', quote);
  if (error) throw error;
  const existing = new Set((cached ?? []).map(rate => rateKey(rate.base_currency, rate.quote_currency, rate.requested_date)));
  const missing = [...needed].filter(([key]) => !existing.has(key)).map(([, value]) => value);
  const fetched = await Promise.all(missing.map(value => fetchHistoricalRate(value.base, quote, value.date)));
  if (fetched.length) {
    const inserted = await db.from('exchange_rates').upsert(fetched.map(rate => ({ ...rate, owner_id: ownerId })),
      { onConflict: 'owner_id,base_currency,quote_currency,requested_date' });
    if (inserted.error) throw inserted.error;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isLocalMode) return NextResponse.json({ ok: true, result: await localMutation(await request.json()) });
    const db = await serverSupabase();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    if (await accountStatus()) return NextResponse.json({ error: 'Account deletion is pending.' }, { status: 403 });
    const owner_id = user.id;
    const body = await request.json();
    const action = z.string().parse(body.action);
    let result: unknown = null;

    if (action === 'transaction.save') {
      const { tag_ids, ...values } = transaction.parse(body.values);
      if (tag_ids.length) {
        const { data: ownedTags, error: tagError } = await db.from('tags').select('id').eq('owner_id', owner_id).in('id', tag_ids);
        if (tagError) throw tagError;
        if (ownedTags?.length !== new Set(tag_ids).size) throw new Error('One or more tags are unavailable.');
      }
      const { data: settings, error: settingsError } = await db.from('user_settings').select('currency_code').eq('owner_id', owner_id).single();
      if (settingsError) throw settingsError;
      await ensureRates(db, owner_id, [{ currency_code: values.currency_code, transaction_date: values.transaction_date }], settings.currency_code);
      const payload = { ...values, other_effect: values.type === 'other' ? values.other_effect : null,
        owner_id };
      const id = body.id ? uuid.parse(body.id) : null;
      const operation = id
        ? db.from('transactions').update(payload).eq('id', id).eq('owner_id', owner_id).select('id').single()
        : db.from('transactions').insert(payload).select('id').single();
      const { data, error } = await operation;
      if (error) throw error;
      if (id) {
        const deleted = await db.from('transaction_tags').delete().eq('transaction_id', data.id).eq('owner_id', owner_id);
        if (deleted.error) throw deleted.error;
      }
      if (tag_ids.length) {
        const inserted = await db.from('transaction_tags').insert([...new Set(tag_ids)].map(tag_id => ({ owner_id, transaction_id: data.id, tag_id })));
        if (inserted.error) throw inserted.error;
      }
      result = data;
    } else if (action === 'transaction.delete') {
      const id = uuid.parse(body.id);
      const { error } = await db.from('transactions').delete().eq('id', id).eq('owner_id', owner_id);
      if (error) throw error;
    } else if (action === 'reference.save') {
      const entity = z.enum(['categories', 'accounts', 'payment_methods', 'tags']).parse(body.entity);
      const name = z.string().trim().min(1).max(80).parse(body.name);
      const kind = entity === 'categories' ? z.enum(['income', 'expense', 'both']).parse(body.kind) :
        entity === 'accounts' ? z.enum(['cash', 'bank', 'card', 'other']).parse(body.kind) : undefined;
      const payload = { name, ...(kind ? { kind } : {}), owner_id };
      const id = body.id ? uuid.parse(body.id) : null;
      const operation = id ? db.from(entity).update(payload).eq('id', id).eq('owner_id', owner_id) : db.from(entity).insert(payload);
      const { error } = await operation;
      if (error) throw error;
    } else if (action === 'reference.archive') {
      const entity = z.enum(['categories', 'accounts', 'payment_methods', 'tags']).parse(body.entity);
      const id = uuid.parse(body.id);
      const { error } = await db.from(entity).update({ active: Boolean(body.active) }).eq('id', id).eq('owner_id', owner_id);
      if (error) throw error;
    } else if (action === 'reference.delete') {
      const entity = z.enum(['categories', 'accounts', 'payment_methods', 'tags']).parse(body.entity);
      const id = uuid.parse(body.id);
      let count = 0;
      if (entity === 'tags') {
        const result = await db.from('transaction_tags').select('tag_id', { count: 'exact', head: true }).eq('owner_id', owner_id).eq('tag_id', id);
        if (result.error) throw result.error; count = result.count ?? 0;
      } else {
        const field = entity === 'categories' ? 'category_id' : entity === 'accounts' ? 'account_id' : 'payment_method_id';
        const [transactions, rules] = await Promise.all([
          db.from('transactions').select('id', { count: 'exact', head: true }).eq('owner_id', owner_id).eq(field, id),
          db.from('recurring_rules').select('id', { count: 'exact', head: true }).eq('owner_id', owner_id).eq(field, id),
        ]);
        if (transactions.error) throw transactions.error;
        if (rules.error) throw rules.error;
        count = (transactions.count ?? 0) + (rules.count ?? 0);
      }
      if (count) throw new Error(`This item is used by ${count} record${count === 1 ? '' : 's'}. Archive it instead.`);
      const deleted = await db.from(entity).delete().eq('id', id).eq('owner_id', owner_id);
      if (deleted.error) throw deleted.error;
    } else if (action === 'recurring.save') {
      const values = recurring.parse(body.values);
      const payload = { ...values, other_effect: values.type === 'other' ? values.other_effect : null,
        anchor_day: Number(values.next_due_on.slice(-2)), owner_id };
      const id = body.id ? uuid.parse(body.id) : null;
      const operation = id ? db.from('recurring_rules').update(payload).eq('id', id).eq('owner_id', owner_id) : db.from('recurring_rules').insert(payload);
      const { error } = await operation;
      if (error) throw error;
    } else if (action === 'recurring.archive') {
      const id = uuid.parse(body.id);
      const { error } = await db.from('recurring_rules').update({ active: Boolean(body.active) }).eq('id', id).eq('owner_id', owner_id);
      if (error) throw error;
    } else if (action === 'recurring.delete') {
      const id = uuid.parse(body.id);
      const { error } = await db.from('recurring_rules').delete().eq('id', id).eq('owner_id', owner_id);
      if (error) throw error;
    } else if (action === 'recurring.review') {
      const id = uuid.parse(body.id);
      const choice = z.enum(['post', 'skip']).parse(body.choice);
      if (choice === 'post') {
        const [ruleResult, settingsResult] = await Promise.all([
          db.from('recurring_rules').select('currency_code,next_due_on').eq('id', id).eq('owner_id', owner_id).single(),
          db.from('user_settings').select('currency_code').eq('owner_id', owner_id).single(),
        ]);
        if (ruleResult.error) throw ruleResult.error;
        if (settingsResult.error) throw settingsResult.error;
        await ensureRates(db, owner_id, [{ currency_code: ruleResult.data.currency_code, transaction_date: ruleResult.data.next_due_on }], settingsResult.data.currency_code);
      }
      const { data, error } = await db.rpc('review_recurring', { p_rule_id: id, p_action: choice });
      if (error) throw error;
      result = data;
    } else if (action === 'settings.save') {
      const values = z.object({ theme: z.enum(['light', 'dark', 'system']).optional(), time_zone: z.string().min(1).max(100).optional() }).parse(body.values);
      const { error } = await db.from('user_settings').update(values).eq('owner_id', owner_id);
      if (error) throw error;
    } else if (action === 'currency.setReporting') {
      const currency = z.string().refine(isSupportedCurrency).parse(body.currency);
      const { data: rows, error: rowsError } = await db.from('transactions').select('currency_code,transaction_date').eq('owner_id', owner_id);
      if (rowsError) throw rowsError;
      await ensureRates(db, owner_id, rows ?? [], currency);
      const updated = await db.from('user_settings').update({ currency_code: currency }).eq('owner_id', owner_id);
      if (updated.error) throw updated.error;
    } else {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
