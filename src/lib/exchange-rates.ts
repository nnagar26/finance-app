import type { ExchangeRate, Transaction } from './types';

export const SUPPORTED_CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'INR'] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(value as SupportedCurrency);
}

export function rateKey(base: string, quote: string, date: string) {
  return `${base}:${quote}:${date}`;
}

export async function fetchHistoricalRate(base: string, quote: string, requestedDate: string): Promise<ExchangeRate> {
  if (!isSupportedCurrency(base) || !isSupportedCurrency(quote)) throw new Error('Unsupported currency.');
  if (base === quote) return { base_currency: base, quote_currency: quote, requested_date: requestedDate,
    effective_date: requestedDate, rate: 1, source: 'identity', fetched_at: new Date().toISOString() };
  // A future-dated transaction cannot have a historical rate yet. Use the
  // latest published rate, but retain the transaction date as the cache key.
  const latestPublishedDate = new Date().toISOString().slice(0, 10);
  const rateDate = requestedDate > latestPublishedDate ? latestPublishedDate : requestedDate;
  let response: Response;
  try {
    response = await fetch(`https://api.frankfurter.dev/v2/rate/${base}/${quote}?date=${rateDate}`, {
      headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new Error(`Could not fetch the ${base} → ${quote} rate for ${requestedDate}. Check your internet connection.`);
  }
  if (!response.ok) throw new Error(`Historical rate unavailable for ${base} → ${quote} on ${requestedDate}.`);
  const data = await response.json() as { date?: string; base?: string; quote?: string; rate?: number };
  if (!data.date || data.base !== base || data.quote !== quote || typeof data.rate !== 'number' || !Number.isFinite(data.rate) || data.rate <= 0) {
    throw new Error(`Historical rate unavailable for ${base} → ${quote} on ${requestedDate}.`);
  }
  return { base_currency: base, quote_currency: quote, requested_date: requestedDate,
    effective_date: data.date, rate: data.rate, source: 'Frankfurter reference rate', fetched_at: new Date().toISOString() };
}

export function applyRate(row: Transaction, quote: string, rate: ExchangeRate): Transaction {
  const numericRate = Number(rate.rate);
  if (!Number.isFinite(numericRate) || numericRate <= 0) throw new Error('Invalid cached exchange rate.');
  return { ...row, reporting_amount_minor: convertAtRate(row.amount_minor, String(numericRate)),
    reporting_currency_code: quote, exchange_rate: numericRate, exchange_rate_date: rate.effective_date };
}

function convertAtRate(minor: number, rate: string): number {
  if (!Number.isSafeInteger(minor) || minor < 0 || !/^\d+(?:\.\d{1,12})?$/.test(rate) || Number(rate) <= 0) throw new Error('Invalid conversion.');
  const [whole, fraction = ''] = rate.split('.');
  const denominator = BigInt(10) ** BigInt(fraction.length);
  const numerator = BigInt(whole) * denominator + BigInt(fraction || '0');
  const result = (BigInt(minor) * numerator + denominator / BigInt(2)) / denominator;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Converted amount is too large.');
  return Number(result);
}
