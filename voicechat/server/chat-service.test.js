import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIClient, normalizeHistory, streamAudioReply } from './chat-service.js';

test('createOpenAIClient limits transient provider retries by default', () => {
  const previous = process.env.OPENAI_MAX_RETRIES;
  delete process.env.OPENAI_MAX_RETRIES;
  try {
    const client = createOpenAIClient('test-key', undefined, 30000);
    assert.equal(client.maxRetries, 1);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_MAX_RETRIES;
    else process.env.OPENAI_MAX_RETRIES = previous;
  }
});

test('normalizeHistory keeps only chat roles and bounds message text', () => {
  const output = normalizeHistory([
    { role: 'system', text: 'hidden' },
    { role: 'user', text: 'hello' },
    { role: 'assistant', text: 'welcome' },
    { role: 'user', text: 'x'.repeat(5000) },
  ]);
  assert.deepEqual(output.slice(0, 2), [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'welcome' },
  ]);
  assert.equal(output[2].content.length, 4000);
});

test('normalizeHistory returns no records for invalid input', () => {
  assert.deepEqual(normalizeHistory(null), []);
  assert.deepEqual(normalizeHistory([{ role: 'user' }]), []);
});

test('streamAudioReply collects streamed PCM and the response transcript', async () => {
  const requests = [];
  const client = {
    chat: {
      completions: {
        create: async (request) => {
          requests.push(request);
          return (async function* () {
            yield { choices: [{ delta: { audio: { transcript: 'Hello ', data: Buffer.from([1, 2]).toString('base64') } } }] };
            yield { choices: [{ delta: { audio: { transcript: 'there.', data: Buffer.from([3, 4]).toString('base64') } } }] };
          }());
        },
      },
    },
  };

  const result = await streamAudioReply(client, {
    audioModel: 'gpt-audio-mini', audioVoice: 'alloy', text: 'Hi', history: [], language: 'en',
  });

  assert.equal(result.assistantText, 'Hello there.');
  assert.equal(result.mimeType, 'audio/wav');
  assert.ok(Buffer.from(result.audio, 'base64').subarray(0, 4).equals(Buffer.from('RIFF')));
  assert.deepEqual(requests[0].modalities, ['text', 'audio']);
  assert.equal(requests[0].audio.voice, 'alloy');
  assert.equal(requests[0].stream, true);
  assert.match(requests[0].messages[0].content, /exclusively in English/);
});

test('streamAudioReply forwards PCM chunks without assembling a WAV when streaming to a client', async () => {
  const sentChunks = [];
  const textChunks = [];
  const client = {
    chat: { completions: { create: async () => (async function* () {
      yield { choices: [{ delta: { audio: { transcript: 'Hello', data: 'AQI=' } } }] };
    }()) } },
  };
  const result = await streamAudioReply(client, {
    audioModel: 'gpt-audio-mini', audioVoice: 'alloy', text: 'Hi', includeAudio: false,
    onAudioChunk: (chunk) => sentChunks.push(chunk),
    onTextChunk: (chunk) => textChunks.push(chunk),
  });
  assert.deepEqual(sentChunks, ['AQI=']);
  assert.deepEqual(textChunks, ['Hello']);
  assert.equal(result.assistantText, 'Hello');
  assert.equal('audio' in result, false);
});

test('streamAudioReply requests Chinese followed by English in bilingual mode', async () => {
  let request;
  const client = {
    chat: { completions: { create: async (value) => {
      request = value;
      return (async function* () {
        yield { choices: [{ delta: { audio: { transcript: 'Chinese then English', data: 'AQI=' } } }] };
      }());
    } } },
  };
  await streamAudioReply(client, {
    audioModel: 'gpt-audio-mini', audioVoice: 'alloy', text: 'hello', language: 'bilingual',
  });
  assert.match(request.messages[0].content, /first in Simplified Chinese/);
  assert.match(request.messages[0].content, /English:/);
});

test('streamAudioReply asks the model to generate slow speech without changing playback rate', async () => {
  let request;
  const client = { chat: { completions: { create: async (value) => {
    request = value;
    return (async function* () { yield { choices: [{ delta: { audio: { transcript: 'Hello', data: 'AQI=' } } }] }; }());
  } } } };
  await streamAudioReply(client, { audioModel: 'gpt-audio-mini', audioVoice: 'alloy', text: 'Hi', language: 'en', speechRate: 0.8 });
  assert.match(request.messages[0].content, /Speak slowly and clearly/);
  assert.equal(request.audio.format, 'pcm16');
});
