import test from 'node:test';
import assert from 'node:assert/strict';
import { alignPracticeWords, getPracticePrompt, scorePractice } from './practice-service.js';

test('practice prompts match the requested type and difficulty', () => {
  const prompt = getPracticePrompt('story', 'advanced');
  assert.equal(prompt.type, 'story');
  assert.equal(prompt.difficulty, 'advanced');
  assert.ok(prompt.text.split(' ').length > 15);
});

test('word alignment identifies matches, substitutions, and missing words', () => {
  const result = alignPracticeWords('I like green apples', 'I love green');
  assert.deepEqual(result.aligned.map((item) => item.status), ['good', 'needs-work', 'good', 'missing']);
});

test('perfect practice receives high scores', () => {
  const result = scorePractice('I like to read books', 'I like to read books', 2.5);
  assert.equal(result.accuracy, 100);
  assert.equal(result.completeness, 100);
  assert.ok(result.overall >= 90);
});
