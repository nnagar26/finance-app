import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OWNER_ID = '00000000-0000-4000-8000-000000000001';

function reference(name, kind) {
  return { id: randomUUID(), name, active: true, ...(kind ? { kind } : {}) };
}

function torontoDateParts(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function createDemoLedger(now = new Date()) {
  const today = torontoDateParts(now);
  const priorMonthDate = new Date(Date.UTC(today.year, today.month - 2, 15));
  const currentDate = day => isoDate(today.year, today.month, Math.max(1, Math.min(today.day, day)));
  const priorDate = day => isoDate(priorMonthDate.getUTCFullYear(), priorMonthDate.getUTCMonth() + 1, day);
  const categories = [reference('Salary', 'income'), reference('Other Income', 'income'),
    ...['Groceries', 'Dining', 'Rent', 'Utilities', 'Mortgage', 'Gas', 'Car Maintenance',
      'Car Insurance', 'Car loan', 'Internet (WiFi)', 'Phone', 'Household Supplies',
      'Shopping', 'Entertainment', 'Travel', 'Subscriptions', 'Gifts', 'Banking/Fees',
      'Home Maintenance', 'House Insurance', 'Transportation'].map(name => reference(name, 'expense')),
    reference('Miscellaneous', 'both')];
  const accounts = [reference('Everyday Chequing', 'bank'), reference('Emergency Savings', 'bank'),
    reference('Demo Visa', 'card'), reference('Demo Mastercard', 'card'),
    reference('Demo Amex', 'card'), reference('Cash Wallet', 'cash')];
  const paymentMethods = ['Cash', 'Debit Card', 'Credit Card', 'Bank Account', 'E-transfer',
    'Apple Pay', 'Google Pay', 'Other'].map(name => reference(name));
  const category = name => categories.find(item => item.name === name).id;
  const account = name => accounts.find(item => item.name === name).id;
  const method = name => paymentMethods.find(item => item.name === name).id;
  const createdAt = now.toISOString();
  const transaction = (transaction_date, amount_minor, type, categoryName, description, methodName, accountName) => ({
    id: randomUUID(), owner_id: OWNER_ID, transaction_date, amount_minor, currency_code: 'CAD', type,
    other_effect: null, category_id: category(categoryName), payment_method_id: method(methodName),
    account_id: account(accountName), description, notes: '', recurring_occurrence_id: null, created_at: createdAt,
  });

  return {
    schema_version: 2,
    settings: { currency_code: 'CAD', time_zone: 'America/Toronto', theme: 'system' },
    categories, accounts, payment_methods: paymentMethods, tags: [], recurring_rules: [], conversion_batches: [],
    transactions: [
      transaction(currentDate(1), 480000, 'income', 'Salary', 'XYZ Company payroll', 'Bank Account', 'Everyday Chequing'),
      transaction(currentDate(1), 165000, 'expense', 'Rent', 'Monthly rent', 'Bank Account', 'Everyday Chequing'),
      transaction(currentDate(Math.max(1, today.day - 2)), 12684, 'expense', 'Groceries', 'Weekly groceries', 'Credit Card', 'Demo Visa'),
      transaction(currentDate(Math.max(1, today.day - 5)), 9420, 'expense', 'Utilities', 'Electricity bill', 'Credit Card', 'Demo Mastercard'),
      transaction(currentDate(Math.max(1, today.day - 3)), 3875, 'expense', 'Dining', 'Dinner with friends', 'Credit Card', 'Demo Amex'),
      transaction(currentDate(Math.max(1, today.day - 9)), 1699, 'expense', 'Subscriptions', 'Music subscription', 'Credit Card', 'Demo Visa'),
      transaction(priorDate(1), 480000, 'income', 'Salary', 'XYZ Company payroll', 'Bank Account', 'Everyday Chequing'),
      transaction(priorDate(5), 125000, 'expense', 'Mortgage', 'Mortgage payment', 'Bank Account', 'Everyday Chequing'),
    ],
    tag_links: [], occurrences: [], conversion_lines: [], exchange_rates: [],
  };
}

export async function writeDemoLedger(outputPath, now = new Date()) {
  await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  try {
    await writeFile(outputPath, `${JSON.stringify(createDemoLedger(now), null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`Refusing to overwrite existing ledger: ${outputPath}`);
    }
    throw error;
  }
  return outputPath;
}

function outputFromArgs(args) {
  const index = args.indexOf('--output');
  if (index === -1) return path.join(process.cwd(), '.local-data', 'finance.json');
  if (!args[index + 1]) throw new Error('Provide a file path after --output.');
  return path.resolve(args[index + 1]);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const output = outputFromArgs(process.argv.slice(2));
  writeDemoLedger(output).then(file => {
    console.log(`Created fictional demo ledger at ${path.relative(process.cwd(), file) || file}`);
    console.log('Run npm run dev:local to view it.');
  }).catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

export const modulePath = fileURLToPath(import.meta.url);
