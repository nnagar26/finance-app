'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Meta } from '@/lib/types';
import type { MonthlyReport, ReportGroup } from '@/lib/finance';

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
type ReportView = 'both' | 'income' | 'expense';

type Props = {
  year: number;
  month: number;
  data: MonthlyReport | null;
  meta: Meta | null;
  money: (amount: number) => string;
  setYear: (year: number) => void;
  setMonth: (month: number) => void;
  shiftMonth: (delta: number) => void;
};

function Change({ current, previous, money, kind, previousPeriod }: {
  current: number;
  previous: number;
  money: Props['money'];
  kind: 'income' | 'expenses' | 'net';
  previousPeriod: string;
}) {
  const difference = current - previous;
  if (previous === 0) return <span className="report-change quiet">No {kind === 'net' ? 'net cash flow' : kind} in {previousPeriod}</span>;
  if (difference === 0) return <span className="report-change quiet">No change from {previousPeriod}</span>;
  const increase = difference > 0;
  const favorable = kind === 'expenses' ? !increase : increase;
  const percentage = previous > 0 ? ` (${Math.abs(difference / previous * 100).toFixed(1)}%)` : '';
  return <span className={`report-change ${favorable ? 'favorable' : 'unfavorable'}`}>
    <strong>{increase ? '↑' : '↓'} {money(Math.abs(difference))}{percentage}</strong>
    <span>{increase ? 'more' : 'less'} than {previousPeriod}</span>
  </span>;
}

function DetailTable({ title, subtitle, rows, total, names, empty, money, tone }: {
  title: string;
  subtitle: string;
  rows: ReportGroup[];
  total: number;
  names: (id: string | null) => string;
  empty: string;
  money: Props['money'];
  tone?: 'income';
}) {
  const count = rows.reduce((sum, row) => sum + row.count, 0);
  return <section className={`panel report-detail-panel${tone === 'income' ? ' income' : ''}`}>
    <div className="panel-head"><h3>{title}</h3><p>{subtitle}{count > 0 && ` · ${count} ${count === 1 ? 'transaction' : 'transactions'}`}</p></div>
    {rows.length ? <div className="report-table-scroll"><table className="report-table">
      <thead><tr><th scope="col">Name</th><th scope="col">Amount</th><th scope="col">Share</th><th scope="col">Transactions</th></tr></thead>
      <tbody>{rows.map(row => {
        const share = total > 0 ? row.amount / total * 100 : 0;
        return <tr key={row.id ?? '__none__'}>
        <th scope="row">{names(row.id)}</th>
        <td data-label="Amount">{money(row.amount)}</td>
        <td data-label="Share"><div className="report-share"><span>{share.toFixed(1)}%</span><span className="report-share-track" aria-hidden="true"><span style={{ width: `${share}%` }}/></span></div></td>
        <td data-label="Transactions">{row.count}</td>
      </tr>; })}</tbody>
    </table></div> : <p className="report-empty">{empty}</p>}
  </section>;
}

