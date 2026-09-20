import test from 'node:test';
import assert from 'node:assert/strict';
import { sapiRate } from './local-speech.js';

test('local speech maps playback speed to a bounded SAPI rate', () => {
  assert.equal(sapiRate(1), 0);
  assert.equal(sapiRate(0.75), -2);
  assert.equal(sapiRate(1.5), 4);
  assert.equal(sapiRate(99), 5);
});
