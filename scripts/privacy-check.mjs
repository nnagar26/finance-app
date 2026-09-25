import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' })
  .split('\0').filter(Boolean);
const forbiddenPaths = files.filter(file =>
  file === '.env' || file.startsWith('.env.') && file !== '.env.example' ||
  file.startsWith('.local-data/') || file.startsWith('supabase/.temp/') ||
  /(?:^|\/)(?:finance-(?:backup|pre-v\d)|finance\.json)(?:$|[-.])/i.test(file));

const privateTerms = [
  'c2xlZXB3ZWxs',
  'c3Jpc2h0aQ==',
  'Y2lzY28gc3lzdGVtcyBjYW5hZGEgY29tcGFueQ==',
  'bmlzc2FuIGNhbmFkYSBmaW5hbmNl',
  'c2hvcHBlcnMgZHJ1ZyBtYXJ0',
].map(value => Buffer.from(value, 'base64').toString('utf8'));
const localLedgerPath = '.local-data/finance.json';
if (existsSync(localLedgerPath)) {
  try {
    const ledger = JSON.parse(readFileSync(localLedgerPath, 'utf8'));
    for (const transaction of ledger.transactions ?? []) {
      for (const value of [transaction.description, transaction.notes]) {
        const normalized = String(value ?? '').trim().toLowerCase();
        if (normalized.length >= 4) privateTerms.push(normalized);
      }
    }
  } catch {
    console.error(`Privacy check failed: unable to inspect ${localLedgerPath}.`);
    process.exit(1);
  }
}
const assignmentPatterns = [
  new RegExp('NEXT_PUBLIC_' + 'SUPABASE_URL\\s*=\\s*https?://', 'i'),
  new RegExp('NEXT_PUBLIC_' + 'SUPABASE_PUBLISHABLE_KEY\\s*=\\s*\\S+', 'i'),
  new RegExp('SUPABASE_' + 'SERVICE_ROLE_KEY\\s*=\\s*\\S+', 'i'),
  new RegExp('-----BEGIN ' + '(?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
  new RegExp('sb_' + 'secret_[A-Za-z0-9_-]+'),
];
const findings = [];

for (const file of files) {
  let content;
  try { content = readFileSync(file); } catch { continue; }
  if (content.includes(0)) continue;
  const text = content.toString('utf8');
  for (const term of privateTerms) {
    if (text.toLowerCase().includes(term)) findings.push(`${file}: contains known private ledger text`);
  }
  for (const pattern of assignmentPatterns) {
    if (pattern.test(text)) findings.push(`${file}: contains a likely credential or configured private endpoint`);
  }
}

if (forbiddenPaths.length || findings.length) {
  console.error('Privacy check failed:');
  for (const file of forbiddenPaths) console.error(`- ${file}: private/generated file must not be committed`);
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Privacy check passed for ${files.length} commit candidate files.`);
