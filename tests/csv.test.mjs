import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from '../src/lib/csv.ts';

test('CSV fields escape quotes and block spreadsheet formulas', () => {
  assert.equal(csvCell('Groceries "weekly"'), '"Groceries ""weekly"""');
  assert.equal(csvCell('=HYPERLINK("https://example.com")'), '"\'=HYPERLINK(""https://example.com"")"');
  assert.equal(csvCell('  +1+2'), '"\'  +1+2"');
});
