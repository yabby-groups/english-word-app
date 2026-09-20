import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { createEnglishSearchQuery, createOpenAIClient, respondToMessage, streamAudioReply, transcribeAudio, translateToEnglish } from './chat-service.js';
import { formatSearchContext, searchWeb, shouldSearchWeb } from './web-search.js';
import { getPracticePrompt, scorePractice } from './practice-service.js';
import { addPracticePrompts, claimPracticePrompts, getReadyPracticePrompts, isPracticePromptMastered, listMasteredPracticePrompts, listPracticePrompts, setPracticePromptMastered, updatePracticePrompt } from './practice-store.js';
import { synthesizeLocalEnglish } from './local-speech.js';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
const port = Number(process.env.PORT || 8787);
let requestSequence = 0;
const practicePoolJobs = new Map();
const BUILT_IN_VOICES = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);
const openAIConfig = {
  baseURL: process.env.OPENAI_BASE_URL,
  transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe',
  chatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-5.6-luna',
  audioModel: process.env.OPENAI_AUDIO_MODEL || 'gpt-audio-mini',
  audioVoice: process.env.OPENAI_AUDIO_VOICE || 'alloy',
  audioResponseMode: process.env.OPENAI_AUDIO_RESPONSE_MODE || 'direct',
  requestTimeoutMs: Number(process.env.OPENAI_REQUEST_TIMEOUT_MS || 30000),
};

function englishTranslation(text) {
  return translateToEnglish({
    apiKey: process.env.OPENAI_API_KEY,
    ...openAIConfig,
    text,
  });
}

function englishSearchQuery(text) {
  return createEnglishSearchQuery({
    apiKey: process.env.OPENAI_API_KEY,
    ...openAIConfig,
    text,
  });
}

function normalizePracticeItem(parsed) {
  if (!parsed || typeof parsed !== 'object') throw new Error('Generated practice content is invalid.');
  const promptText = String(parsed.text || '').trim();
  const translation = String(parsed.translation || '').trim();
  const phonetics = Array.isArray(parsed.phonetics) ? parsed.phonetics.map((item) => String(item).trim()) : [];
  const wordCount = (promptText.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).length;
  if (!promptText || !translation || phonetics.length !== wordCount) throw new Error('Generated practice content is incomplete.');
  return { text: promptText, translation, phonetics };
}

function parsePracticeJson(value, count = 1) {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(text);
  if (count === 1) return normalizePracticeItem(parsed);
  const items = Array.isArray(parsed) ? parsed : parsed.items;
  if (!Array.isArray(items) || items.length !== count) throw new Error(`Expected ${count} generated practice items.`);
  return items.map(normalizePracticeItem);
}

async function createPracticeContent({ text = '', type = 'sentence', difficulty = 'beginner', count = 1 }) {
  const client = createOpenAIClient(process.env.OPENAI_API_KEY, openAIConfig.baseURL, openAIConfig.requestTimeoutMs);
  const isAnnotation = Boolean(String(text).trim());
  const annotationText = String(text).trim();
  const annotationWords = annotationText.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
  const lengthInstruction = type === 'story' ? 'Write a coherent 3-sentence story with 35 to 55 words.' : 'Write one natural English sentence with 7 to 14 words.';
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await client.responses.create({
      model: openAIConfig.chatModel,
      input: [
        { role: 'system', content: `Create English pronunciation practice data for Chinese learners. Return only valid JSON${count > 1 ? ` as an array of exactly ${count} objects` : ''}. Each object must have keys text, translation, phonetics. phonetics must contain one IPA transcription for every English word in text, in exact order. Include primary stress marks where appropriate. Do not include punctuation as phonetic entries.` },
        { role: 'user', content: isAnnotation ? `Do not change this text: ${annotationText}\nThe exact ${annotationWords.length} words are: ${JSON.stringify(annotationWords)}\nReturn text unchanged, a Simplified Chinese translation, and exactly ${annotationWords.length} IPA strings in the same order.${attempt > 1 ? ' A previous response had the wrong number of phonetics; count carefully.' : ''}` : `${lengthInstruction} Difficulty: ${difficulty}. ${count > 1 ? `Create ${count} distinct items with different topics.` : ''} Use useful, varied everyday vocabulary.` },
      ],
    });
    try { return parsePracticeJson(response.output_text, count); } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Generated practice content is incomplete.');
}

