import test from 'node:test';
import assert from 'node:assert/strict';
import { piperLengthScale, synthesizeLocalEnglish } from './local-speech.js';

test('local speech maps playback speed to a bounded Piper length scale', () => {
  assert.equal(piperLengthScale(1), 1);
  assert.equal(piperLengthScale(0.5), 2);
  assert.equal(piperLengthScale(2), 0.5);
  assert.equal(piperLengthScale(99), 0.5);
  assert.equal(piperLengthScale(0), 1);
});

test('local speech reports a configuration error without Piper', async () => {
  const priorBinary = process.env.PIPER_BIN;
  const priorModel = process.env.PIPER_VOICE_EN;
  try {
    process.env.PIPER_BIN = '';
    process.env.PIPER_VOICE_EN = '';
    await assert.rejects(synthesizeLocalEnglish('Practice sentence.'), /Piper is not configured/);
  } finally {
    if (priorBinary === undefined) delete process.env.PIPER_BIN;
    else process.env.PIPER_BIN = priorBinary;
    if (priorModel === undefined) delete process.env.PIPER_VOICE_EN;
    else process.env.PIPER_VOICE_EN = priorModel;
  }
});
