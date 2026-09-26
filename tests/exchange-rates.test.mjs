import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRate, fetchHistoricalRate, isSupportedCurrency, rateKey } from '../src/lib/exchange-rates.ts';

test('INR is an available reporting and transaction currency', () => {
  assert.equal(isSupportedCurrency('INR'), true);
});

test('historical rate conversion preserves original transaction values', () => {
  const row = { id: crypto.randomUUID(), owner_id: crypto.randomUUID(), transaction_date: '2024-09-03',
    amount_minor: 10001, currency_code: 'CAD', type: 'expense', other_effect: null,
    category_id: null, payment_method_id: null, account_id: null, description: '', notes: '',
    recurring_occurrence_id: null, created_at: new Date().toISOString() };
  const converted = applyRate(row, 'USD', { base_currency: 'CAD', quote_currency: 'USD',
    requested_date: '2024-09-03', effective_date: '2024-09-03', rate: 0.74,
    source: 'test', fetched_at: new Date().toISOString() });
  assert.equal(converted.amount_minor, 10001);
  assert.equal(converted.currency_code, 'CAD');
  assert.equal(converted.reporting_amount_minor, 7401);
  assert.equal(converted.reporting_currency_code, 'USD');
  assert.equal(rateKey('CAD', 'USD', '2024-09-03'), 'CAD:USD:2024-09-03');
});

test('historical lookup retains the requested weekend and published effective date', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(String(url), /CAD\/USD\?date=2024-08-31$/);
    return new Response(JSON.stringify({ date: '2024-08-30', base: 'CAD', quote: 'USD', rate: 0.7412 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const rate = await fetchHistoricalRate('CAD', 'USD', '2024-08-31');
    assert.equal(rate.requested_date, '2024-08-31');
    assert.equal(rate.effective_date, '2024-08-30');
    assert.equal(rate.rate, 0.7412);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('future-dated transactions use the latest published rate', async () => {
  const originalFetch = globalThis.fetch;
  const latestPublishedDate = new Date().toISOString().slice(0, 10);
  const futureDate = new Date(`${latestPublishedDate}T12:00:00Z`);
  futureDate.setUTCDate(futureDate.getUTCDate() + 7);
  const requestedDate = futureDate.toISOString().slice(0, 10);
  globalThis.fetch = async url => {
    assert.match(String(url), new RegExp(`CAD/GBP\\?date=${latestPublishedDate}$`));
    return new Response(JSON.stringify({ date: latestPublishedDate, base: 'CAD', quote: 'GBP', rate: 0.58 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const rate = await fetchHistoricalRate('CAD', 'GBP', requestedDate);
    assert.equal(rate.requested_date, requestedDate);
    assert.equal(rate.effective_date, latestPublishedDate);
    assert.equal(rate.rate, 0.58);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