async function createPracticeStory(difficulty) {
  const client = createOpenAIClient(process.env.OPENAI_API_KEY, openAIConfig.baseURL, openAIConfig.requestTimeoutMs);
  const response = await client.responses.create({
    model: openAIConfig.chatModel,
    input: [
      { role: 'system', content: 'Write one coherent English pronunciation-practice story in exactly 3 sentences and 35 to 55 words. Return only the story text without a title, notes, markdown, translation, or JSON.' },
      { role: 'user', content: `Difficulty: ${difficulty}. Use a useful everyday topic.` },
    ],
  });
  const text = String(response.output_text || '').trim().replace(/^```\s*/i, '').replace(/\s*```$/, '');
  if ((text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).length < 25) throw new Error('Generated story is too short.');
  return text;
}

function replenishPracticePool(type, difficulty) {
  const key = `${type}:${difficulty}`;
  if (practicePoolJobs.has(key)) return practicePoolJobs.get(key);
  const job = (async () => {
    let contents;
    if (type === 'story') {
      const text = await createPracticeStory(difficulty);
      const details = await createPracticeContent({ text });
      contents = [{ text, translation: details.translation, phonetics: details.phonetics }];
    } else {
      const generated = await createPracticeContent({ type, difficulty, count: 5 });
      contents = Array.isArray(generated) ? generated : [generated];
    }
    const timestamp = Date.now();
    const prompts = contents.map((content, index) => ({ id: `pooled-${timestamp}-${index + 1}`, type, difficulty, ...content, createdAt: new Date(timestamp + index).toISOString() }));
    await addPracticePrompts(prompts);
    return prompts;
  })().catch((error) => {
    console.error(`Practice pool refill failed for ${key}: ${error instanceof Error ? error.message : error}`);
    return [];
  }).finally(() => practicePoolJobs.delete(key));
  practicePoolJobs.set(key, job);
  return job;
}

async function warmPracticePools() {
  for (const type of ['sentence', 'story']) {
    for (const difficulty of ['beginner', 'intermediate', 'advanced']) {
      let ready = await getReadyPracticePrompts(type, difficulty, 5);
      while (ready.items.length < 5) {
        const added = await replenishPracticePool(type, difficulty);
        if (!added?.length) break;
        ready = await getReadyPracticePrompts(type, difficulty, 5);
      }
    }
  }
}
const webSearchConfig = {
  enabled: process.env.WEB_SEARCH_ENABLED === 'true',
  mode: process.env.WEB_SEARCH_MODE || 'auto',
  provider: process.env.WEB_SEARCH_PROVIDER || 'duckduckgo',
  searchUrl: process.env.BOWAPI_SEARCH_URL || '',
  deepSearchUrl: process.env.BOWAPI_ANSWER_URL || '',
  musicUrl: process.env.BOWAPI_MUSIC_URL || '',
  apiKey: process.env.WEB_SEARCH_API_KEY,
  maxResults: Number(process.env.WEB_SEARCH_MAX_RESULTS || 5),
  timeoutMs: Number(process.env.WEB_SEARCH_TIMEOUT_MS || 8000),
};

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function readHistory(value) {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function selectedVoice(value) {
  if (value === undefined || value === null || value === '') return openAIConfig.audioVoice;
  return typeof value === 'string' && BUILT_IN_VOICES.has(value) ? value : null;
}

function selectedLanguage(value) {
  if (value === undefined || value === null || value === '' || value === 'auto') return undefined;
  return value === 'zh' || value === 'en' || value === 'bilingual' ? value : null;
}

function requestPreferences(value) {
  const voice = selectedVoice(value?.voice);
  const language = selectedLanguage(value?.language);
  const conversationMode = value?.conversationMode === 'smart' ? 'smart' : 'realtime';
  const requestedRate = Number(value?.speechRate ?? 1);
  const speechRate = Number.isFinite(requestedRate) && requestedRate >= 0.75 && requestedRate <= 1.5 ? requestedRate : null;
  if (!voice) return { error: 'Unsupported voice selection.' };
  if (language === null) return { error: 'Reply mode must be auto, zh, en, or bilingual.' };
  if (speechRate === null) return { error: 'Speech rate must be between 0.75 and 1.5.' };
  return { voice, language, conversationMode, speechRate };
}

function requestedWebSearch(value) {
  if (value === 'fast' || value === 'deep') return value;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false' || value === 'off') return false;
  return undefined;
}

function musicQuery(text) {
  const value = String(text || '').replace(/^(请|帮我|给我)?\s*(播放|放一下|来一首|搜索|找一下)?\s*/i, '').replace(/(音乐|歌曲|歌|MV|music|song|play)\s*$/i, '').trim();
  return value.length >= 2 ? value.slice(0, 120) : '';
}

async function getMusicResult(text, searchMode, log) {
  if (searchMode === false || !webSearchConfig.musicUrl || !/(播放|放一下|来一首|歌曲|音乐|MV|music|song|play)/i.test(text)) return null;
  const query = musicQuery(text);
  if (!query) return null;
  try {
    const url = new URL(webSearchConfig.musicUrl);
    url.searchParams.set('q', query);
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`Music search returned HTTP ${response.status}.`);
    const data = await response.json();
    const track = data.tracks?.[0];
    if (!track) return null;
    log('music_found', `title=${JSON.stringify(track.title)}`);
    return { query, ...track };
  } catch (error) {
    log('music_search_failed', `error=${JSON.stringify(error instanceof Error ? error.message : 'unknown')}`);
    return null;
  }
}

