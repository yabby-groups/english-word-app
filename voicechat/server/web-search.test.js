import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBingSearchResults } from './web-search.js';

test('parseBingSearchResults extracts and limits normalized sources', () => {
  const html = [
    '<li class="b_algo"><h2><a href="https://example.com/one"><strong>First</strong> result</a></h2><div class="b_caption"><p>Fresh &amp; useful.</p></div></li>',
    '<li class="b_algo"><h2><a href="https://example.com/two">Second result</a></h2><div class="b_caption"><p>More context.</p></div></li>',
  ].join('');
  assert.deepEqual(parseBingSearchResults(html, 1), [{
    title: 'First result', url: 'https://example.com/one', snippet: 'Fresh & useful.',
  }]);
});
