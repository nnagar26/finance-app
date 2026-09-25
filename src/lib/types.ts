export type TransactionType = 'expense' | 'income' | 'other';
export type LegacyTransactionType = TransactionType | 'salary' | 'refund' | 'transfer';
export type FinancialEffect = 'income' | 'expense' | 'neutral';
export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Transaction {
  id: string;
  owner_id: string;
  transaction_date: string;
  amount_minor: number;
  currency_code: string;
  type: TransactionType;
  other_effect: FinancialEffect | null;
  category_id: string | null;
  payment_method_id: string | null;
  account_id: string | null;
  description: string;
  notes: string;
  recurring_occurrence_id: string | null;
  created_at: string;
  reporting_amount_minor?: number;
  reporting_currency_code?: string;
  exchange_rate?: number;
  exchange_rate_date?: string;
}

export interface ReferenceItem { id: string; name: string; active: boolean; kind?: string; usage_count?: number }
export interface RecurringRule {
  id: string; name: string; amount_minor: number; currency_code: string;
  type: TransactionType; other_effect: FinancialEffect | null;
  category_id: string | null; payment_method_id: string | null; account_id: string | null;
  description: string; frequency: Frequency; anchor_day: number; next_due_on: string; active: boolean;
}
export interface Settings { currency_code: string; time_zone: string; theme: 'light' | 'dark' | 'system' }
export interface ExchangeRate {
  base_currency: string;
  quote_currency: string;
  requested_date: string;
  effective_date: string;
  rate: number;
  source: string;
  fetched_at: string;
}
export interface Meta {
  settings: Settings;
  categories: ReferenceItem[];
  accounts: ReferenceItem[];
  payment_methods: ReferenceItem[];
  tags: ReferenceItem[];
  recurring_rules: RecurringRule[];
  conversion_batches: { id: string; from_currency: string; to_currency: string; rate: number; created_at: string }[];
}