const MUSIC_COMMAND_PATTERN = /(\u64ad\u653e|\u6362\u4e00\u9996|\u4e0b\u4e00\u9996|\u4e0a\u4e00\u9996|\u6765\u4e00\u9996|\u6b4c\u66f2|\u97f3\u4e50|MV|music|song|play|next)/i;

function isMusicCommand(text) {
  return MUSIC_COMMAND_PATTERN.test(String(text || ''));
}

function isMusicMode(value) {
  return value === true || value === 'true';
}

function safeMusicQuery(text, currentQuery = '') {
  const value = String(text || '');
  if (/\u6362\u4e00\u9996|\u4e0b\u4e00\u9996|\u4e0a\u4e00\u9996|next/i.test(value)) return currentQuery;
  return value.replace(/^(?:\u8bf7|\u5e2e\u6211|\u7ed9\u6211)?\s*(?:\u64ad\u653e|\u6765\u4e00\u9996|play|search|\u641c\u7d22)?\s*/i, '').replace(/(?:\u97f3\u4e50|\u6b4c\u66f2|MV|music|song|play)\s*$/i, '').trim().slice(0, 120);
}

async function getMusicResultSafe(text, searchMode, log, current = {}) {
  if (searchMode === false || !webSearchConfig.musicUrl || !isMusicCommand(text)) return null;
  const query = safeMusicQuery(text, current.query);
  if (!query) return null;
  try {
    const url = new URL(webSearchConfig.musicUrl);
    url.searchParams.set('q', query);
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`Music search returned HTTP ${response.status}.`);
    const data = await response.json();
    const tracks = Array.isArray(data.tracks) ? data.tracks : [];
    let index = 0;
    if (current.bvid) {
      const currentIndex = tracks.findIndex((item) => item.bvid === current.bvid);
      index = currentIndex >= 0 ? (currentIndex + 1) % Math.max(tracks.length, 1) : 0;
    }
    const track = tracks[index];
    if (!track) return null;
    log('music_found', `title=${JSON.stringify(track.title)}`);
    return { query, index, ...track };
  } catch (error) {
    log('music_search_failed', `error=${JSON.stringify(error instanceof Error ? error.message : 'unknown')}`);
    return null;
  }
}

function requestLogger(requestId) {
  const startedAt = performance.now();
  return (event, details = '') => {
    const suffix = details ? ` ${details}` : '';
    console.info(`[voicechat:${requestId}] +${(performance.now() - startedAt).toFixed(0)}ms ${event}${suffix}`);
  };
}

function sendError(res, error, log) {
  const message = error instanceof Error ? error.message : 'Unable to complete the request.';
  log?.('failed', `error=${JSON.stringify(message)}`);
  res.status(message.includes('missing OPENAI_API_KEY') ? 503 : 500).json({ error: message });
}

function writeStreamEvent(res, event) {
  res.write(`${JSON.stringify(event)}\n`);
}

