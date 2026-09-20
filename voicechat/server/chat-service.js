import OpenAI from 'openai';

const MAX_HISTORY_MESSAGES = 12;

function pcm16ToWavBase64(chunks, sampleRate = 24000) {
  const pcm = Buffer.concat(chunks);
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + pcm.length, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  return wav.toString('base64');
}

export function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((message) =>
      message && ['user', 'assistant'].includes(message.role) && typeof message.text === 'string',
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({ role: message.role, content: message.text.slice(0, 4000) }));
}

export function createOpenAIClient(apiKey, baseURL, requestTimeoutMs) {
  if (!apiKey) throw new Error('Server is missing OPENAI_API_KEY. Add it to .env and restart.');
  const configuredRetries = Number(process.env.OPENAI_MAX_RETRIES ?? 1);
  const maxRetries = Number.isInteger(configuredRetries) && configuredRetries >= 0
    ? configuredRetries
    : 1;
  return new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    timeout: requestTimeoutMs,
    maxRetries,
  });
}

export async function translateToEnglish({ apiKey, baseURL, requestTimeoutMs, chatModel, text }) {
  const normalized = String(text || '').trim();
  if (!normalized) return '';
  const nonAscii = (normalized.match(/[^\x00-\x7F]/g) || []).length;
  if (!/[\u3400-\u9fff]/.test(normalized) && nonAscii / normalized.length < 0.08) return normalized;
  const client = createOpenAIClient(apiKey, baseURL, requestTimeoutMs);
  const response = await client.responses.create({
    model: chatModel,
    input: [
      {
        role: 'system',
        content: 'Translate the message into natural English. Preserve its meaning and tone. Return only the English translation without notes or markdown.',
      },
      { role: 'user', content: normalized },
    ],
  });
  return response.output_text?.trim() || normalized;
}

export async function createEnglishSearchQuery({ apiKey, baseURL, requestTimeoutMs, chatModel, text }) {
  const normalized = String(text || '').trim();
  if (!normalized) return '';
  const client = createOpenAIClient(apiKey, baseURL, requestTimeoutMs);
  const response = await client.responses.create({
    model: chatModel,
    input: [
      {
        role: 'system',
        content: 'Convert the request into one concise English web search query. Keep names, dates, locations, and words such as latest or today when relevant. Remove conversational instructions. Return only the search query.',
      },
      { role: 'user', content: normalized },
    ],
  });
  return response.output_text?.trim() || normalized;
}

function languageInstruction(language) {
  if (language === 'zh') return 'OUTPUT LANGUAGE REQUIREMENT: Answer exclusively in Simplified Chinese, regardless of the language used by the user.';
  if (language === 'en') return 'OUTPUT LANGUAGE REQUIREMENT: Answer exclusively in English, regardless of the language used by the user. Never answer in Chinese.';
  if (language === 'bilingual') {
    return 'OUTPUT LANGUAGE REQUIREMENT: Answer first in Simplified Chinese, then provide the same answer in natural English. Put the English answer on a new line after the label "English:". Always include both languages.';
  }
  return 'Reply in the same language as the user.';
}

function speechPaceInstruction(rate = 1) {
  if (rate <= 0.85) return 'Speak slowly and clearly at about eighty percent of a natural conversational pace. Keep a natural pitch and add small pauses between phrases.';
  if (rate < 0.98) return 'Speak slightly slower than normal, clearly and with a natural pitch.';
  if (rate <= 1.08) return 'Speak at a natural conversational pace and pitch.';
  if (rate <= 1.25) return 'Speak at a brisk but clear conversational pace, keeping a natural pitch.';
  return 'Speak quickly and fluently while remaining intelligible and keeping a natural pitch.';
}

function systemInstruction(language, webContext = '', smartMode = false, speechRate = 1) {
  const identity = smartMode
    ? 'You are a highly capable GPT-5.6 English-learning and general conversation assistant. Help the user learn English while also answering everyday questions intelligently. Do not call yourself Echo unless the user asks about the product name.'
    : 'You are Echo, a thoughtful voice companion.';
  return `${identity} ${languageInstruction(language)} ${speechPaceInstruction(speechRate)} Keep spoken answers concise, natural, and useful. Do not use markdown.${webContext ? `\n\n${webContext}` : ''}`;
}

