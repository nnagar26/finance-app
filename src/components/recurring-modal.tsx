'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { localDate, parseMoneyInput } from '@/lib/finance';
import type { Meta, RecurringRule, TransactionType, FinancialEffect, Frequency } from '@/lib/types';
import { SUPPORTED_CURRENCIES } from '@/lib/exchange-rates';

export default function RecurringModal({ meta, rule, onClose, onSaved }: { meta: Meta; rule?: RecurringRule | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(rule?.name ?? ''); const [amount, setAmount] = useState(rule ? (rule.amount_minor / 100).toFixed(2) : '');
  const [currency, setCurrency] = useState(rule?.currency_code ?? meta.settings.currency_code);
  const [type, setType] = useState<TransactionType>(rule?.type ?? 'expense');
  const [effect, setEffect] = useState<FinancialEffect>(rule?.other_effect ?? 'neutral');
  const [category, setCategory] = useState(rule?.category_id ?? ''); const [method, setMethod] = useState(rule?.payment_method_id ?? '');
  const [account, setAccount] = useState(rule?.account_id ?? ''); const [description, setDescription] = useState(rule?.description ?? '');
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'monthly');
  const [due, setDue] = useState(rule?.next_due_on ?? localDate(new Date(), meta.settings.time_zone));
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const res = await fetch('/api/mutate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'recurring.save', id: rule?.id,
        values: { name, amount_minor: parseMoneyInput(amount), currency_code: currency, type, other_effect: type === 'other' ? effect : null,
          category_id: category || null, payment_method_id: method || null, account_id: account || null,
          description, frequency, next_due_on: due, active: rule?.active ?? true } }) });
      const json = await res.json(); if (!res.ok) throw new Error(json.error);
      await onSaved(); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save.'); }
    finally { setBusy(false); }
  }
  const categoryKind = type === 'income' || type === 'other' && effect === 'income' ? 'income' : 'expense';
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal" role="dialog" aria-modal="true" aria-label="Recurring transaction">
    <div className="modal-head"><div><div className="eyebrow">AUTOMATE THE ROUTINE</div><h2>{rule ? 'Edit recurring item' : 'New recurring item'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
    <form onSubmit={save} className="stack gap-md">
      <label className="field"><span>Name</span><input value={name} onChange={e => setName(e.target.value)} required placeholder="Rent, salary, internet…" /></label>
      <div className="form-grid"><label className="field"><span>Amount</span><input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required /></label>
        <label className="field"><span>Currency</span><select value={currency} onChange={e => setCurrency(e.target.value)}>{SUPPORTED_CURRENCIES.map(code => <option key={code}>{code}</option>)}</select></label></div>
      <label className="field"><span>Type</span><select value={type} onChange={e => { setType(e.target.value as TransactionType); setCategory(''); if (e.target.value === 'other') setEffect('neutral'); }}>{['expense','income','other'].map(x => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}</select></label>
      {type === 'other' && <label className="field"><span>Effect on totals</span><select value={effect} onChange={e => { setEffect(e.target.value as FinancialEffect); setCategory(''); }}><option value="expense">Expense</option><option value="income">Income</option><option value="neutral">Neutral</option></select></label>}
      <div className="form-grid"><label className="field"><span>Frequency</span><select value={frequency} onChange={e => setFrequency(e.target.value as Frequency)}>{['weekly','biweekly','monthly','quarterly','yearly'].map(x => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}</select></label>
        <label className="field"><span>Next due date</span><input type="date" value={due} onChange={e => setDue(e.target.value)} required /></label></div>
      <label className="field"><span>Description</span><input value={description} onChange={e => setDescription(e.target.value)} /></label>
      <div className="form-grid"><label className="field"><span>Category</span><select value={category} onChange={e => setCategory(e.target.value)}><option value="">Uncategorized</option>{meta.categories.filter(c => c.active || c.id === category).filter(c => c.kind === 'both' || c.kind === categoryKind).map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
        <label className="field"><span>Payment method</span><select value={method} onChange={e => setMethod(e.target.value)}><option value="">Not specified</option>{meta.payment_methods.filter(x => x.active || x.id === method).map(x => <option value={x.id} key={x.id}>{x.name}</option>)}</select></label></div>
      <label className="field"><span>Account</span><select value={account} onChange={e => setAccount(e.target.value)}><option value="">Not specified</option>{meta.accounts.filter(x => x.active || x.id === account).map(x => <option value={x.id} key={x.id}>{x.name}</option>)}</select></label>
      <div className="notice">Due items wait for your review. They appear in totals only after you post them.</div>
      {error && <div className="error-box">{error}</div>}
      <div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save recurring item'}</button></div>
    </form>
  </div></div>;
}