function startAudioStream(res) {
  res.status(200);
  res.set({
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
}

async function getWebResearch(text, log, requested) {
  const searchMode = requested === 'fast' || requested === 'deep'
    ? requested
    : requested === false
      ? 'off'
      : requested === true
        ? 'deep'
        : webSearchConfig.mode;
  const triggerMode = searchMode === 'off' ? 'off' : 'always';
  if (!webSearchConfig.enabled || !shouldSearchWeb(text, triggerMode)) return { context: '', sources: [] };
  log('web_search_start', `provider=${webSearchConfig.provider} mode=${searchMode}`);
  try {
    const query = await englishSearchQuery(text);
    log('web_search_query', `query=${JSON.stringify(query)}`);
    const sources = await searchWeb(query, { ...webSearchConfig, searchMode });
    log('web_search_complete', `sources=${sources.length}`);
    return { context: formatSearchContext(sources), sources };
  } catch (error) {
    log('web_search_failed', `error=${JSON.stringify(error instanceof Error ? error.message : 'unknown')}`);
    return { context: '', sources: [] };
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, configured: Boolean(process.env.OPENAI_API_KEY) });
});

app.get('/api/practice/prompt', async (req, res) => {
  let previous = req.query.previous;
  let prompt = getPracticePrompt(req.query.type, req.query.difficulty, previous);
  for (let attempt = 0; attempt < 12 && await isPracticePromptMastered(prompt.id); attempt += 1) {
    previous = prompt.text;
    prompt = getPracticePrompt(req.query.type, req.query.difficulty, previous);
  }
  res.json(prompt);
});

app.post('/api/practice/annotate', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'Practice text is required.' });
  try {
    const generated = await createPracticeContent({ text });
    const details = { translation: generated.translation, phonetics: generated.phonetics };
    const saved = await updatePracticePrompt(req.body?.id, details);
    res.json(saved || { text, ...details });
  } catch (error) { sendError(res, error); }
});

app.post('/api/practice/generate', async (req, res) => {
  const type = req.body?.type === 'story' ? 'story' : 'sentence';
  const difficulty = ['beginner', 'intermediate', 'advanced'].includes(req.body?.difficulty) ? req.body.difficulty : 'beginner';
  try {
    const claimCount = type === 'story' ? 1 : 5;
    const claimed = await claimPracticePrompts(type, difficulty, claimCount);
    if (claimed.items.length < claimCount) {
      void replenishPracticePool(type, difficulty);
      return res.status(409).json({ error: '当前分类的新例句正在补充，请稍后再试。', preparing: true, available: claimed.items.length });
    }
    res.json({ items: claimed.items, item: claimed.items[0], page: claimed.firstPage, total: claimed.total });
    setImmediate(() => { void replenishPracticePool(type, difficulty); });
  } catch (error) { sendError(res, error); }
});

app.get('/api/practice/mastered', async (req, res) => {
  const type = req.query.type === 'story' ? 'story' : 'sentence';
  const difficulty = ['beginner', 'intermediate', 'advanced'].includes(req.query.difficulty) ? req.query.difficulty : 'beginner';
  try { res.json(await listMasteredPracticePrompts(type, difficulty, req.query.page)); } catch (error) { sendError(res, error); }
});

app.post('/api/practice/mastered', async (req, res) => {
  const id = typeof req.body?.id === 'string' ? req.body.id : '';
  if (!id) return res.status(400).json({ error: 'Practice prompt id is required.' });
  try {
    const mastered = req.body?.mastered !== false;
    let item = await setPracticePromptMastered(id, mastered);
    if (!item && mastered && req.body?.item?.text) {
      item = { ...req.body.item, id, masteredAt: new Date().toISOString() };
      await addPracticePrompts([item]);
    }
    if (!item) return res.status(404).json({ error: 'Practice prompt was not found.' });
    res.json(item);
  } catch (error) { sendError(res, error); }
});

app.get('/api/practice/library', async (req, res) => {
  const type = req.query.type === 'story' ? 'story' : 'sentence';
  const difficulty = ['beginner', 'intermediate', 'advanced'].includes(req.query.difficulty) ? req.query.difficulty : 'beginner';
  try {
    const listing = await listPracticePrompts(type, difficulty, req.query.page);
    res.json(listing);
    if (listing.total < 10) setImmediate(() => { void replenishPracticePool(type, difficulty); });
  } catch (error) { sendError(res, error); }
});

