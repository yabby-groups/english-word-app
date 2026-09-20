import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, Bot, Check, ChevronLeft, ChevronRight, History, LoaderCircle, Mic, Pause, Pencil, Play, RotateCcw, Send, Sparkles, Square, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import type { MicVAD } from '@ricky0123/vad-web';
import type { ChatMessage, ChatResult, MusicTrack, SearchSource, VoiceStatus } from './types';
import Practice from './Practice';

const STORAGE_KEY = 'echo-voicechat-history-v1';
const SESSION_HISTORY_STORAGE_KEY = 'echo-voicechat-sessions-v1';
const ACTIVE_SESSION_STORAGE_KEY = 'echo-voicechat-active-session-v1';
const VOICE_STORAGE_KEY = 'echo-voicechat-voice-v1';
const SPEECH_RATE_STORAGE_KEY = 'echo-voicechat-speech-rate-v1';
const REPLY_MODE_STORAGE_KEY = 'echo-voicechat-reply-mode-v1';
const WEB_SEARCH_STORAGE_KEY = 'echo-voicechat-web-search-v2';
const CONVERSATION_MODE_STORAGE_KEY = 'echo-voicechat-conversation-mode-v2';
const CHAT_REQUEST_TIMEOUT_MS = 60000;
const VOICE_OPTIONS = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar'] as const;
type ReplyMode = 'zh' | 'en' | 'bilingual';
type SearchMode = 'off' | 'fast' | 'deep';
type ConversationMode = 'realtime' | 'smart';
declare global {
  interface Window {
    vad?: { MicVAD: typeof MicVAD };
  }
}
const initialMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: '\u4f60\u597d\uff0c\u6211\u662f Echo\u3002\u51c6\u5907\u597d\u540e\u76f4\u63a5\u5f00\u59cb\u8bf4\u8bdd\u3002',
  translation: 'Hi, I am Echo. Start talking whenever you are ready.',
  createdAt: new Date().toISOString(),
  language: 'zh',
};
type ConversationSession = {
  id: string;
  messages: ChatMessage[];
  savedAt: string;
  title?: string;
  deletedAt?: string;
};
function debug(event: string, details = '') {
  console.info(`[Echo] ${event}${details ? ` ${details}` : ''}`);
}

function chatRequestSignal() {
  return AbortSignal.timeout(CHAT_REQUEST_TIMEOUT_MS);
}

function chatErrorMessage(error: unknown, fallback: string) {
  if (error instanceof DOMException && error.name === 'TimeoutError') return '请求超时，请重试。网络或 AI 服务暂时响应较慢。';
  if (error instanceof DOMException && error.name === 'AbortError') return '请求已中止，请重试。';
  return error instanceof Error ? error.message : fallback;
}

function wavFromSamples(samples: Float32Array, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => Array.from(value).forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true));
  return new Blob([buffer], { type: 'audio/wav' });
}

type AudioStreamEvent =
  | { type: 'transcript'; text: string; translation?: string; language?: string }
  | { type: 'audio'; data: string }
  | { type: 'assistant_delta'; text: string }
  | { type: 'complete'; assistantText: string; translation?: string; language?: string; sources?: SearchSource[]; music?: MusicTrack }
  | { type: 'ignored' }
  | { type: 'error'; error: string };

async function readAudioStream(response: Response, onEvent: (event: AudioStreamEvent) => Promise<void> | void) {
  if (!response.body) throw new Error('The voice response did not include a stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  while (true) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    let lineEnd = pending.indexOf('\n');
    while (lineEnd >= 0) {
      const line = pending.slice(0, lineEnd).trim();
      pending = pending.slice(lineEnd + 1);
      if (line) await onEvent(JSON.parse(line) as AudioStreamEvent);
      lineEnd = pending.indexOf('\n');
    }
    if (done) break;
  }
  if (pending.trim()) await onEvent(JSON.parse(pending) as AudioStreamEvent);
}

function getStoredMessages(): ChatMessage[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) && parsed.length ? parsed : [initialMessage];
  } catch { return [initialMessage]; }
}