export default function ReportsPage({ year, month, data, meta, money, setYear, setMonth, shiftMonth }: Props) {
  const [view, setView] = useState<ReportView>('both');
  const showIncome = view !== 'expense';
  const showExpenses = view !== 'income';
  const period = `${months[month - 1]} ${year}`;
  const previousPeriod = data ? `${months[data.previousMonth - 1]} ${data.previousYear}` : 'previous month';
  const shortPeriod = `${months[month - 1].slice(0, 3)} ${year}`;
  const shortPreviousPeriod = data ? `${months[data.previousMonth - 1].slice(0, 3)} ${data.previousYear}` : 'previous month';
  const name = (entity: 'categories' | 'payment_methods' | 'accounts', id: string | null, fallback: string) =>
    id ? (meta?.[entity].find(item => item.id === id)?.name ?? fallback) : fallback;
  const chartRows = data?.days.map(day => ({ ...day, income: day.income / 100, expenses: day.expenses / 100 })) ?? [];
  const isActive = (income: number, expenses: number) => (showIncome && income > 0) || (showExpenses && expenses > 0);
  const hasActivity = data && isActive(data.summary.income, data.summary.expenses);
  const previousHasActivity = data && isActive(data.previous.income, data.previous.expenses);
  const activeDays = data?.days.filter(day => isActive(day.income, day.expenses)).length ?? 0;
  const peakKey = view === 'income' ? 'income' : 'expenses';
  const peakDay = data?.days.reduce((peak, day) => day[peakKey] > peak[peakKey] ? day : peak, data.days[0]);
  const dailyDescription = data?.days.filter(day => isActive(day.income, day.expenses))
    .map(day => `${months[month - 1]} ${day.day}: ${[showIncome && `income ${money(day.income)}`, showExpenses && `expenses ${money(day.expenses)}`].filter(Boolean).join(', ')}`).join('; ') ?? '';
  const dailySubject = view === 'both' ? 'Income and expenses' : view === 'income' ? 'Income' : 'Expenses';

  return <div className="reports-page">
    <div className="page-heading"><div><div className="eyebrow">MONTHLY DETAIL</div><h1>Reports</h1><p>Understand your income, spending, and what changed this month.</p></div>
    </div>
    <div className="report-toolbar">
      <div className="report-view-switch" role="group" aria-label="Report view">
        {([['both', 'Both'], ['income', 'Income'], ['expense', 'Expense']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>)}
      </div>
      <div className="report-month-control"><span>Month</span><div className="month-picker"><button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft size={18}/></button><select aria-label="Month" value={month} onChange={event => setMonth(Number(event.target.value))}>{months.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select><input aria-label="Year" type="number" min="1900" max="2200" value={year} onChange={event => setYear(Number(event.target.value))}/><button type="button" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight size={18}/></button></div></div>
    </div>
    {!data ? <div className="panel loading">Loading your report…</div> : <div className="report-stack">
      <section className="panel report-comparison" aria-label={`${period} summary`}>
        <div className="panel-head"><h2>{shortPeriod} vs {shortPreviousPeriod}</h2><p>{meta?.settings.currency_code ?? 'Reporting currency'} · Monthly comparison</p></div>
        <div className={`report-comparison-grid${view === 'both' ? '' : ' single'}`}>
          {showIncome && <div className="report-comparison-item"><span>Income</span><strong className="report-income">{money(data.summary.income)}</strong>{previousHasActivity && <Change current={data.summary.income} previous={data.previous.income} money={money} kind="income" previousPeriod={shortPreviousPeriod}/>}</div>}
          {showExpenses && <div className="report-comparison-item"><span>Expenses</span><strong className="report-expense">{money(data.summary.expenses)}</strong>{previousHasActivity && <Change current={data.summary.expenses} previous={data.previous.expenses} money={money} kind="expenses" previousPeriod={shortPreviousPeriod}/>}</div>}
          {view === 'both' && <div className="report-comparison-item"><span>Net cash flow</span><strong>{money(data.summary.savings)}</strong>{previousHasActivity && <Change current={data.summary.savings} previous={data.previous.savings} money={money} kind="net" previousPeriod={shortPreviousPeriod}/>}</div>}
        </div>
        {!previousHasActivity && <p className="report-comparison-note">No {view === 'both' ? 'activity' : view === 'income' ? 'income' : 'expenses'} in {previousPeriod} to compare.</p>}
      </section>
      <section className="panel report-daily-panel"><div className="panel-head"><h2>Daily activity</h2><p>{dailySubject} by day in {period}</p></div>
        {hasActivity ? <><div className="report-chart-context"><span><strong>{activeDays}</strong> {activeDays === 1 ? 'day' : 'days'} with activity</span>{peakDay && peakDay[peakKey] > 0 && <span>Highest {peakKey === 'income' ? 'income' : 'expense'} day <strong>{months[month - 1].slice(0, 3)} {peakDay.day} · {money(peakDay[peakKey])}</strong></span>}</div><div className="report-daily-chart" role="img" aria-label={`Daily ${dailySubject.toLowerCase()} for ${period}. ${dailyDescription}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartRows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={1}>
          <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--border)"/>
          <XAxis dataKey="day" interval={4} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} dy={8}/>
          <YAxis width={72} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={value => money(Math.round(Number(value) * 100)).replace(/\.00$/, '')}/>
          <Tooltip labelFormatter={day => `${months[month - 1]} ${day}`} formatter={value => money(Math.round(Number(value ?? 0) * 100))} contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} cursor={{ fill: 'var(--surface-soft)' }}/>
          {showIncome && <Bar dataKey="income" name="Income" fill="var(--green)" radius={[3, 3, 0, 0]}/>}{showExpenses && <Bar dataKey="expenses" name="Expenses" fill="var(--coral)" radius={[3, 3, 0, 0]}/>}
        </BarChart></ResponsiveContainer></div><div className="chart-legend">{showIncome && <span><i className="dot green-dot"/> Income</span>}{showExpenses && <span><i className="dot coral-dot"/> Expenses</span>}</div></> : <p className="report-empty">No {view === 'both' ? 'income or expenses' : view === 'income' ? 'income' : 'expenses'} recorded in {period}.</p>}
      </section>
      <div className="report-section-heading"><h2>Breakdowns</h2><p>{view === 'both' ? 'Explore where money went and which accounts received income.' : view === 'income' ? 'See which accounts received income.' : 'See where money went and how it was paid.'}</p></div>
      <div className={`report-detail-grid${view === 'income' ? ' income-only' : ''}`}>
        {showExpenses && <DetailTable title="Expenses by category" subtitle="Where spending went" rows={data.categories} total={data.summary.expenses} names={id => name('categories', id, 'Uncategorized')} empty="No expenses to group by category." money={money}/>}
        <div className="report-detail-side">
          {showExpenses && <DetailTable title="Expenses by payment method" subtitle="How expenses were paid" rows={data.methods} total={data.summary.expenses} names={id => name('payment_methods', id, 'Not specified')} empty="No expenses to group by payment method." money={money}/>}
          {showIncome && <DetailTable title="Income by account" subtitle="Where income landed" rows={data.accounts} total={data.summary.income} names={id => name('accounts', id, 'Not specified')} empty="No income to group by account." money={money} tone="income"/>}
        </div>
      </div>
    </div>}
  </div>;
}