app.post('/api/practice/reference-audio', async (req, res) => {
  try {
    res.json(await synthesizeLocalEnglish(req.body?.text, req.body?.rate));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/practice/assess', upload.single('audio'), async (req, res) => {
  const target = typeof req.body?.target === 'string' ? req.body.target.trim() : '';
  if (!req.file || !target) return res.status(400).json({ error: 'A target sentence and WAV recording are required.' });
  try {
    const transcript = await transcribeAudio({
      apiKey: process.env.OPENAI_API_KEY,
      ...openAIConfig,
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      filename: req.file.originalname,
    });
    if (!transcript.text) return res.status(422).json({ error: 'No speech was detected. Please try again.' });
    res.json({ transcript: transcript.text, ...scorePractice(target, transcript.text, Number(req.body.duration)) });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/chat/text', async (req, res) => {
  const requestId = `text-${++requestSequence}`;
  const log = requestLogger(requestId);
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'A text message is required.' });
  const preferences = requestPreferences(req.body);
  if ('error' in preferences) return res.status(400).json({ error: preferences.error });
  log('received', `text_chars=${text.length} voice=${preferences.voice} language=${preferences.language || 'auto'}`);
  try {
    log('response_start');
    const [research, music, userTranslation] = await Promise.all([
      getWebResearch(text, log, requestedWebSearch(req.body.webSearch)),
      getMusicResultSafe(text, requestedWebSearch(req.body.webSearch), log, { query: req.body.musicQuery, bvid: req.body.musicBvid }),
      englishTranslation(text),
    ]);
    const result = await respondToMessage({
      apiKey: process.env.OPENAI_API_KEY,
      ...openAIConfig,
      audioResponseMode: preferences.conversationMode === 'smart' ? 'two_stage' : openAIConfig.audioResponseMode,
      smartMode: preferences.conversationMode === 'smart',
      translateAssistant: preferences.conversationMode === 'smart' ? englishTranslation : undefined,
      includeSpeech: !(preferences.conversationMode === 'smart' && (req.body.fastSmartMode === true || req.body.fastSmartMode === 'true')),
      audioVoice: preferences.voice,
      speechRate: preferences.speechRate,
      text,
      history: req.body.history,
      language: preferences.language,
      webContext: research.context,
      sources: research.sources,
    });
    const assistantTranslation = result.assistantTranslation || await englishTranslation(result.assistantText);
    log('complete', `reply_chars=${result.assistantText.length} audio_chars=${result.audio?.length || 0}`);
    res.json({ ...result, userTranslation, assistantTranslation, ...(music ? { music } : {}) });
  } catch (error) {
    sendError(res, error, log);
  }
});

app.post('/api/chat/audio', upload.single('audio'), async (req, res) => {
  const requestId = `audio-${++requestSequence}`;
  const log = requestLogger(requestId);
  if (!req.file) return res.status(400).json({ error: 'An audio recording is required.' });
  const preferences = requestPreferences(req.body);
  if ('error' in preferences) return res.status(400).json({ error: preferences.error });
  log('received', `bytes=${req.file.size} mime=${req.file.mimetype} voice=${preferences.voice} language=${preferences.language || 'auto'}`);
  try {
    log('transcription_start');
    const transcript = await transcribeAudio({
      apiKey: process.env.OPENAI_API_KEY,
      ...openAIConfig,
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      filename: req.file.originalname,
    });
    log('transcription_complete', `text_chars=${transcript.text.length} language=${transcript.language}`);
    if (!transcript.text) return res.status(422).json({ error: 'No speech was detected. Please try again.' });
    log('response_start');
    const [research, music, userTranslation] = await Promise.all([
      getWebResearch(transcript.text, log, requestedWebSearch(req.body.webSearch)),
      getMusicResultSafe(transcript.text, requestedWebSearch(req.body.webSearch), log, { query: req.body.musicQuery, bvid: req.body.musicBvid }),
      englishTranslation(transcript.text),
    ]);
    const result = await respondToMessage({
      apiKey: process.env.OPENAI_API_KEY,
      ...openAIConfig,
      audioResponseMode: preferences.conversationMode === 'smart' ? 'two_stage' : openAIConfig.audioResponseMode,
      smartMode: preferences.conversationMode === 'smart',
      translateAssistant: preferences.conversationMode === 'smart' ? englishTranslation : undefined,
      includeSpeech: !(preferences.conversationMode === 'smart' && (req.body.fastSmartMode === true || req.body.fastSmartMode === 'true')),
      audioVoice: preferences.voice,
      speechRate: preferences.speechRate,
      text: transcript.text,
      history: readHistory(req.body.history),
      language: preferences.language || transcript.language,
      webContext: research.context,
      sources: research.sources,
    });
    const assistantTranslation = result.assistantTranslation || await englishTranslation(result.assistantText);
    log('complete', `reply_chars=${result.assistantText.length} audio_chars=${result.audio?.length || 0}`);
    res.json({ ...result, userTranslation, assistantTranslation, ...(music ? { music } : {}), transcript: transcript.text, language: transcript.language });
  } catch (error) {
    sendError(res, error, log);
  }
});

