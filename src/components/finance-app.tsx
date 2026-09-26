'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, CreditCard, Download, LayoutDashboard, ListFilter, Menu, Moon, MoreHorizontal, Plus, Repeat2, Search, Settings2, Sun, Trash2, TrendingUp, Wallet, X } from 'lucide-react';
import { formatMoney, localDate, totals } from '@/lib/finance';
import type { Meta, Transaction, RecurringRule } from '@/lib/types';
import { SUPPORTED_CURRENCIES } from '@/lib/exchange-rates';
import TransactionModal from './transaction-modal';
import RecurringModal from './recurring-modal';

type Overview = { summary: ReturnType<typeof totals>; months: (ReturnType<typeof totals> & { month: number; key: string })[]; categories: { id: string; amount: number }[]; methods: { id: string; amount: number }[]; recent: Transaction[] };
type TransactionResult = { rows: Transaction[]; total: number; page: number; tagLinks: { transaction_id: string; tag_id: string }[] };
type CalendarResult = { rows: Transaction[]; dayRows: Transaction[]; dayTotals: ReturnType<typeof totals>; weekTotals: ReturnType<typeof totals>; monthTotals: ReturnType<typeof totals> };

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: CreditCard },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/reports', label: 'Reports', icon: TrendingUp },
  { href: '/recurring', label: 'Recurring', icon: Repeat2 },
  { href: '/settings', label: 'Settings', icon: Settings2 },
];
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const fetchJson = async <T,>(url: string): Promise<T> => { const response = await fetch(url, { cache: 'no-store' }); const json = await response.json(); if (!response.ok) throw new Error(json.error || 'Unable to load data.'); return json as T; };

