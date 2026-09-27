import test from 'node:test';
import assert from 'node:assert/strict';
import { greetingFor } from '../src/lib/greeting.ts';

test('greeting follows the saved time zone and day-part boundaries', () => {
  const instant = new Date('2026-09-27T15:59:00Z');
  assert.equal(greetingFor(instant, 'America/Toronto'), 'Good morning');
  assert.equal(greetingFor(instant, 'Europe/London'), 'Good afternoon');
  assert.equal(greetingFor(instant, 'Asia/Dubai'), 'Good evening');
  assert.equal(greetingFor(new Date('2026-09-27T16:00:00Z'), 'America/Toronto'), 'Good afternoon');
  assert.equal(greetingFor(new Date('2026-09-27T21:00:00Z'), 'America/Toronto'), 'Good evening');
});