function getStoredSessions(): ConversationSession[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_HISTORY_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function sessionTitle(session: ConversationSession) {
  return session.title?.trim() || session.messages.find((message) => message.role === 'user')?.text || session.messages.find((message) => message.id !== 'welcome')?.text || 'New conversation';
}

function getStoredVoice() {
  const voice = localStorage.getItem(VOICE_STORAGE_KEY);
  return VOICE_OPTIONS.find((option) => option === voice) || 'alloy';
}

function getStoredSpeechRate() {
  const value = Number(localStorage.getItem(SPEECH_RATE_STORAGE_KEY));
  return Number.isFinite(value) && value >= 0.75 && value <= 1.5 ? value : 1;
}

function getStoredReplyMode(): ReplyMode {
  const mode = localStorage.getItem(REPLY_MODE_STORAGE_KEY);
  return mode === 'en' || mode === 'bilingual' ? mode : 'zh';
}

function getStoredWebSearch(): SearchMode {
  const value = localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
  if (value === 'fast' || value === 'deep') return value;
  if (value === 'off') return 'off';
  return 'fast';
}

function getStoredConversationMode(): ConversationMode {
  return localStorage.getItem(CONVERSATION_MODE_STORAGE_KEY) === 'smart' ? 'smart' : 'realtime';
}

function labelFor(status: VoiceStatus) {
  return { idle: 'Ready to listen', listening: 'Listening', thinking: 'Echo is thinking', speaking: 'Echo is speaking', error: 'Connection issue' }[status];
}

function timeFor(iso: string) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function replayTextFor(message: ChatMessage) {
  const translation = message.translation?.trim();
  if (translation) return translation;
  return /[a-z]/i.test(message.text) && !/[\u3400-\u9fff]/.test(message.text) ? message.text.trim() : '';
}

function Waveform({ status }: { status: VoiceStatus }) {
  const active = status === 'listening' || status === 'thinking' || status === 'speaking';
  return <div className={`waveform waveform-${status} ${active ? 'waveform-active' : ''}`} aria-hidden="true">{Array.from({ length: 34 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 45}ms` }} />)}</div>;
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>(getStoredMessages);
  const [sessions, setSessions] = useState<ConversationSession[]>(getStoredSessions);
  const [activeSessionId, setActiveSessionId] = useState(() => localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) || '');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyView, setHistoryView] = useState<'active' | 'trash'>('active');
  const [historyPage, setHistoryPage] = useState(1);
  const [editingSessionId, setEditingSessionId] = useState('');
  const [editingTitle, setEditingTitle] = useState('');
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [muted, setMuted] = useState(false);
  const [voice, setVoice] = useState(getStoredVoice);
  const [speechRate, setSpeechRate] = useState(getStoredSpeechRate);
  const [replyMode, setReplyMode] = useState<ReplyMode>(getStoredReplyMode);
  const [searchMode, setSearchMode] = useState<SearchMode>(getStoredWebSearch);
  const [conversationMode, setConversationMode] = useState<ConversationMode>(getStoredConversationMode);
  const [autoListen, setAutoListen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startupProgress, setStartupProgress] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [musicTrack, setMusicTrack] = useState<MusicTrack | null>(null);
  const [appMode, setAppMode] = useState<'chat' | 'practice'>('chat');
  const [replayLoadingId, setReplayLoadingId] = useState('');
  const [replayActiveId, setReplayActiveId] = useState('');
  const [replayPlaying, setReplayPlaying] = useState(false);
  const vadRef = useRef<MicVAD | null>(null);
  const historyRef = useRef(messages);
  const mutedRef = useRef(muted);
  const requestInFlightRef = useRef(false);
  const startingRef = useRef(false);
  const lastLevelUpdateRef = useRef(0);
  const autoListenRef = useRef(autoListen);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackEndsAtRef = useRef(0);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const sendAudioRef = useRef<((blob: Blob) => Promise<void>) | null>(null);
  const replayAudioRef = useRef(new Map<string, string>());
  const replayPlayerRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { historyRef.current = messages; localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50))); }, [messages]);
  useEffect(() => { localStorage.setItem(SESSION_HISTORY_STORAGE_KEY, JSON.stringify(sessions.slice(0, 30))); }, [sessions]);
  useEffect(() => {
    if (activeSessionId) localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, activeSessionId);
    else localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  }, [activeSessionId]);
  useEffect(() => {
    if (!historyOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setHistoryOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [historyOpen]);
  useEffect(() => { setHistoryPage(1); setEditingSessionId(''); }, [historyView]);
  useEffect(() => { localStorage.setItem(VOICE_STORAGE_KEY, voice); }, [voice]);
  useEffect(() => {
    localStorage.setItem(SPEECH_RATE_STORAGE_KEY, String(speechRate));
    if (replayPlayerRef.current) replayPlayerRef.current.playbackRate = speechRate;
  }, [speechRate]);
  useEffect(() => { localStorage.setItem(REPLY_MODE_STORAGE_KEY, replyMode); }, [replyMode]);
  useEffect(() => { localStorage.setItem(WEB_SEARCH_STORAGE_KEY, searchMode); }, [searchMode]);
  useEffect(() => { localStorage.setItem(CONVERSATION_MODE_STORAGE_KEY, conversationMode); }, [conversationMode]);
  useEffect(() => { messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    const panel = document.querySelector('.live-panel');
    if (!panel) return;
    panel.querySelector('#music-player')?.remove();
    if (!musicTrack) return;
    const player = document.createElement('div');
    player.id = 'music-player';
    player.className = 'music-player';
    player.innerHTML = `<div class="music-player-title">${musicTrack.title}</div><iframe title="Bilibili music player" src="${musicTrack.playUrl}" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
    panel.appendChild(player);
    return () => player.remove();
  }, [musicTrack]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { autoListenRef.current = autoListen; }, [autoListen]);
  useEffect(() => {
    const settings = document.querySelector('.voice-settings');
    if (!settings) return;
    const wrapper = document.createElement('label');
    wrapper.className = 'search-mode-control';
    wrapper.innerHTML = '<span class="search-toggle-title">Internet search</span><select class="search-mode-select"><option value="off">Off</option><option value="fast">Fast search</option><option value="deep">Deep search</option></select><span class="search-toggle-caption"></span>';
    const select = wrapper.querySelector<HTMLSelectElement>('select');
    select?.addEventListener('change', (event) => setSearchMode((event.target as HTMLSelectElement).value as SearchMode));
    settings.insertAdjacentElement('afterend', wrapper);
    return () => wrapper.remove();
  }, []);
  useEffect(() => {
    const select = document.querySelector<HTMLSelectElement>('.search-mode-select');
    if (!select) return;
    select.value = searchMode;
    select.disabled = status === 'thinking' || status === 'speaking' || isStarting;
    const caption = select.parentElement?.querySelector('.search-toggle-caption');
    if (caption) caption.textContent = searchMode === 'deep' ? 'Web pages plus AI synthesis' : searchMode === 'fast' ? 'Search snippets for faster answers' : 'No web request';
  }, [searchMode, status, isStarting]);
  useEffect(() => () => stopListening(), []);
  useEffect(() => () => {
    replayPlayerRef.current?.pause();
    replayAudioRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const addMessage = useCallback((message: ChatMessage) => setMessages((current) => [...current, message]), []);

  const playAudio = useCallback(async (result: ChatResult) => {
    if (mutedRef.current) return;
    if (!result.audio) {
      if (!('speechSynthesis' in window) || !result.assistantText) return;
      setStatus('speaking');
      const utterance = new SpeechSynthesisUtterance(result.assistantText);
      utterance.lang = result.language === 'en' || !/[\u3400-\u9fff]/.test(result.assistantText) ? 'en-US' : 'zh-CN';
      utterance.rate = speechRate;
      await new Promise<void>((resolve) => {
        utterance.onend = () => { setStatus('listening'); resolve(); };
        utterance.onerror = () => { setStatus('listening'); resolve(); };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      });
      return;
    }
    debug('playback_start', `audio_chars=${result.audio.length}`);
    setStatus('speaking');
    const audio = new Audio(`data:${result.mimeType};base64,${result.audio}`);
    audio.playbackRate = speechRate;
    audio.preservesPitch = true;
    await new Promise<void>((resolve) => {
      audio.onended = () => { debug('playback_end'); setStatus((current) => current === 'speaking' ? 'listening' : current); resolve(); };
      audio.onerror = () => { setError('The reply was received, but its audio could not be played.'); setStatus('listening'); resolve(); };
      void audio.play().catch(() => { setError('The reply was received, but its audio could not be played.'); resolve(); });
    });
  }, [speechRate]);

  const queuePcmAudio = useCallback(async (base64: string) => {
    if (mutedRef.current) return;
    const context = audioContextRef.current || new AudioContext({ sampleRate: 24000 });
    audioContextRef.current = context;
    if (context.state === 'suspended') await context.resume();
    const encoded = atob(base64);
    if (encoded.length < 2) return;
    const audioBuffer = context.createBuffer(1, Math.floor(encoded.length / 2), 24000);
    const channel = audioBuffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      const offset = index * 2;
      const sample = encoded.charCodeAt(offset) | (encoded.charCodeAt(offset + 1) << 8);
      channel[index] = (sample >= 0x8000 ? sample - 0x10000 : sample) / 0x8000;
    }
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = speechRate;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime + 0.12, playbackEndsAtRef.current);
    source.start(startAt);
    playbackEndsAtRef.current = startAt + audioBuffer.duration / speechRate;
    setStatus('speaking');
  }, [speechRate]);

  const waitForQueuedAudio = useCallback(async () => {
    const context = audioContextRef.current;
    if (!context || playbackEndsAtRef.current <= context.currentTime) return;
    const delayMs = Math.ceil((playbackEndsAtRef.current - context.currentTime) * 1000);
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }, []);

  const replayEnglish = useCallback(async (message: ChatMessage) => {
    const text = replayTextFor(message);
    if (!text || replayLoadingId) return;
    if (replayActiveId === message.id && replayPlayerRef.current) {
      if (replayPlayerRef.current.paused) await replayPlayerRef.current.play();
      else replayPlayerRef.current.pause();
      return;
    }
    setReplayLoadingId(message.id);
    setError('');
    try {
      let audioUrl = replayAudioRef.current.get(message.id) || '';
      if (!audioUrl) {
        const response = await fetch('/api/practice/reference-audio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, rate: 1 }) });
        const data = await response.json() as { audio?: string; mimeType?: string; error?: string };
        if (!response.ok || !data.audio) throw new Error(data.error || 'Unable to prepare the English replay.');
        const bytes = Uint8Array.from(atob(data.audio), (char) => char.charCodeAt(0));
        audioUrl = URL.createObjectURL(new Blob([bytes], { type: data.mimeType || 'audio/wav' }));
        replayAudioRef.current.set(message.id, audioUrl);
      }
      replayPlayerRef.current?.pause();
      const audio = new Audio(audioUrl);
      audio.playbackRate = speechRate;
      audio.preservesPitch = true;
      audio.onplay = () => setReplayPlaying(true);
      audio.onpause = () => setReplayPlaying(false);
      audio.onended = () => setReplayPlaying(false);
      replayPlayerRef.current = audio;
      setReplayActiveId(message.id);
      await audio.play();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to replay the English answer.');
    } finally {
      setReplayLoadingId('');
    }
  }, [replayActiveId, replayLoadingId, speechRate]);

  const sendText = useCallback(async (text: string, language?: string) => {
    const normalized = text.trim();
    if (!normalized) return;
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    await vadRef.current?.pause();
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: normalized, createdAt: new Date().toISOString(), language };
    addMessage(userMessage);
    setStatus('thinking'); setError(''); setDraft('');
    try {
      debug('text_request_start', `text_chars=${normalized.length}`);
      const response = await fetch('/api/chat/text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: chatRequestSignal(), body: JSON.stringify({ text: normalized, language: replyMode, voice, speechRate, conversationMode, fastSmartMode: conversationMode === 'smart', history: historyRef.current, webSearch: searchMode, musicQuery: musicTrack?.query, musicBvid: musicTrack?.bvid }) });
      debug('text_request_response', `status=${response.status}`);
      const result = await response.json() as ChatResult & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Echo could not respond.');
      setMessages((current) => current.map((message) => message.id === userMessage.id ? { ...message, translation: result.userTranslation } : message));
      setMusicTrack(result.music || null);
      addMessage({ id: crypto.randomUUID(), role: 'assistant', text: result.assistantText, translation: result.assistantTranslation, createdAt: new Date().toISOString(), language, sources: result.sources });
      await playAudio(result);
      setStatus((current) => current === 'thinking' ? 'listening' : current);
    } catch (caught) {
      setError(chatErrorMessage(caught, 'Echo could not respond.')); setStatus('error');
    } finally {
      requestInFlightRef.current = false;
      if (autoListenRef.current) void vadRef.current?.start();
    }
  }, [addMessage, conversationMode, replyMode, musicTrack, playAudio, speechRate, voice, searchMode]);

  const sendAudio = useCallback(async (blob: Blob) => {
    if (blob.size < 1800) return;
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    await vadRef.current?.pause();
    setStatus('thinking'); setError('');
    const body = new FormData();
    const extension = blob.type === 'audio/wav' ? 'wav' : 'webm';
    body.append('audio', blob, `voice-note.${extension}`);
    body.append('history', JSON.stringify(historyRef.current));
    body.append('voice', voice);
    body.append('speechRate', String(speechRate));
    body.append('conversationMode', conversationMode);
    body.append('fastSmartMode', String(conversationMode === 'smart'));
    body.append('webSearch', searchMode);
    body.append('musicMode', String(Boolean(musicTrack)));
    if (musicTrack?.query) body.append('musicQuery', musicTrack.query);
    if (musicTrack?.bvid) body.append('musicBvid', musicTrack.bvid);
    body.append('language', replyMode);
    try {
      debug('audio_request_start', `bytes=${blob.size} mime=${blob.type}`);
      playbackEndsAtRef.current = 0;
      if (conversationMode === 'smart') {
        const response = await fetch('/api/chat/audio', { method: 'POST', body, signal: chatRequestSignal() });
        const result = await response.json() as ChatResult & { error?: string };
        if (!response.ok) throw new Error(result.error || 'Echo could not understand that.');
        addMessage({ id: crypto.randomUUID(), role: 'user', text: result.transcript || '', translation: result.userTranslation, createdAt: new Date().toISOString(), language: result.language });
        addMessage({ id: crypto.randomUUID(), role: 'assistant', text: result.assistantText, translation: result.assistantTranslation, createdAt: new Date().toISOString(), language: result.language, sources: result.sources });
        setMusicTrack(result.music || null);
        await playAudio(result);
        setStatus('listening');
        return;
      }
      const response = await fetch('/api/chat/audio/stream', { method: 'POST', body, signal: chatRequestSignal() });
      debug('audio_request_response', `status=${response.status}`);
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || 'Echo could not understand that.');
      }
      let completed = false;
      let streamingMessageId = '';
      let streamingText = '';
      await readAudioStream(response, async (event) => {
        if (event.type === 'error') throw new Error(event.error || 'Echo could not respond.');
        if (event.type === 'transcript') {
          addMessage({ id: crypto.randomUUID(), role: 'user', text: event.text, translation: event.translation, createdAt: new Date().toISOString(), language: event.language });
          return;
        }
        if (event.type === 'audio') {
          await queuePcmAudio(event.data);
          return;
        }
        if (event.type === 'assistant_delta') {
          streamingText += event.text;
          if (!streamingMessageId) {
            streamingMessageId = crypto.randomUUID();
            addMessage({ id: streamingMessageId, role: 'assistant', text: streamingText, createdAt: new Date().toISOString(), language: replyMode });
          } else {
            setMessages((current) => current.map((message) => message.id === streamingMessageId ? { ...message, text: streamingText } : message));
          }
          return;
        }
        if (event.type === 'ignored') {
          completed = true;
          return;
        }
        completed = true;
        setMusicTrack(event.music || null);
        if (streamingMessageId) {
          setMessages((current) => current.map((message) => message.id === streamingMessageId ? { ...message, text: event.assistantText, translation: event.translation, language: event.language, sources: event.sources } : message));
        } else {
          addMessage({ id: crypto.randomUUID(), role: 'assistant', text: event.assistantText, translation: event.translation, createdAt: new Date().toISOString(), language: event.language, sources: event.sources });
        }
      });
      if (!completed) throw new Error('The voice response ended before completion.');
      await waitForQueuedAudio();
      setStatus('listening');
    } catch (caught) {
      setError(chatErrorMessage(caught, 'Voice request failed.')); setStatus('error');
    } finally {
      requestInFlightRef.current = false;
      if (autoListenRef.current) void vadRef.current?.start();
    }
  }, [addMessage, conversationMode, replyMode, musicTrack, playAudio, queuePcmAudio, speechRate, voice, waitForQueuedAudio, searchMode]);

  useEffect(() => { sendAudioRef.current = sendAudio; }, [sendAudio]);

  async function startListening() {
    if (startingRef.current || vadRef.current) return;
    startingRef.current = true;
    setIsStarting(true);
    setStartupProgress(8);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not support microphone access. Use a current browser over HTTPS or localhost.');
      setStatus('error');
      startingRef.current = false;
      setIsStarting(false);
      setStartupProgress(0);
      return;
    }
    let stream: MediaStream | null = null;
    let vad: MicVAD | null = null;
    try {
      debug('microphone_request');
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, autoGainControl: true, noiseSuppression: true },
      });
      setError('');
      setStartupProgress(35);
      debug('microphone_granted');
      let activeStream = stream;
      let pauseStream = false;
      if (!window.vad) throw new Error('Voice activity detection assets did not load. Restart the Vite server.');
      setStartupProgress(50);
      vad = await window.vad.MicVAD.new({
        model: 'v5',
          baseAssetPath: '/voicechat/vad-v2/',
          onnxWASMBasePath: '/voicechat/vad-v2/ort/',
        positiveSpeechThreshold: musicTrack ? 0.78 : 0.6,
        negativeSpeechThreshold: 0.35,
        redemptionMs: musicTrack ? 1200 : 850,
        preSpeechPadMs: 300,
        minSpeechMs: musicTrack ? 500 : 350,
        submitUserSpeechOnPause: false,
        getStream: async () => activeStream,
        pauseStream: async (currentStream) => {
          pauseStream = true;
          currentStream.getTracks().forEach((track) => track.stop());
        },
        resumeStream: async () => {
          if (!pauseStream) return activeStream;
          activeStream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, autoGainControl: true, noiseSuppression: true },
          });
          pauseStream = false;
          return activeStream;
        },
        onSpeechStart: () => debug('vad_speech_start'),
        onSpeechEnd: (samples) => {
          const recording = wavFromSamples(samples);
          debug('vad_speech_end', `samples=${samples.length} bytes=${recording.size}`);
          void sendAudioRef.current?.(recording);
        },
        onVADMisfire: () => debug('vad_misfire'),
        onFrameProcessed: ({ isSpeech }) => {
          const now = Date.now();
          if (now - lastLevelUpdateRef.current > 120) {
            setAudioLevel(isSpeech);
            lastLevelUpdateRef.current = now;
          }
        },
      });
      setStartupProgress(80);
      vadRef.current = vad;
      await vad.start();
      setStartupProgress(100);
      setAutoListen(true); setStatus('listening'); debug('microphone_ready');
    } catch (caught) {
      const details = caught instanceof DOMException ? `${caught.name}: ${caught.message}` : String(caught);
      debug('microphone_or_vad_failed', details);
      stream?.getTracks().forEach((track) => track.stop());
      if (vad) await vad.destroy().catch(() => undefined);
      vadRef.current = null;
      const isPermissionError = caught instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(caught.name);
      setError(isPermissionError ? `Microphone permission failed (${details}). Allow this site to use the microphone, then try again.` : `Voice detection could not start: ${details}`);
      setStatus('error');
      setStartupProgress(0);
    } finally {
      startingRef.current = false;
      setIsStarting(false);
    }
  }

  function stopListening() {
    debug('session_stopped'); setAutoListen(false);
    void vadRef.current?.destroy(); vadRef.current = null;
    setStatus((current) => current === 'listening' ? 'idle' : current);
  }

  const clearConversation = () => {
    const currentMessages = historyRef.current;
    if (currentMessages.some((message) => message.id !== 'welcome')) {
      const savedAt = new Date().toISOString();
      setSessions((current) => {
        const restoredSessionExists = activeSessionId && current.some((session) => session.id === activeSessionId);
        return restoredSessionExists
          ? current.map((session) => session.id === activeSessionId ? { ...session, messages: currentMessages, savedAt } : session)
          : [{ id: crypto.randomUUID(), messages: currentMessages, savedAt }, ...current].slice(0, 30);
      });
    }
    replayPlayerRef.current?.pause();
    setReplayActiveId('');
    setReplayPlaying(false);
    setMusicTrack(null);
    setMessages([{ ...initialMessage, createdAt: new Date().toISOString() }]);
    setActiveSessionId('');
    setError('');
  };
  const restoreSession = (session: ConversationSession) => {
    setMessages(session.messages);
    setActiveSessionId(session.id);
    setMusicTrack(null);
    setError('');
    setHistoryOpen(false);
  };
  const updateSessionTitle = (session: ConversationSession) => {
    const title = editingTitle.trim();
    if (!title) return;
    setSessions((current) => current.map((item) => item.id === session.id ? { ...item, title } : item));
    setEditingSessionId('');
    setEditingTitle('');
  };
  const moveSessionToTrash = (sessionId: string) => {
    setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, deletedAt: new Date().toISOString() } : session));
    if (activeSessionId === sessionId) setActiveSessionId('');
  };
  const restoreFromTrash = (sessionId: string) => {
    setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, deletedAt: undefined } : session));
  };
  const permanentlyDeleteSession = (session: ConversationSession) => {
    if (!window.confirm(`彻底删除“${sessionTitle(session)}”？此操作无法撤销。`)) return;
    setSessions((current) => current.filter((item) => item.id !== session.id));
  };
  const historyItems = sessions.filter((session) => historyView === 'trash' ? Boolean(session.deletedAt) : !session.deletedAt);
  const HISTORY_PAGE_SIZE = 8;
  const historyPageCount = Math.max(1, Math.ceil(historyItems.length / HISTORY_PAGE_SIZE));
  const currentHistoryPage = Math.min(historyPage, historyPageCount);
  const visibleHistoryItems = historyItems.slice((currentHistoryPage - 1) * HISTORY_PAGE_SIZE, currentHistoryPage * HISTORY_PAGE_SIZE);
  const activeHistoryCount = sessions.filter((session) => !session.deletedAt).length;
  const trashCount = sessions.length - activeHistoryCount;
  const isActive = status === 'listening' || status === 'speaking';

  if (appMode === 'practice') return <Practice speechRate={speechRate} onSpeechRateChange={setSpeechRate} onExit={() => setAppMode('chat')} />;

  return <main className="min-h-screen overflow-hidden bg-[#10131b] text-slate-100 selection:bg-teal-200 selection:text-slate-950">
    <div className="grid-noise" />
    <div className="relative mx-auto flex min-h-screen max-w-[1440px] flex-col px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <header className="flex items-center justify-between border-b border-white/10 pb-4 sm:pb-5">
        <div className="flex items-center gap-3"><div className="brand-mark"><AudioLines size={21} strokeWidth={2.5} /></div><div><p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-teal-100/55">Voice companion</p><h1 className="text-lg font-semibold tracking-wide text-white">{conversationMode === 'smart' ? 'GPT-5.6' : 'GPT AUDIO'}</h1></div></div>
        <button className="practice-entry" onClick={() => { stopListening(); setAppMode('practice'); }}><Mic size={16} />对比评分</button>
      </header>
      <section className="grid flex-1 gap-5 py-5 md:grid-cols-[minmax(0,1fr)_340px] md:items-stretch md:py-6">
        <div className="conversation-panel flex h-[min(680px,calc(100dvh-7rem))] min-h-0 min-w-0 w-full flex-col overflow-hidden md:h-[min(720px,calc(100dvh-9rem))]">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6"><div className="flex min-w-0 items-center gap-3"><span className={`status-dot ${isActive ? 'status-dot-active' : ''}`} /><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-100">{conversationMode === 'smart' ? 'gpt-5.6-luna' : 'gpt-audio-mini'}</p><p className="truncate text-xs text-slate-400">{labelFor(status)}</p></div></div><div className="conversation-tools"><button disabled={status === 'thinking' || status === 'speaking' || isStarting} onClick={clearConversation} className="conversation-tool" title="清屏" aria-label="清屏"><Trash2 size={15} /><span>清屏</span></button><button onClick={() => setHistoryOpen(true)} className="conversation-tool" title="历史记录" aria-label="打开历史记录"><History size={15} /><span>历史记录</span>{activeHistoryCount > 0 && <b>{activeHistoryCount}</b>}</button></div></div>
          <div ref={messageListRef} className="scrollbar min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-7 sm:px-8">{messages.map((message) => <article key={message.id} className={`message-row ${message.role === 'user' ? 'message-user' : ''}`}><div className={`avatar ${message.role === 'assistant' ? 'avatar-echo' : ''}`}>{message.role === 'assistant' ? <Bot size={16} /> : 'Y'}</div><div className="max-w-[82%] sm:max-w-[76%]"><div className="mb-1.5 flex items-center gap-2 text-[11px] text-slate-500"><span className="font-medium text-slate-400">{message.role === 'assistant' ? (conversationMode === 'smart' ? 'GPT-5.6' : 'Echo') : 'You'}</span><span>{timeFor(message.createdAt)}</span></div><div className={message.role === 'user' ? 'message-user-bubble' : ''}><p className="message">{message.text}</p>{message.translation && message.translation.trim().toLowerCase() !== message.text.trim().toLowerCase() ? <p className="message-translation"><span>EN</span>{message.translation}</p> : null}{message.role === 'assistant' && replayTextFor(message) ? <div className={`replay-player ${replayActiveId === message.id ? 'replay-player-active' : ''}`}><div className="replay-actions"><button disabled={Boolean(replayLoadingId)} onClick={() => void replayEnglish(message)} title={replayActiveId === message.id && replayPlaying ? '暂停' : '播放'} aria-label={replayActiveId === message.id && replayPlaying ? '暂停' : '播放'}>{replayLoadingId === message.id ? <LoaderCircle size={15} className="animate-spin" /> : replayActiveId === message.id && replayPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button></div><label className="replay-rate"><span>语速</span><input type="range" min="0.75" max="1.5" step="0.05" value={speechRate} onChange={(event) => setSpeechRate(Number(event.target.value))} aria-label="实时调整播放语速" /><output>{speechRate.toFixed(2)}x</output></label></div> : null}</div>{message.sources?.length ? <div className="mt-3 space-y-1 border-l border-teal-300/30 pl-3 text-[11px] text-slate-500"><p className="font-medium uppercase tracking-wider text-teal-200/70">Sources</p>{message.sources.map((source, index) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="block truncate hover:text-teal-200">[{index + 1}] {source.title}</a>)}</div> : null}</div></article>)}</div>
          <div className="border-t border-white/10 bg-black/10 p-4 sm:p-5"><div className="flex items-center gap-3"><button disabled={isStarting} onClick={() => autoListen ? stopListening() : void startListening()} className={`mic-button ${autoListen ? 'mic-button-active' : ''}`} title={autoListen ? 'Stop listening' : 'Start continuous listening'} aria-label={autoListen ? 'Stop listening' : 'Start continuous listening'}>{isStarting ? <LoaderCircle size={19} className="animate-spin" /> : autoListen ? <Square size={17} fill="currentColor" /> : <Mic size={20} />}</button><form onSubmit={(event) => { event.preventDefault(); void sendText(draft); }} className="message-composer"><input value={draft} onChange={(event) => setDraft(event.target.value)} className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-slate-500" placeholder={isStarting ? `Loading voice detection... ${startupProgress}%` : autoListen ? 'Listening for your next turn...' : 'Write a message'} /><button disabled={!draft.trim() || status === 'thinking' || isStarting} className="send-button" aria-label="Send text message"><Send size={18} /></button></form></div>{error && <div className="mt-3 flex items-center justify-between gap-3 border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-xs text-rose-100"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}</div>
        </div>
        <aside className="live-panel relative flex min-h-[420px] min-w-0 w-full flex-col overflow-hidden p-6 sm:p-7 md:min-h-[580px]">
          <label className="model-control"><span>Conversation model</span><select value={conversationMode} onChange={(event) => setConversationMode(event.target.value as ConversationMode)} disabled={status === 'thinking' || status === 'speaking' || isStarting}><option value="realtime">gpt-audio-mini - Speed</option><option value="smart">gpt-5.6-luna - Smart</option><option disabled>gpt-realtime - Huabot pending</option></select></label>
          <div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-teal-100/60">Voice channel</span><span className="flex items-center gap-1.5 text-xs text-emerald-300"><span className="status-dot status-dot-active" />Online</span></div>
          <div className="relative flex flex-1 flex-col items-center justify-center py-8"><div className={`orbital ${isActive ? 'orbital-active' : ''}`}><div className="orbital-inner"><Sparkles size={31} /></div></div><Waveform status={status} /><p className="mt-7 text-sm font-medium text-slate-100">{isStarting ? 'Starting microphone...' : labelFor(status)}</p><p className="mt-2 max-w-56 text-center text-xs leading-5 text-slate-500">{isStarting ? 'Requesting permission and loading voice detection.' : 'Speak naturally. Echo sends your message after a short pause.'}</p>{isStarting && <div className="mt-5 w-56"><div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-wider text-teal-100/70"><span>Loading VAD</span><span>{startupProgress}%</span></div><div className="h-1 overflow-hidden bg-white/10"><div className="h-full bg-teal-300 transition-all duration-300" style={{ width: `${startupProgress}%` }} /></div></div>}{autoListen && <p className="mt-3 font-mono text-[11px] text-teal-100/70">VOICE ACTIVITY {audioLevel.toFixed(2)}</p>}</div>
          <div className="space-y-4 border-t border-white/10 pt-5"><div className="flex items-center justify-between text-xs text-slate-400"><span>Spoken replies</span><button onClick={() => setMuted((value) => !value)} className="audio-toggle" aria-label={muted ? 'Enable spoken replies' : 'Mute spoken replies'}><span>{muted ? 'Off' : 'On'}</span>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button></div><div className="voice-settings"><label><span>Reply mode</span><select value={replyMode} onChange={(event) => setReplyMode(event.target.value as ReplyMode)} disabled={status === 'thinking' || status === 'speaking' || isStarting}><option value="zh">中文回答</option><option value="en">English answer</option><option value="bilingual">中文后 English</option></select></label><label><span>Voice</span><select value={voice} onChange={(event) => setVoice(event.target.value as (typeof VOICE_OPTIONS)[number])} disabled={status === 'thinking' || status === 'speaking' || isStarting}>{VOICE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label></div><label className="speech-rate-control"><span><span>Speech speed</span><output>{speechRate.toFixed(2)}x</output></span><input type="range" min="0.75" max="1.5" step="0.05" value={speechRate} onChange={(event) => setSpeechRate(Number(event.target.value))} aria-label="Speech speed" /></label><p className="text-[10px] leading-4 text-slate-500">Echo uses an AI-generated voice.</p><button disabled={isStarting} onClick={() => autoListen ? stopListening() : void startListening()} className={`session-button ${autoListen ? 'session-button-stop' : ''}`}>{isStarting ? <><LoaderCircle size={17} className="animate-spin" /> Starting... {startupProgress}%</> : autoListen ? <><Square size={16} fill="currentColor" /> End session</> : <><Mic size={17} /> Start session</>}</button></div>
        </aside>
      </section>
      <footer className="pt-1 text-center text-[11px] text-slate-600 sm:text-left">Your conversation is kept in this browser.</footer>
    </div>
    {historyOpen && <div className="history-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryOpen(false); }}><aside className="history-drawer" role="dialog" aria-modal="true" aria-labelledby="history-title"><header><div><p>保存在本机</p><h2 id="history-title">历史记录</h2></div><button onClick={() => setHistoryOpen(false)} aria-label="关闭历史记录"><X size={18} /></button></header><div className="history-tabs" role="tablist"><button className={historyView === 'active' ? 'active' : ''} onClick={() => setHistoryView('active')} role="tab" aria-selected={historyView === 'active'}><History size={14} />记录 <span>{activeHistoryCount}</span></button><button className={historyView === 'trash' ? 'active' : ''} onClick={() => setHistoryView('trash')} role="tab" aria-selected={historyView === 'trash'}><Trash2 size={14} />回收站 <span>{trashCount}</span></button></div><div className="history-list scrollbar">{visibleHistoryItems.length ? visibleHistoryItems.map((session) => <article key={session.id} className="history-item">{editingSessionId === session.id ? <form className="history-title-editor" onSubmit={(event) => { event.preventDefault(); updateSessionTitle(session); }}><input autoFocus maxLength={60} value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} aria-label="自定义标题" /><button type="submit" disabled={!editingTitle.trim()} title="保存标题" aria-label="保存标题"><Check size={15} /></button><button type="button" onClick={() => setEditingSessionId('')} title="取消" aria-label="取消编辑"><X size={15} /></button></form> : <button className="history-item-main" onClick={() => historyView === 'active' && restoreSession(session)} disabled={historyView === 'trash'}><span className="history-item-copy"><strong>{sessionTitle(session)}</strong><span>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(session.deletedAt || session.savedAt))} · {session.messages.length} 条消息</span></span>{historyView === 'active' && <ChevronRight size={17} />}</button>}<div className="history-item-actions">{historyView === 'active' ? <><button onClick={() => { setEditingSessionId(session.id); setEditingTitle(sessionTitle(session)); }} title="自定义标题" aria-label="自定义标题"><Pencil size={14} /></button><button onClick={() => moveSessionToTrash(session.id)} title="移入回收站" aria-label="移入回收站"><Trash2 size={14} /></button></> : <><button onClick={() => restoreFromTrash(session.id)} title="还原" aria-label="还原历史记录"><RotateCcw size={14} /></button><button className="danger" onClick={() => permanentlyDeleteSession(session)} title="彻底删除" aria-label="彻底删除"><Trash2 size={14} /></button></>}</div></article>) : <div className="history-empty">{historyView === 'trash' ? <Trash2 size={24} /> : <History size={24} />}<strong>{historyView === 'trash' ? '回收站为空' : '暂无历史记录'}</strong><p>{historyView === 'trash' ? '删除的记录会暂时保存在这里。' : '清屏后的对话会显示在这里。'}</p></div>}</div>{historyItems.length > HISTORY_PAGE_SIZE && <nav className="history-pagination" aria-label="历史记录翻页"><button disabled={currentHistoryPage === 1} onClick={() => setHistoryPage((page) => Math.max(1, page - 1))} aria-label="上一页"><ChevronLeft size={16} /></button><span>{currentHistoryPage} / {historyPageCount}</span><button disabled={currentHistoryPage === historyPageCount} onClick={() => setHistoryPage((page) => Math.min(historyPageCount, page + 1))} aria-label="下一页"><ChevronRight size={16} /></button></nav>}</aside></div>}
  </main>;
}
