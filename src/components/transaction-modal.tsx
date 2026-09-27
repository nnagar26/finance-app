'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { localDate, parseMoneyInput } from '@/lib/finance';
import type { Meta, Transaction, TransactionType, FinancialEffect } from '@/lib/types';
import { SUPPORTED_CURRENCIES } from '@/lib/exchange-rates';

export default function TransactionModal({ meta, transaction, tagIds = [], onClose, onSaved }: {
  meta: Meta; transaction?: Transaction | null; tagIds?: string[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const [date, setDate] = useState(transaction?.transaction_date ?? localDate(new Date(), meta.settings.time_zone));
  const [amount, setAmount] = useState(transaction ? (transaction.amount_minor / 100).toFixed(2) : '');
  const [currency, setCurrency] = useState(transaction?.currency_code ?? meta.settings.currency_code);
  const [type, setType] = useState<TransactionType>(transaction?.type ?? 'expense');
  const [effect, setEffect] = useState<FinancialEffect>(transaction?.other_effect ?? 'neutral');
  const [category, setCategory] = useState(transaction?.category_id ?? '');
  const [method, setMethod] = useState(transaction?.payment_method_id ?? '');
  const [account, setAccount] = useState(transaction?.account_id ?? '');
  const [description, setDescription] = useState(transaction?.description ?? '');
  const [notes, setNotes] = useState(transaction?.notes ?? '');
  const [tags, setTags] = useState<string[]>(tagIds);
  const [more, setMore] = useState(Boolean(transaction?.notes || tagIds.length));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => [...(dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])]
      .filter(element => !element.hasAttribute('hidden'));
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (!elements.length) { event.preventDefault(); return; }
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); previousFocus?.focus(); };
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const amount_minor = parseMoneyInput(amount);
      const res = await fetch('/api/mutate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'transaction.save', id: transaction?.id, values: {
          transaction_date: date, amount_minor, currency_code: transaction ? currency : meta.settings.currency_code, type, other_effect: type === 'other' ? effect : null,
          category_id: type === 'income' ? null : category || null, payment_method_id: type === 'income' ? null : method || null, account_id: type === 'expense' ? null : account || null,
          description, notes, tag_ids: tags,
        } }), });
      const json = await res.json(); if (!res.ok) throw new Error(json.error);
      await onSaved(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save.'); }
    finally { setBusy(false); }
  }
  const categoryKind = type === 'income' || type === 'other' && effect === 'income' ? 'income' : 'expense';
  const categories = meta.categories.filter(c => c.active || c.id === category).filter(c => type === 'other' ? c.kind === 'both' || c.kind === categoryKind : true);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal" ref={dialogRef} role="dialog" aria-modal="true" aria-label={transaction ? 'Edit transaction' : 'Add transaction'}>
    <div className="modal-head"><div><div className="eyebrow">YOUR LEDGER</div><h2>{transaction ? 'Edit transaction' : 'Add transaction'}</h2></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={20} /></button></div>
    <form onSubmit={save} className="stack gap-md">
      <div className="type-pills">{(['expense','income'] as TransactionType[]).map(v => <button type="button" className={`pill ${v} ${type === v ? 'selected' : ''}`} key={v} onClick={() => { setType(v); setCategory(''); }}>{v[0].toUpperCase() + v.slice(1)}</button>)}{type === 'other' && <span className="pill other selected">Other (legacy)</span>}</div>
      <div className="form-grid"><label className="field"><span>Amount <em className="required-mark" aria-hidden="true">*</em></span><div className="amount-input-wrap"><input type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required autoFocus aria-describedby="amount-currency-hint" /><span id="amount-currency-hint" className="amount-currency">{transaction ? currency : meta.settings.currency_code}</span></div></label>
        <label className="field"><span>Date <em className="required-mark" aria-hidden="true">*</em></span><input type="date" value={date} onChange={e => setDate(e.target.value)} required /></label></div>
      {transaction && <label className="field"><span>Currency</span><select value={currency} onChange={e => setCurrency(e.target.value)}>{SUPPORTED_CURRENCIES.map(code => <option key={code}>{code}</option>)}</select></label>}
      {type === 'other' && <label className="field"><span>How does this affect totals?</span><select value={effect} onChange={e => { setEffect(e.target.value as FinancialEffect); setCategory(''); }}><option value="expense">Expense</option><option value="income">Income</option><option value="neutral">Neutral</option></select></label>}
      {(type === 'expense' || type === 'other') && <><div className="form-grid"><label className="field"><span>Category</span><select value={category} onChange={e => setCategory(e.target.value)}><option value="">Uncategorized</option>{categories.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
        <label className="field"><span>Payment method</span><select value={method} onChange={e => setMethod(e.target.value)}><option value="">Not specified</option>{meta.payment_methods.filter(x => x.active || x.id === method).map(x => <option value={x.id} key={x.id}>{x.name}</option>)}</select></label></div></>}
      {(type === 'income' || type === 'other') && <label className="field"><span>{type === 'income' ? 'Account' : 'Account / card'}</span><select value={account} onChange={e => setAccount(e.target.value)}><option value="">Not specified</option>{meta.accounts.filter(x => x.active || x.id === account).map(x => <option value={x.id} key={x.id}>{x.name}</option>)}</select></label>}
      <label className="field"><span>Description</span><input value={description} onChange={e => setDescription(e.target.value)} placeholder="What was this for?" maxLength={300} /></label>
      <button type="button" className="text-button left" onClick={() => setMore(!more)}>{more ? 'Hide notes and tags' : '+ Add notes or tags'}</button>
      {more && <><label className="field"><span>Notes</span><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={2000} placeholder="Anything else to remember" /></label>
        <div className="field"><span>Tags</span><div className="tag-options">{meta.tags.filter(t => t.active || tags.includes(t.id)).map(t => <label className="tag-option" key={t.id}><input type="checkbox" checked={tags.includes(t.id)} onChange={e => setTags(e.target.checked ? [...tags, t.id] : tags.filter(x => x !== t.id))} />{t.name}</label>)}</div></div></>}
      {error && <div className="error-box" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : transaction ? 'Save changes' : 'Add transaction'}</button></div>
    </form>
  </div></div>;
}