export default function FinanceApp({ section, email, localMode = false }: { section: string; email: string; localMode?: boolean }) {
  const initial = new Date();
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth() + 1);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [transactions, setTransactions] = useState<TransactionResult | null>(null);
  const [calendar, setCalendar] = useState<CalendarResult | null>(null);
  const [selectedDay, setSelectedDay] = useState(localDate());
  const [filters, setFilters] = useState({ q: '', from: '', to: '', month: '', year: '', type: '', category: '', method: '', account: '', min: '', max: '', order: 'newest', page: '1' });
  const [showFilters, setShowFilters] = useState(false);
  const [reportMetric, setReportMetric] = useState<'expenses' | 'income' | 'both'>('expenses');
  const [editing, setEditing] = useState<Transaction | null | undefined>(undefined);
  const [editingTagIds, setEditingTagIds] = useState<string[]>([]);
  const [editingRule, setEditingRule] = useState<RecurringRule | null | undefined>(undefined);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const currency = meta?.settings.currency_code ?? 'CAD';
  const themePreference = meta?.settings.theme;
  const money = useCallback((v: number) => formatMoney(v, currency), [currency]);
  const nameOf = useCallback((entity: keyof Pick<Meta, 'categories'|'accounts'|'payment_methods'|'tags'>, id: string | null) => meta?.[entity].find(x => x.id === id)?.name ?? 'Uncategorized', [meta]);

  useEffect(() => { let live = true; fetchJson<Meta>('/api/data?view=meta').then(x => { if (live) setMeta(x); }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, [revision]);
  useEffect(() => {
    if (section !== 'dashboard' && section !== 'reports') return;
    let live = true; fetchJson<Overview>(`/api/data?view=overview&year=${year}&month=${month}`).then(x => { if (live) setOverview(x); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [section, year, month, revision]);
  useEffect(() => {
    if (section !== 'transactions') return;
    let live = true; const params = new URLSearchParams({ view: 'transactions', ...filters });
    fetchJson<TransactionResult>(`/api/data?${params}`).then(x => { if (live) setTransactions(x); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [section, filters, revision]);
  useEffect(() => {
    if (section !== 'calendar') return;
    let live = true; fetchJson<CalendarResult>(`/api/data?view=calendar&year=${year}&month=${month}&day=${selectedDay}`).then(x => { if (live) setCalendar(x); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [section, year, month, selectedDay, revision]);
  useEffect(() => {
    if (!themePreference) return;
    const theme = themePreference;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    window.localStorage.setItem('finance-theme', theme);
    apply();
    if (theme === 'system') media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [themePreference]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 780px)');
    const updateViewport = () => {
      setIsMobileViewport(media.matches);
      if (!media.matches) setMobileMenu(false);
    };
    updateViewport();
    media.addEventListener('change', updateViewport);
    return () => media.removeEventListener('change', updateViewport);
  }, []);

  function openMobileMenu() { setMobileMenu(true); }
  function closeMobileMenu() {
    setMobileMenu(false);
    requestAnimationFrame(() => menuButtonRef.current?.focus());
  }

  async function mutate(payload: Record<string, unknown>) {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/mutate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Unable to save.');
      setRevision(x => x + 1); return data.result;
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save.'); throw e; }
    finally { setBusy(false); }
  }
  const refresh = async () => { setRevision(x => x + 1); };
  function openAdd() {
    setEditingTagIds([]);
    setEditing(null);
  }
  async function changeCurrency(next: string) {
    if (next === currency) return;
    try { await mutate({ action: 'currency.setReporting', currency: next }); }
    catch { /* mutate already displays the actionable error */ }
  }
  function changeYear(value: number) { setYear(value); setSelectedDay(`${value}-${String(month).padStart(2, '0')}-01`); }
  function changeMonth(value: number) { setMonth(value); setSelectedDay(`${year}-${String(value).padStart(2, '0')}-01`); }
  async function openEdit(t: Transaction) {
    try {
      const result = await fetchJson<{ tag_ids: string[] }>(`/api/data?view=tags&id=${t.id}`);
      setEditingTagIds(result.tag_ids);
      setEditing(t);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load tags.'); }
  }
  function shiftMonth(delta: number) { const d = new Date(year, month - 1 + delta, 1); setYear(d.getFullYear()); setMonth(d.getMonth() + 1); setSelectedDay(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`); }
  function setQuickDateRange(days: number | null) {
    if (days === null) {
      setFilters(current => ({ ...current, from: '', to: '', month: '', year: '', page: '1' }));
      return;
    }
    const to = localDate(new Date(), meta?.settings.time_zone);
    const start = new Date(`${to}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    setFilters(current => ({ ...current, from: start.toISOString().slice(0, 10), to, month: '', year: '', page: '1' }));
  }
  function quickRangeActive(days: number) {
    const to = localDate(new Date(), meta?.settings.time_zone);
    const start = new Date(`${to}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    return filters.from === start.toISOString().slice(0, 10) && filters.to === to && !filters.month && !filters.year;
  }
  const dueCount = meta?.recurring_rules.filter(r => r.active && r.next_due_on <= localDate(new Date(), meta.settings.time_zone)).length ?? 0;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`} aria-hidden={isMobileViewport && !mobileMenu ? true : undefined} inert={isMobileViewport && !mobileMenu ? true : undefined}>
      <div className="brand"><div className="brand-mark">M</div><div><strong>myfinance<span>.</span></strong><small>PERSONAL FINANCE</small></div><button className="mobile-close icon-button" onClick={closeMobileMenu} aria-label="Close menu"><X size={20}/></button></div>
      <div className="nav-label">WORKSPACE</div><nav className="side-nav">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={closeMobileMenu} className={section === href.slice(1) ? 'nav-link active' : 'nav-link'}><Icon size={19} strokeWidth={1.9}/><span>{label}</span>{label === 'Recurring' && dueCount > 0 && <em>{dueCount}</em>}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="privacy-card"><div className="privacy-icon"><Wallet size={18}/></div><strong>Your money, clearly.</strong><span>A calmer way to see your financial life.</span></div><div className="account-chip"><div className="avatar">{email.slice(0,1).toUpperCase()}</div><div><strong>{localMode ? 'Local workspace' : 'Personal account'}</strong><small>{email}</small></div></div></div>
    </aside>
    <div className="main-wrap"><header className="topbar"><button className="icon-button hamburger" ref={menuButtonRef} onClick={openMobileMenu} aria-label="Open menu" aria-expanded={mobileMenu}><Menu size={22}/></button><div className="breadcrumb">Workspace <ChevronRight size={14}/> <strong>{section[0].toUpperCase() + section.slice(1)}</strong></div><div className="top-actions"><select className="currency-select" aria-label="Reporting currency" value={currency} disabled={busy || !meta} onChange={e => changeCurrency(e.target.value)}>{SUPPORTED_CURRENCIES.map(code => <option key={code}>{code}</option>)}</select><button className="button primary add-top" onClick={openAdd}><Plus size={18}/> Add transaction</button></div></header>
      <main className="content">
        {localMode && <div className="notice">Local mode · Data is saved in this project’s .local-data folder on this laptop.</div>}
        {error && <div className="error-box page-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={16}/></button></div>}
        {section === 'dashboard' && <>
          <PageHeading eyebrow="OVERVIEW" title="Your financial picture" description="A clear view of what came in, what went out, and what stayed." right={<MonthPicker year={year} month={month} setYear={changeYear} setMonth={changeMonth} shift={shiftMonth}/>}/>
          {overview ? <><div className="metric-grid"><Metric label="Total income" value={money(overview.summary.income)} icon={<ArrowDownLeft size={20}/>} color="green" detail="Money in this month"/><Metric label="Total expenses" value={money(overview.summary.expenses)} icon={<ArrowUpRight size={20}/>} color="coral" detail="Money out this month"/><Metric label="Net savings" value={money(overview.summary.savings)} icon={<Wallet size={20}/>} color="blue" detail="Income minus expenses"/></div>
            <div className="dashboard-grid"><div className="panel chart-panel"><PanelHead title="Income & expenses" subtitle={`${year} at a glance`}/><TrendChart rows={overview.months} money={money}/></div><div className="panel"><PanelHead title="Where it went" subtitle="Spending by category"/><Breakdown rows={overview.categories} name={id => nameOf('categories', id)} money={money}/></div></div>
            <div className="dashboard-grid lower"><div className="panel"><PanelHead title="Payment methods" subtitle="Net spending this month"/><Breakdown rows={overview.methods} name={id => nameOf('payment_methods', id)} money={money}/></div><div className="panel"><div className="panel-title-row"><PanelHead title="Recent activity" subtitle="Latest this month"/><Link href="/transactions" className="text-button">View all <ArrowUpRight size={15}/></Link></div><TransactionList rows={overview.recent} nameOf={nameOf} money={money} compact onEdit={openEdit}/></div></div>
          </> : <Loading/>}
        </>}
        {section === 'transactions' && <>
          <PageHeading eyebrow="LEDGER" title="Transactions" description="Every detail, all in one place." right={<button className="button secondary" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} aria-controls="transaction-filters"><ListFilter size={17}/> Filters</button>}/>
          <div className="panel transaction-panel"><div className="transaction-toolbar"><div className="search-box"><Search size={18}/><input aria-label="Search transactions" placeholder="Search descriptions and notes…" value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value, page: '1' })}/></div><select aria-label="Sort transactions" value={filters.order} onChange={e => setFilters({ ...filters, order: e.target.value, page: '1' })}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount_desc">Highest amount</option><option value="amount_asc">Lowest amount</option></select></div><div className="quick-ranges" aria-label="Quick date filters"><button className={!filters.from && !filters.to && !filters.month && !filters.year ? 'active' : ''} onClick={() => setQuickDateRange(null)}>All dates</button><button className={quickRangeActive(7) ? 'active' : ''} onClick={() => setQuickDateRange(7)}>Last 7 days</button><button className={quickRangeActive(30) ? 'active' : ''} onClick={() => setQuickDateRange(30)}>Last 30 days</button></div>
            {showFilters && <div className="filters-grid" id="transaction-filters"><label className="field"><span>From</span><input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value, page: '1' })}/></label><label className="field"><span>To</span><input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value, page: '1' })}/></label>
              <label className="field"><span>Month</span><select value={filters.month} onChange={e => setFilters({ ...filters, month: e.target.value, page: '1' })}><option value="">Any month</option>{months.map((m,i) => <option key={m} value={i+1}>{m}</option>)}</select></label><label className="field"><span>Year</span><input type="number" min="1900" max="2200" placeholder="Any year" value={filters.year} onChange={e => setFilters({ ...filters, year: e.target.value, page: '1' })}/></label>
              <label className="field"><span>Type</span><select value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value, page: '1' })}><option value="">All types</option>{['expense','income','other'].map(x => <option key={x} value={x}>{x[0].toUpperCase()+x.slice(1)}</option>)}</select></label>
              <label className="field"><span>Category</span><select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value, page: '1' })}><option value="">All categories</option>{meta?.categories.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
              <label className="field"><span>Payment method</span><select value={filters.method} onChange={e => setFilters({ ...filters, method: e.target.value, page: '1' })}><option value="">All methods</option>{meta?.payment_methods.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
              <label className="field"><span>Account</span><select value={filters.account} onChange={e => setFilters({ ...filters, account: e.target.value, page: '1' })}><option value="">All accounts</option>{meta?.accounts.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
              <label className="field"><span>Minimum amount</span><input type="number" min="0" step="0.01" value={filters.min} onChange={e => setFilters({ ...filters, min: e.target.value, page: '1' })}/></label><label className="field"><span>Maximum amount</span><input type="number" min="0" step="0.01" value={filters.max} onChange={e => setFilters({ ...filters, max: e.target.value, page: '1' })}/></label>
              <button className="text-button filter-reset" onClick={() => setFilters({ q: '', from: '', to: '', month: '', year: '', type: '', category: '', method: '', account: '', min: '', max: '', order: 'newest', page: '1' })}>Clear filters</button></div>}
            <div className="list-count">{transactions ? `${transactions.total} transaction${transactions.total === 1 ? '' : 's'}` : 'Loading transactions…'}</div>
            {transactions && <><TransactionList rows={transactions.rows} nameOf={nameOf} money={money} onEdit={openEdit} onDelete={async t => { if (confirm(`Delete “${t.description || 'this transaction'}”?`)) await mutate({ action: 'transaction.delete', id: t.id }); }}/><div className="pagination"><span>Page {transactions.page} of {Math.max(1, Math.ceil(transactions.total/25))}</span><div><button className="icon-button" disabled={transactions.page <= 1} onClick={() => setFilters({ ...filters, page: String(transactions.page - 1) })}><ChevronLeft size={18}/></button><button className="icon-button" disabled={transactions.page * 25 >= transactions.total} onClick={() => setFilters({ ...filters, page: String(transactions.page + 1) })}><ChevronRight size={18}/></button></div></div></>}
          </div>
        </>}
        {section === 'reports' && <><PageHeading eyebrow="INSIGHTS" title="Reports" description="Spot patterns and see how each month compares." right={<MonthPicker year={year} month={month} setYear={changeYear} setMonth={changeMonth} shift={shiftMonth}/>}/>
          {overview ? <div className="report-stack"><div className="metric-grid"><Metric label="Income" value={money(overview.summary.income)} icon={<ArrowDownLeft size={20}/>} color="green"/><Metric label="Net spending" value={money(overview.summary.netSpending)} icon={<ArrowUpRight size={20}/>} color="coral"/><Metric label="Savings" value={money(overview.summary.savings)} icon={<Wallet size={20}/>} color="blue"/></div>
            <div className="panel chart-panel"><PanelHead title="Monthly movement" subtitle={`Income and net spending across ${year}`}/><TrendChart rows={overview.months} money={money}/></div>
            <div className="dashboard-grid lower"><div className="panel"><PanelHead title="Category breakdown" subtitle={`${months[month-1]} ${year}`}/><Breakdown rows={overview.categories} name={id => nameOf('categories', id)} money={money}/></div><div className="panel"><PanelHead title="By payment method" subtitle={`${months[month-1]} ${year}`}/><Breakdown rows={overview.methods} name={id => nameOf('payment_methods', id)} money={money}/></div></div>
            <div className="panel chart-panel"><div className="panel-title-row report-chart-heading"><PanelHead title="Month by month" subtitle={`${reportMetric === 'both' ? 'Income and expenses' : reportMetric === 'income' ? 'Income' : 'Expenses'} across ${year}`}/><div className="report-metric-switch" role="group" aria-label="Month by month chart metric"><button type="button" className={reportMetric === 'expenses' ? 'active expenses' : ''} aria-pressed={reportMetric === 'expenses'} onClick={() => setReportMetric('expenses')}>Expenses</button><button type="button" className={reportMetric === 'income' ? 'active income' : ''} aria-pressed={reportMetric === 'income'} onClick={() => setReportMetric('income')}>Income</button><button type="button" className={reportMetric === 'both' ? 'active both' : ''} aria-pressed={reportMetric === 'both'} onClick={() => setReportMetric('both')}>Both</button></div></div><MonthlyBarChart rows={overview.months} metric={reportMetric} money={money}/></div>
          </div> : <Loading/>}</>}
        {section === 'calendar' && <><PageHeading eyebrow="DAILY VIEW" title="Spending calendar" description="See the rhythm of your everyday spending." right={<MonthPicker year={year} month={month} setYear={changeYear} setMonth={changeMonth} shift={shiftMonth}/>}/>
          {calendar ? <><div className="calendar-layout"><div className="panel calendar-panel"><div className="calendar-weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x => <span key={x}>{x}</span>)}</div><div className="calendar-grid">{calendarCells(year,month).map((day,i) => day ? <button key={i} className={`calendar-cell ${selectedDay === day ? 'selected' : ''}`} onClick={() => setSelectedDay(day)}><span>{Number(day.slice(-2))}</span><strong>{money(totals(calendar.rows.filter(t => t.transaction_date === day)).netSpending)}</strong></button> : <div className="calendar-cell empty" key={i}/>)}</div></div>
            <div className="calendar-side"><div className="panel"><div className="eyebrow">SELECTED DAY</div><h2>{new Date(`${selectedDay}T12:00:00Z`).toLocaleDateString('en-CA',{ weekday:'long', month:'long', day:'numeric' })}</h2><div className="daily-total">{money(calendar.dayTotals.netSpending)}</div><p className="muted">Net spending on this day</p><div className="mini-totals"><div><span>This week</span><strong>{money(calendar.weekTotals.netSpending)}</strong></div><div><span>This month</span><strong>{money(calendar.monthTotals.netSpending)}</strong></div></div></div><div className="panel"><PanelHead title="Transactions" subtitle={`${calendar.dayRows.length} on this day`}/><TransactionList rows={calendar.dayRows} nameOf={nameOf} money={money} compact onEdit={openEdit}/></div></div></div>
          </> : <Loading/>}</>}
        {section === 'recurring' && meta && <><PageHeading eyebrow="ROUTINES" title="Recurring transactions" description="Keep regular payments ready without losing control." right={<button className="button secondary" onClick={() => setEditingRule(null)}><Plus size={17}/> New recurring item</button>}/>
          {dueCount > 0 && <div className="panel due-panel"><PanelHead title="Ready for review" subtitle="Post or skip each due item. Only posted items affect your totals."/>{meta.recurring_rules.filter(r => r.active && r.next_due_on <= localDate(new Date(), meta.settings.time_zone)).map(r => <div className="rule-row" key={r.id}><div className="rule-icon"><Repeat2 size={19}/></div><div className="rule-main"><strong>{r.name}</strong><span>Due {r.next_due_on} · {r.frequency}</span></div><strong>{formatMoney(r.amount_minor, r.currency_code)}</strong><div className="rule-actions"><button className="button small ghost" disabled={busy} onClick={() => mutate({ action: 'recurring.review', id: r.id, choice: 'skip' })}>Skip</button><button className="button small primary" disabled={busy} onClick={() => mutate({ action: 'recurring.review', id: r.id, choice: 'post' })}>Post</button></div></div>)}</div>}
          <div className="panel"><PanelHead title="Your recurring items" subtitle="Review the next due date and amount before posting"/>{meta.recurring_rules.length ? meta.recurring_rules.map(r => <div className="rule-row" key={r.id}><div className="rule-icon"><Repeat2 size={19}/></div><div className="rule-main"><strong>{r.name}</strong><span>{r.frequency} · Next {r.next_due_on} · {r.active ? 'Active' : 'Paused'}</span></div><strong>{formatMoney(r.amount_minor, r.currency_code)}</strong><div className="rule-actions"><button className="button small ghost" onClick={() => setEditingRule(r)}>Edit</button><button className="button small ghost" disabled={busy} onClick={() => mutate({ action: 'recurring.archive', id: r.id, active: !r.active })}>{r.active ? 'Pause' : 'Resume'}</button></div></div>) : <Empty title="Nothing recurring yet" description="Add rent, salary, subscriptions, or any routine payment."/>}</div>
        </>}
        {section === 'settings' && meta && <SettingsPage meta={meta} email={email} localMode={localMode} money={money} mutate={mutate} busy={busy}/>}
      </main>
    </div>
    <nav className="bottom-nav">{links.slice(0,5).map(({ href,label,icon:Icon }) => <Link href={href} key={href} className={section === href.slice(1) ? 'active' : ''}><Icon size={20}/><span>{label}</span></Link>)}</nav>
    <button className="mobile-add" aria-label="Add transaction" onClick={openAdd}><Plus size={25}/></button>
    {meta && editing !== undefined && <TransactionModal meta={meta} transaction={editing} tagIds={editingTagIds} onClose={() => setEditing(undefined)} onSaved={refresh}/>}
    {meta && editingRule !== undefined && <RecurringModal meta={meta} rule={editingRule} onClose={() => setEditingRule(undefined)} onSaved={refresh}/>}
  </div>;
}