export async function synthesizeSpeech(client, text, language, audioModel, voice, speechRate = 1) {
  const stream = await client.chat.completions.create({
    model: audioModel,
    modalities: ['text', 'audio'],
    audio: { voice, format: 'pcm16' },
    stream: true,
    messages: [{
      role: 'user',
      content: language === 'zh'
        ? `${speechPaceInstruction(speechRate)} Read the following Simplified Chinese text warmly and naturally. Do not add any words: ${text}`
        : language === 'en'
          ? `${speechPaceInstruction(speechRate)} Read the following warmly. Do not add any words: ${text}`
          : `${speechPaceInstruction(speechRate)} Read the following warmly in the language of the provided text. Do not add any words: ${text}`,
    }],
  });
  const audioChunks = [];
  for await (const chunk of stream) {
    const data = chunk.choices[0]?.delta?.audio?.data;
    if (data) audioChunks.push(Buffer.from(data, 'base64'));
  }
  if (!audioChunks.length) throw new Error('The audio model did not return playable speech data.');
  return { audio: pcm16ToWavBase64(audioChunks), mimeType: 'audio/wav' };
}

export async function streamAudioReply(client, {
  audioModel, audioVoice, text, history = [], language, speechRate = 1, onAudioChunk, onTextChunk, includeAudio = true, webContext = '', sources = [], smartMode = false, requestTimeoutMs,
}) {
  const stream = await client.chat.completions.create({
    model: audioModel,
    modalities: ['text', 'audio'],
    audio: { voice: audioVoice, format: 'pcm16' },
    stream: true,
    messages: [
      {
        role: 'system',
        content: systemInstruction(language, webContext, smartMode, speechRate),
      },
      ...normalizeHistory(history),
      { role: 'user', content: text },
    ],
  }, { maxRetries: 0, ...(requestTimeoutMs ? { timeout: requestTimeoutMs } : {}) });
  const audioChunks = [];
  const textChunks = [];
  const transcriptChunks = [];
  let audioChunkCount = 0;
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (delta?.audio?.data) {
      audioChunkCount += 1;
      if (includeAudio) audioChunks.push(Buffer.from(delta.audio.data, 'base64'));
      onAudioChunk?.(delta.audio.data);
    }
    if (typeof delta?.content === 'string') textChunks.push(delta.content);
    if (typeof delta?.audio?.transcript === 'string') transcriptChunks.push(delta.audio.transcript);
    const visibleText = typeof delta?.audio?.transcript === 'string'
      ? delta.audio.transcript
      : typeof delta?.content === 'string' ? delta.content : '';
    if (visibleText) onTextChunk?.(visibleText);
  }
  if (!audioChunkCount) throw new Error('The audio model did not return playable speech data.');
  const assistantText = textChunks.join('').trim() || transcriptChunks.join('').trim();
  if (!assistantText) throw new Error('The audio model did not return a text transcript.');
  return {
    assistantText,
    ...(sources.length ? { sources } : {}),
    ...(includeAudio ? { audio: pcm16ToWavBase64(audioChunks), mimeType: 'audio/wav' } : {}),
  };
}

export async function respondToMessage({ apiKey, baseURL, requestTimeoutMs, chatModel, audioModel, audioVoice, audioResponseMode = 'direct', text, history = [], language, speechRate = 1, webContext = '', sources = [], smartMode = false, translateAssistant, includeSpeech = true }) {
  const client = createOpenAIClient(apiKey, baseURL, requestTimeoutMs);
  let shouldIncludeSpeech = includeSpeech;
  if (audioResponseMode !== 'two_stage') {
    try {
      return await streamAudioReply(client, { audioModel, audioVoice, text, history, language, speechRate, webContext, sources, smartMode, requestTimeoutMs });
    } catch (audioError) {
      console.warn(`[voicechat] Audio reply failed; falling back to ${chatModel}: ${audioError instanceof Error ? audioError.message : audioError}`);
      shouldIncludeSpeech = false;
    }
  }
  const response = await client.responses.create({
    model: chatModel,
    max_output_tokens: 700,
    reasoning: { effort: 'low' },
    input: [
      {
        role: 'system',
        content:
          systemInstruction(language, webContext, smartMode, speechRate),
      },
      ...normalizeHistory(history),
      { role: 'user', content: text },
    ],
  });
  const assistantText = response.output_text.trim();
  if (!assistantText) throw new Error('The assistant returned an empty response.');
  const [speech, assistantTranslation] = await Promise.all([
    shouldIncludeSpeech ? synthesizeSpeech(client, assistantText, language, audioModel, audioVoice, speechRate) : Promise.resolve({}),
    translateAssistant ? translateAssistant(assistantText) : Promise.resolve(''),
  ]);
  return { assistantText, ...(assistantTranslation ? { assistantTranslation } : {}), ...(sources.length ? { sources } : {}), ...speech };
}

export async function transcribeAudio({ apiKey, baseURL, requestTimeoutMs, transcribeModel, buffer, mimetype, filename }) {
  const client = createOpenAIClient(apiKey, baseURL, requestTimeoutMs);
  const file = new File([buffer], filename || 'speech.webm', { type: mimetype || 'audio/webm' });
  const transcript = await client.audio.transcriptions.create({
    model: transcribeModel,
    file,
  });
  return {
    text: transcript.text?.trim() || '',
    language: transcript.language || 'und',
  };
}