app.post('/api/chat/audio/stream', upload.single('audio'), async (req, res) => {
  const requestId = `audio-stream-${++requestSequence}`;
  const log = requestLogger(requestId);
  if (!req.file) return res.status(400).json({ error: 'An audio recording is required.' });
  const preferences = requestPreferences(req.body);
  if ('error' in preferences) return res.status(400).json({ error: preferences.error });
  if (preferences.conversationMode === 'smart') return res.status(400).json({ error: 'GPT-5.6 smart mode uses the standard audio endpoint.' });
  log('received', `bytes=${req.file.size} mime=${req.file.mimetype} voice=${preferences.voice} language=${preferences.language || 'auto'}`);
  try {
    log('transcription_start');
    const transcript = await transcribeAudio({
      apiKey: process.env.OPENAI_API_KEY,
      ...openAIConfig,
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      filename: req.file.originalname,
    });
    log('transcription_complete', `text_chars=${transcript.text.length} language=${transcript.language}`);
    if (!transcript.text) return res.status(422).json({ error: 'No speech was detected. Please try again.' });

    const [research, userTranslation] = await Promise.all([
      getWebResearch(transcript.text, log, requestedWebSearch(req.body.webSearch)),
      englishTranslation(transcript.text),
    ]);
    if (isMusicMode(req.body.musicMode) && !isMusicCommand(transcript.text)) {
      startAudioStream(res);
      writeStreamEvent(res, { type: 'ignored' });
      res.end();
      log('ambient_audio_ignored');
      return;
    }
    const music = await getMusicResultSafe(transcript.text, requestedWebSearch(req.body.webSearch), log, { query: req.body.musicQuery, bvid: req.body.musicBvid });
    startAudioStream(res);
    writeStreamEvent(res, { type: 'transcript', text: transcript.text, translation: userTranslation, language: transcript.language });
    log('response_start');
    const client = createOpenAIClient(
      process.env.OPENAI_API_KEY, openAIConfig.baseURL, openAIConfig.requestTimeoutMs,
    );
    if (openAIConfig.audioResponseMode === 'two_stage') {
      throw new Error('Streaming audio requires OPENAI_AUDIO_RESPONSE_MODE=direct.');
    }
    let firstAudio = true;
    const result = await streamAudioReply(client, {
      ...openAIConfig,
      audioVoice: preferences.voice,
      speechRate: preferences.speechRate,
      text: transcript.text,
      history: readHistory(req.body.history),
      language: preferences.language || transcript.language,
      webContext: research.context,
      sources: research.sources,
      includeAudio: false,
      onAudioChunk: (data) => {
        if (firstAudio) {
          firstAudio = false;
          log('audio_first_chunk');
        }
        writeStreamEvent(res, { type: 'audio', data });
      },
      onTextChunk: (textDelta) => {
        writeStreamEvent(res, { type: 'assistant_delta', text: textDelta });
      },
    });
    const assistantTranslation = await englishTranslation(result.assistantText);
    log('complete', `reply_chars=${result.assistantText.length}`);
    writeStreamEvent(res, { type: 'complete', assistantText: result.assistantText, translation: assistantTranslation, language: preferences.language || transcript.language, sources: result.sources || [], ...(music ? { music } : {}) });
    res.end();
  } catch (error) {
    if (res.headersSent) {
      writeStreamEvent(res, { type: 'error', error: error instanceof Error ? error.message : 'Unable to complete the request.' });
      res.end();
      return;
    }
    sendError(res, error, log);
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.message });
  return sendError(res, error);
});

const host = process.env.HOST || '0.0.0.0';
const server = app.listen(port, host, () => {
  console.log(`Voicechat API listening on http://${host}:${port} (OpenAI configured: ${Boolean(process.env.OPENAI_API_KEY)})`);
  setTimeout(() => { void warmPracticePools(); }, 1000);
});
server.ref();
server.on('error', (error) => {
  console.error('Voicechat API server error:', error);
  process.exitCode = 1;
});
server.on('close', () => console.warn('Voicechat API server closed.'));