function PageHeading({ eyebrow, title, description, right }: { eyebrow: string; title: string; description: string; right?: React.ReactNode }) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{right && <div className="heading-actions">{right}</div>}</div>; }
function MonthPicker({ year, month, setYear, setMonth, shift }: { year: number; month: number; setYear: (x:number)=>void; setMonth:(x:number)=>void; shift:(x:number)=>void }) { return <div className="month-picker"><button onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={18}/></button><select aria-label="Month" value={month} onChange={e => setMonth(Number(e.target.value))}>{months.map((m,i) => <option key={m} value={i+1}>{m}</option>)}</select><input aria-label="Year" type="number" min="1900" max="2200" value={year} onChange={e => setYear(Number(e.target.value))}/><button onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={18}/></button></div>; }
function Metric({ label, value, icon, color, detail }: { label: string; value: string; icon: React.ReactNode; color: string; detail?: string }) { return <div className="metric panel"><div className="metric-top"><span>{label}</span><div className={`metric-icon ${color}`}>{icon}</div></div><strong>{value}</strong><small>{detail ?? 'Selected month'}</small></div>; }
function PanelHead({ title, subtitle }: { title: string; subtitle: string }) { return <div className="panel-head"><h2>{title}</h2><p>{subtitle}</p></div>; }
function Loading() { return <div className="panel loading">Loading your finances…</div>; }
function Empty({ title, description }: { title: string; description: string }) { return <div className="empty-state"><div className="empty-icon"><Wallet size={23}/></div><strong>{title}</strong><span>{description}</span></div>; }
function TrendChart({ rows, money }: { rows: Overview['months']; money: (v:number)=>string }) { return <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={rows.map(r => ({ name: months[r.month-1].slice(0,3), income: r.income/100, spending: r.netSpending/100 }))} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}><defs><linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#63baa2" stopOpacity={0.22}/><stop offset="100%" stopColor="#63baa2" stopOpacity={0}/></linearGradient><linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e5a98f" stopOpacity={0.18}/><stop offset="100%" stopColor="#e5a98f" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--border)"/><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} dy={10}/><YAxis width={72} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => money(Math.round(Number(v)*100)).replace(/\.00$/, '')}/><Tooltip formatter={value => money(Math.round(Number(value ?? 0)*100))} contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}/><Area type="monotone" dataKey="income" stroke="#4da88e" strokeWidth={2.5} fill="url(#incomeFill)" name="Income"/><Area type="monotone" dataKey="spending" stroke="#dd9477" strokeWidth={2.5} fill="url(#spendFill)" name="Spending"/></AreaChart></ResponsiveContainer><div className="chart-legend"><span><i className="dot green-dot"/> Income</span><span><i className="dot coral-dot"/> Net spending</span></div></div>; }
function MonthlyBarChart({ rows, metric, money }: { rows: Overview['months']; metric: 'income' | 'expenses' | 'both'; money: (v:number)=>string }) {
  const data = rows.map(row => ({ name: months[row.month-1].slice(0, 3), income: row.income / 100, expenses: row.expenses / 100 }));
  const description = rows.map(row => `${months[row.month-1]} ${metric === 'both' ? `income ${money(row.income)}, expenses ${money(row.expenses)}` : money(row[metric])}`).join(', ');
  return <div className="chart-wrap" role="img" aria-label={`Monthly ${metric}: ${description}`}>
    <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 10, right: 8, left: -8, bottom: 0 }} barGap={2}>
      <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--border)"/>
      <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} dy={10}/>
      <YAxis width={72} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={value => money(Math.round(Number(value) * 100)).replace(/\.00$/, '')}/>
      <Tooltip formatter={value => money(Math.round(Number(value ?? 0) * 100))} contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} cursor={{ fill: 'var(--surface-soft)' }}/>
      {metric !== 'income' && <Bar dataKey="expenses" name="Expenses" fill="var(--coral)" radius={[5, 5, 0, 0]} maxBarSize={42}/>}
      {metric !== 'expenses' && <Bar dataKey="income" name="Income" fill="var(--green)" radius={[5, 5, 0, 0]} maxBarSize={42}/>}
    </BarChart></ResponsiveContainer>
  </div>;
}
function Breakdown({ rows, name, money }: { rows: { id:string; amount:number }[]; name:(id:string)=>string; money:(v:number)=>string }) { const visible = rows.filter(x => x.amount !== 0).slice(0,8); const max = Math.max(...visible.map(x => Math.abs(x.amount)),1); return visible.length ? <div className="breakdown">{visible.map((x,i) => <div className="breakdown-row" key={x.id}><div className="breakdown-line"><span><i className={`category-dot dot-${i%5}`}/>{name(x.id)}</span><strong>{money(x.amount)}</strong></div><div className="bar-track"><div style={{ width: `${Math.abs(x.amount)/max*100}%`, background: `var(--chart-${i%5})` }}/></div></div>)}</div> : <Empty title="No spending yet" description="Your breakdown will appear as transactions come in."/>; }
function TransactionList({ rows, nameOf, money, compact, onEdit, onDelete }: { rows:Transaction[]; nameOf:(entity:'categories'|'accounts'|'payment_methods'|'tags',id:string|null)=>string; money:(v:number)=>string; compact?:boolean; onEdit:(t:Transaction)=>void; onDelete?:(t:Transaction)=>void }) { return rows.length ? <div className={compact ? 'transaction-list compact' : 'transaction-list'}>{rows.map(t => { const incoming = t.type === 'income' || t.type === 'other' && t.other_effect === 'income'; const neutral = t.type === 'other' && t.other_effect === 'neutral'; const reporting = t.reporting_amount_minor ?? t.amount_minor; const converted = t.reporting_currency_code && t.reporting_currency_code !== t.currency_code; return <div className="transaction-row" key={t.id}><div className={`transaction-icon ${incoming ? 'incoming' : neutral ? 'neutral' : 'outgoing'}`}>{incoming ? <ArrowDownLeft size={18}/> : neutral ? <MoreHorizontal size={18}/> : <ArrowUpRight size={18}/>}</div><div className="transaction-main"><strong>{t.description || nameOf('categories',t.category_id)}</strong><span>{nameOf('categories',t.category_id)} · {t.transaction_date}{!compact && t.payment_method_id ? ` · ${nameOf('payment_methods',t.payment_method_id)}` : ''}</span></div><div className="transaction-amount"><strong className={incoming ? 'positive' : neutral ? '' : 'negative'}>{neutral ? '' : incoming ? '+' : '-'}{money(reporting)}</strong>{converted && <span>{formatMoney(t.amount_minor, t.currency_code)} original</span>}{!compact && <span>{t.type}</span>}</div><div className="row-buttons"><button className="icon-button" aria-label="Edit transaction" onClick={() => onEdit(t)}><MoreHorizontal size={18}/></button>{onDelete && <button className="icon-button danger" aria-label="Delete transaction" onClick={() => onDelete(t)}><Trash2 size={16}/></button>}</div></div>; })}</div> : <Empty title="No transactions found" description="Add one to get started, or adjust your filters."/>; }
function calendarCells(year: number, month: number) { const first = new Date(Date.UTC(year,month-1,1)); const offset = (first.getUTCDay()+6)%7; const days = new Date(Date.UTC(year,month,0)).getUTCDate(); const cells:(string|null)[] = Array(offset).fill(null); for(let d=1;d<=days;d++) cells.push(`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`); while(cells.length%7) cells.push(null); return cells; }

