import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDemoLedger, writeDemoLedger } from '../scripts/demo-ledger.mjs';

const fixedNow = new Date('2026-09-24T16:00:00.000Z');

test('fictional demo ledger includes relative dates, standard accounts and linked examples', () => {
  const ledger = createDemoLedger(fixedNow);
  assert.equal(ledger.schema_version, 2);
  assert.deepEqual(ledger.accounts.map(item => item.name), [
    'Everyday Chequing', 'Emergency Savings', 'Demo Visa', 'Demo Mastercard', 'Demo Amex', 'Cash Wallet',
  ]);
  assert.equal(ledger.transactions.length, 8);
  assert.ok(ledger.transactions.some(row => row.description === 'XYZ Company payroll' && row.amount_minor === 480000));
  assert.ok(ledger.transactions.some(row => row.description === 'Monthly rent' && row.amount_minor === 165000));
  assert.ok(ledger.transactions.some(row => row.description === 'Mortgage payment' && row.amount_minor === 125000));
  assert.ok(ledger.transactions.every(row => /^2026-(08|09)-\d{2}$/.test(row.transaction_date)));
  const categoryIds = new Set(ledger.categories.map(item => item.id));
  const methodIds = new Set(ledger.payment_methods.map(item => item.id));
  const accountIds = new Set(ledger.accounts.map(item => item.id));
  assert.ok(ledger.transactions.every(row => categoryIds.has(row.category_id)));
  assert.ok(ledger.transactions.every(row => methodIds.has(row.payment_method_id)));
  assert.ok(ledger.transactions.every(row => accountIds.has(row.account_id)));
});

test('demo writer creates a private file and refuses to overwrite it', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'finance-demo-'));
  const output = path.join(directory, '.local-data', 'finance.json');
  try {
    await writeDemoLedger(output, fixedNow);
    const original = await readFile(output, 'utf8');
    await assert.rejects(() => writeDemoLedger(output, fixedNow), /Refusing to overwrite existing ledger/);
    assert.equal(await readFile(output, 'utf8'), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