function SettingsPage({ meta, email, localMode, mutate, busy }: { meta:Meta; email:string; localMode:boolean; money:(v:number)=>string; mutate:(payload:Record<string,unknown>)=>Promise<unknown>; busy:boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<'categories'|'accounts'|'payment_methods'|'tags'>('categories');
  const [name, setName] = useState(''); const [kind, setKind] = useState('expense');
  const [editingRef, setEditingRef] = useState<string | null>(null);
  async function saveRef(e: React.FormEvent) { e.preventDefault(); try { await mutate({ action: 'reference.save', entity: tab, id: editingRef, name, kind }); setName(''); setEditingRef(null); } catch {} }
  async function deleteRef(referenceId: string, referenceName: string) {
    if (!confirm(`Permanently delete “${referenceName}”?`)) return;
    try { await mutate({ action: 'reference.delete', entity: tab, id: referenceId }); }
    catch { /* mutate shows the reason */ }
  }
  const rows = meta[tab];
  return <><PageHeading eyebrow="PREFERENCES" title="Settings" description="Make this workspace yours."/>
    <div className="settings-grid"><div className="panel"><PanelHead title="Appearance" subtitle="Choose the look that feels right"/><div className="theme-options">{(['light','dark','system'] as const).map(x => <button key={x} className={meta.settings.theme === x ? 'theme-choice active' : 'theme-choice'} onClick={() => mutate({ action: 'settings.save', values: { theme: x } })}>{x === 'dark' ? <Moon size={18}/> : <Sun size={18}/>} {x[0].toUpperCase()+x.slice(1)}</button>)}</div><div className="setting-line"><div><strong>Time zone</strong><span>Used for today and recurring due dates</span></div><span>{meta.settings.time_zone}</span></div><div className="setting-line"><div><strong>{localMode ? 'Storage' : 'Signed in as'}</strong><span>{localMode ? 'Private file in this project' : 'Owner-only workspace'}</span></div><span>{localMode ? 'This laptop' : email}</span></div>{!localMode && <button className="text-button left" onClick={async () => { const { browserSupabase } = await import('@/lib/supabase-browser'); await browserSupabase().auth.signOut(); router.replace('/login'); router.refresh(); }}>Sign out</button>}</div>
      <div className="panel"><PanelHead title="Reporting currency" subtitle="Choose it from the top bar"/><div className="currency-current"><span>Current reporting currency</span><strong>{meta.settings.currency_code}</strong></div><p className="muted small-text">Transactions keep their original amount and currency. Dashboard and report values use cached reference rates from each transaction date.</p></div></div>
    <div className="panel manage-panel"><PanelHead title="Manage your lists" subtitle="Keep categories, accounts, methods, and tags organized"/><div className="tab-row">{(['categories','accounts','payment_methods','tags'] as const).map(x => <button className={tab === x ? 'active' : ''} onClick={() => { setTab(x); setKind(x === 'accounts' ? 'other' : 'expense'); setName(''); setEditingRef(null); }} key={x}>{x === 'payment_methods' ? 'Payment methods' : x[0].toUpperCase()+x.slice(1)}</button>)}</div><form className="add-reference" onSubmit={saveRef}><input value={name} onChange={e => setName(e.target.value)} placeholder={`${editingRef ? 'Rename' : 'New'} ${tab === 'payment_methods' ? 'payment method' : tab.slice(0,-1)}`} required/>{tab === 'categories' && <select value={kind} onChange={e => setKind(e.target.value)}><option value="expense">Expense</option><option value="income">Income</option><option value="both">Both</option></select>}{tab === 'accounts' && <select value={kind} onChange={e => setKind(e.target.value)}><option value="other">Other</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="card">Card</option></select>}<button className="button primary" disabled={busy}><Plus size={16}/> {editingRef ? 'Save' : 'Add'}</button>{editingRef && <button type="button" className="button ghost" onClick={() => { setEditingRef(null); setName(''); }}>Cancel</button>}</form><div className="reference-list">{rows.map(x => <div className="reference-row" key={x.id}><span>{x.name}{x.kind && <em>{x.kind}</em>}{Boolean(x.usage_count) && <em>{x.usage_count} in use</em>}</span><div><button className="text-button" onClick={() => { setEditingRef(x.id); setName(x.name); setKind(x.kind ?? 'expense'); }}>Edit</button><button className="text-button" disabled={busy} onClick={() => mutate({ action: 'reference.archive', entity: tab, id: x.id, active: !x.active })}>{x.active ? 'Archive' : 'Restore'}</button><button className="text-button danger-text" disabled={busy || Boolean(x.usage_count)} title={x.usage_count ? `Used by ${x.usage_count} records—archive instead` : 'Permanently delete'} onClick={() => deleteRef(x.id, x.name)}>Delete</button></div></div>)}</div></div>
    <div className="panel export-panel"><div><PanelHead title="Your data, yours to keep" subtitle="Download all transactions in a spreadsheet-friendly CSV file"/></div><Link href="/api/export" className="button secondary"><Download size={17}/> Export CSV</Link></div>
  </>;
}
