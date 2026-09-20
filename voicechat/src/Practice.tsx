import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Headphones, Library, LoaderCircle, Mic, Pause, Play, RotateCcw, Square } from 'lucide-react';
import { loadRecording, saveRecording } from './recording-cache';
import { loadReferenceAudio, saveReferenceAudio } from './reference-audio-cache';

type PromptType = 'sentence' | 'story';
type Difficulty = 'beginner' | 'intermediate' | 'advanced';
type Prompt = { id: string; type: PromptType; difficulty: Difficulty; text: string; translation?: string; phonetics?: string[]; masteredAt?: string | null };
type WordResult = { word: string; status: 'good' | 'needs-work' | 'missing'; heard?: string };
type Result = {
  transcript: string;
  overall: number;
  accuracy: number;
  fluency: number;
  completeness: number;
  rhythm: number;
  aligned: WordResult[];
  feedback: string;
};
const ANNOTATION_STORAGE_KEY = 'echo-practice-annotations-v1';
const REFERENCE_AUDIO_VERSION = 'sapi-v1';

function storedAnnotation(text: string): Pick<Prompt, 'translation' | 'phonetics'> | null {
  try {
    const cache = JSON.parse(localStorage.getItem(ANNOTATION_STORAGE_KEY) || '{}');
    return cache[text] || null;
  } catch { return null; }
}

function storeAnnotation(prompt: Prompt) {
  if (!prompt.translation || !prompt.phonetics?.length) return;
  try {
    const cache = JSON.parse(localStorage.getItem(ANNOTATION_STORAGE_KEY) || '{}');
    cache[prompt.text] = { translation: prompt.translation, phonetics: prompt.phonetics };
    const keys = Object.keys(cache);
    keys.slice(0, Math.max(0, keys.length - 100)).forEach((key) => delete cache[key]);
    localStorage.setItem(ANNOTATION_STORAGE_KEY, JSON.stringify(cache));
  } catch { /* Browser storage is optional. */ }
}

function wavFromRecording(samples: Float32Array, sampleRate: number) {
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

function waveformLevels(samples: Float32Array, bars = 64) {
  if (!samples.length) return [];
  const block = Math.max(1, Math.floor(samples.length / bars));
  const levels = Array.from({ length: bars }, (_, index) => {
    let peak = 0;
    const end = Math.min(samples.length, (index + 1) * block);
    for (let offset = index * block; offset < end; offset += 1) peak = Math.max(peak, Math.abs(samples[offset]));
    return peak;
  });
  const max = Math.max(...levels, 0.01);
  return levels.map((level) => Math.max(0.06, level / max));
}

function WaveTrack({ label, levels, duration, maxDuration, active }: { label: string; levels: number[]; duration: number; maxDuration: number; active?: boolean }) {
  const width = Math.max(8, Math.min(100, duration / Math.max(maxDuration, 0.1) * 100));
  return <div className={`comparison-track ${active ? 'track-active' : ''}`}><span>{label}</span><div className="track-scale"><div className="track-signal" style={{ width: `${width}%` }}>{Array.from({ length: 64 }, (_, index) => <i key={index} style={{ height: `${Math.round((levels[index] || 0.06) * 30)}px` }} />)}</div></div><b>{duration ? `${duration.toFixed(1)}s` : '--'}</b></div>;
}

function Phonetic({ value }: { value: string }) {
  const stressed = value.match(/^(.*?)([ˈˌ].*)$/);
  return <span className="prompt-phonetic">{stressed ? <>{stressed[1]}<mark>{stressed[2]}</mark></> : value}</span>;
}

function AnnotatedSentence({ prompt, activeWord, activeReadIndex, onPlayWord }: { prompt: Prompt; activeWord: string; activeReadIndex: number; onPlayWord: (word: string) => void }) {
  if (!prompt.phonetics?.length) return <p className="prompt-plain-text">{prompt.text}</p>;
  let phoneticIndex = 0;
  const sentences = prompt.type === 'story' ? (prompt.text.match(/[^.!?]+[.!?]?/g) || [prompt.text]) : [prompt.text];
  return <div className={`annotated-sentence ${prompt.type === 'story' ? 'annotated-story' : ''}`} aria-label={prompt.text}>{sentences.map((sentence, sentenceIndex) => <div className="annotated-line" key={`${sentenceIndex}-${sentence}`}>{(sentence.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).map((word) => { const index = phoneticIndex; phoneticIndex += 1; return <button type="button" data-word-index={index} className={`annotated-word ${activeWord === word || activeReadIndex === index ? 'annotated-word-active' : ''}`} key={`${word}-${index}`} onClick={() => onPlayWord(word)} title={`播放 ${word}`}><Phonetic value={prompt.phonetics?.[index] || ''} /><b>{word}</b></button>; })}</div>)}</div>;
}

export default function Practice({ speechRate, onSpeechRateChange, onExit }: { speechRate: number; onSpeechRateChange: (rate: number) => void; onExit: () => void }) {
  const [type, setType] = useState<PromptType>('sentence');
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner');
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [previousScore, setPreviousScore] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [libraryPage, setLibraryPage] = useState(0);
  const [libraryTotal, setLibraryTotal] = useState(0);
  const [masteredPage, setMasteredPage] = useState(0);
  const [masteredTotal, setMasteredTotal] = useState(0);
  const [viewingMastered, setViewingMastered] = useState(false);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceSpeaking, setReferenceSpeaking] = useState(false);
  const [wordSpeaking, setWordSpeaking] = useState('');
  const [referenceWordIndex, setReferenceWordIndex] = useState(-1);
  const [referenceLevels, setReferenceLevels] = useState<number[]>([]);
  const [referenceDuration, setReferenceDuration] = useState(0);
  const [userLevels, setUserLevels] = useState<number[]>([]);
  const [userDuration, setUserDuration] = useState(0);
  const [userAudioUrl, setUserAudioUrl] = useState('');
  const [error, setError] = useState('');
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const startedAtRef = useRef(0);
  const referenceAudioRef = useRef<{ key: string; url: string } | null>(null);
  const referenceAudioCacheRef = useRef(new Map<string, { url: string; levels: number[]; duration: number }>());
  const referencePlayerRef = useRef<HTMLAudioElement | null>(null);
  const wordPlayerRef = useRef<HTMLAudioElement | null>(null);
  const wordAudioRef = useRef(new Map<string, string>());
  const annotationPromiseRef = useRef(new Map<string, Promise<Prompt>>());
  const promptViewportRef = useRef<HTMLDivElement | null>(null);
  const userAudioUrlRef = useRef('');

  async function showUserRecording(blob: Blob) {
    if (userAudioUrlRef.current) URL.revokeObjectURL(userAudioUrlRef.current);
    const url = URL.createObjectURL(blob);
    userAudioUrlRef.current = url;
    setUserAudioUrl(url);
    const context = new AudioContext();
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    setUserLevels(waveformLevels(decoded.getChannelData(0)));
    setUserDuration(decoded.duration);
    await context.close();
  }

  async function prepareReferenceAudio(target: Prompt, reportError = true) {
    const key = target.id;
    const persistentKey = `${REFERENCE_AUDIO_VERSION}:${key}`;
    if (referenceAudioRef.current?.key === key) return referenceAudioRef.current.url;
    const cached = referenceAudioCacheRef.current.get(key);
    if (cached) {
      referenceAudioCacheRef.current.delete(key);
      referenceAudioCacheRef.current.set(key, cached);
      referenceAudioRef.current = { key, url: cached.url };
      setReferenceLevels(cached.levels);
      setReferenceDuration(cached.duration);
      return cached.url;
    }
    setReferenceLoading(true);
    try {
      let blob = await loadReferenceAudio(persistentKey).catch(() => null);
      if (!blob) {
      const response = await fetch('/api/practice/reference-audio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: target.text, rate: 1 }) });
      const data = await response.json() as { audio?: string; mimeType?: string; error?: string };
      if (!response.ok || !data.audio) throw new Error(data.error || '本地标准发音生成失败。');
      const bytes = Uint8Array.from(atob(data.audio), (char) => char.charCodeAt(0));
        blob = new Blob([bytes], { type: data.mimeType || 'audio/wav' });
        void saveReferenceAudio(persistentKey, blob).catch(() => undefined);
      }
      const audioUrl = URL.createObjectURL(blob);
      const context = new AudioContext();
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      const levels = waveformLevels(decoded.getChannelData(0));
      const duration = decoded.duration;
      await context.close();
      referenceAudioCacheRef.current.set(key, { url: audioUrl, levels, duration });
      while (referenceAudioCacheRef.current.size > 30) {
        const oldestKey = referenceAudioCacheRef.current.keys().next().value as string | undefined;
        if (!oldestKey) break;
        const oldest = referenceAudioCacheRef.current.get(oldestKey);
        if (oldest) URL.revokeObjectURL(oldest.url);
        referenceAudioCacheRef.current.delete(oldestKey);
      }
      referenceAudioRef.current = { key, url: audioUrl };
      setReferenceLevels(levels);
      setReferenceDuration(duration);
      return audioUrl;
    } catch (caught) {
      if (reportError) setError(caught instanceof Error ? caught.message : '本地标准发音生成失败。');
      throw caught;
    } finally {
      setReferenceLoading(false);
    }
  }

  async function annotatePrompt(target: Prompt) {
    if (target.translation && target.phonetics?.length) return target;
    const cached = storedAnnotation(target.text);
    if (cached?.translation && cached.phonetics?.length) return { ...target, ...cached };
    const key = target.id || target.text;
    const pending = annotationPromiseRef.current.get(key);
    if (pending) return pending;
    const request = (async () => {
      const response = await fetch('/api/practice/annotate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: target.id, text: target.text }) });
      const details = await response.json() as Pick<Prompt, 'translation' | 'phonetics'> & { error?: string };
      if (!response.ok || !details.translation || !details.phonetics?.length) throw new Error(details.error || '翻译和音标生成失败。');
      const annotated = { ...target, translation: details.translation, phonetics: details.phonetics };
      storeAnnotation(annotated);
      setPrompt((current) => current?.id === target.id ? annotated : current);
      return annotated;
    })();
    annotationPromiseRef.current.set(key, request);
    try { return await request; } finally { annotationPromiseRef.current.delete(key); }
  }

  async function loadPrompt(keepPrevious = false) {
    setError('');
    if (!keepPrevious) { setResult(null); setPreviousScore(null); }
    const query = new URLSearchParams({ type, difficulty, ...(prompt ? { previous: prompt.text } : {}) });
    try {
      const response = await fetch(`/api/practice/prompt?${query}`);
      const data = await response.json() as Prompt & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load a practice prompt.');
      const cached = storedAnnotation(data.text);
      const nextPrompt = cached ? { ...data, ...cached } : data;
      setPrompt(nextPrompt);
      setResult(null);
      setPreviousScore(null);
      setUserLevels([]);
      setUserDuration(0);
      setUserAudioUrl('');
      if (userAudioUrlRef.current) URL.revokeObjectURL(userAudioUrlRef.current);
      userAudioUrlRef.current = '';
      setReferenceLevels([]);
      setReferenceDuration(0);
      referencePlayerRef.current?.pause();
      referencePlayerRef.current = null;
      setReferenceSpeaking(false);
      referenceAudioRef.current = null;
      if (nextPrompt.type !== 'story') void prepareReferenceAudio(nextPrompt, false).catch(() => undefined);
      void loadRecording(data.id).then((blob) => blob && showUserRecording(blob)).catch(() => undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load a practice prompt.');
    }
  }

  async function generatePrompt() {
    if (generating || recording || evaluating) return;
    setGenerating(true); setError('');
    try {
      const response = await fetch('/api/practice/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, difficulty }) });
      const data = await response.json() as { items?: Prompt[]; item?: Prompt; page?: number; total?: number; error?: string };
      if (!response.ok || !data.item || !data.items?.length) throw new Error(data.error || '新增练习内容失败。');
      data.items.forEach(storeAnnotation);
      setLibraryPage(data.page || 1); setLibraryTotal(data.total || data.items.length);
      setPrompt(data.item); setResult(null); setPreviousScore(null);
      setUserLevels([]); setUserDuration(0); setUserAudioUrl('');
      referencePlayerRef.current?.pause(); referencePlayerRef.current = null; setReferenceSpeaking(false);
      referenceAudioRef.current = null; setReferenceLevels([]); setReferenceDuration(0);
      if (data.item.type !== 'story') void prepareReferenceAudio(data.item, false).catch(() => undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '新增练习内容失败。');
    } finally { setGenerating(false); }
  }

  async function showLibraryPage(page: number, activate = true) {
    try {
      const query = new URLSearchParams({ type, difficulty, page: String(page) });
      const response = await fetch(`/api/practice/library?${query}`);
      const data = await response.json() as { item: Prompt | null; page: number; total: number; error?: string };
      if (!response.ok) throw new Error(data.error || '例句库读取失败。');
      setLibraryPage(data.total ? data.page : 0); setLibraryTotal(data.total);
      if (!activate || !data.item) return;
      setViewingMastered(false);
      setPrompt(data.item); setResult(null); setPreviousScore(null);
      setUserLevels([]); setUserDuration(0); setUserAudioUrl('');
      referencePlayerRef.current?.pause(); referencePlayerRef.current = null; setReferenceSpeaking(false);
      referenceAudioRef.current = null; setReferenceLevels([]); setReferenceDuration(0);
      if (data.item.type !== 'story') void prepareReferenceAudio(data.item, false).catch(() => undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '例句库读取失败。');
    }
  }

  async function showMasteredPage(page: number, activate = true) {
    try {
      const query = new URLSearchParams({ type, difficulty, page: String(page) });
      const response = await fetch(`/api/practice/mastered?${query}`);
      const data = await response.json() as { item: Prompt | null; page: number; total: number; error?: string };
      if (!response.ok) throw new Error(data.error || '已掌握库读取失败。');
      setMasteredPage(data.total ? data.page : 0); setMasteredTotal(data.total);
      if (!activate || !data.item) return;
      setViewingMastered(true); setPrompt(data.item); setResult(null); setPreviousScore(null);
      referencePlayerRef.current?.pause(); referencePlayerRef.current = null; setReferenceSpeaking(false);
      referenceAudioRef.current = null; setReferenceLevels([]); setReferenceDuration(0);
      if (data.item.type !== 'story') void prepareReferenceAudio(data.item, false).catch(() => undefined);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '已掌握库读取失败。'); }
  }

  async function toggleMastered() {
    if (!prompt) return;
    const mastered = !viewingMastered;
    try {
      const response = await fetch('/api/practice/mastered', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: prompt.id, mastered, item: prompt }) });
      const data = await response.json() as Prompt & { error?: string };
      if (!response.ok) throw new Error(data.error || '已掌握状态保存失败。');
      await showMasteredPage(mastered ? masteredPage || 1 : Math.max(1, masteredPage - 1), false);
      if (mastered) {
        setViewingMastered(false);
        if (libraryTotal > 1) await showLibraryPage(Math.min(Math.max(1, libraryPage), libraryTotal - 1));
        else await loadPrompt();
      } else {
        setViewingMastered(false);
        await showLibraryPage(Math.max(1, libraryPage), false);
        await loadPrompt();
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : '已掌握状态保存失败。'); }
  }

  useEffect(() => { setViewingMastered(false); void loadPrompt(); void showLibraryPage(1, false); void showMasteredPage(1, false); }, [type, difficulty]);
  useEffect(() => {
    const minimum = type === 'story' ? 1 : 5;
    if (libraryTotal >= minimum) return;
    const timer = window.setInterval(() => { void showLibraryPage(1, false); }, 3000);
    return () => window.clearInterval(timer);
  }, [type, difficulty, libraryTotal]);
  useEffect(() => {
    if (!prompt || (prompt.translation && prompt.phonetics?.length)) return;
    void annotatePrompt(prompt).catch(() => undefined);
  }, [prompt?.id]);
  useEffect(() => {
    if (referencePlayerRef.current) referencePlayerRef.current.playbackRate = speechRate;
    if (wordPlayerRef.current) wordPlayerRef.current.playbackRate = speechRate;
  }, [speechRate]);
  useEffect(() => {
    if (referenceWordIndex < 0) return;
    const viewport = promptViewportRef.current;
    const word = viewport?.querySelector<HTMLElement>(`[data-word-index="${referenceWordIndex}"]`);
    if (!viewport || !word) return;
    const viewportRect = viewport.getBoundingClientRect();
    const wordRect = word.getBoundingClientRect();
    const top = viewport.scrollTop + wordRect.top - viewportRect.top - viewport.clientHeight / 2 + wordRect.height / 2;
    viewport.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [referenceWordIndex]);
  useEffect(() => {
    setReferenceWordIndex(-1);
    promptViewportRef.current?.scrollTo({ top: 0 });
  }, [prompt?.id]);
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void contextRef.current?.close();
    referenceAudioCacheRef.current.forEach((entry) => URL.revokeObjectURL(entry.url));
    referencePlayerRef.current?.pause();
    wordPlayerRef.current?.pause();
    wordAudioRef.current.forEach((url) => URL.revokeObjectURL(url));
    if (userAudioUrlRef.current) URL.revokeObjectURL(userAudioUrlRef.current);
  }, []);

  async function playReference() {
    if (!prompt || referenceLoading) return;
    if (referencePlayerRef.current) {
      if (referencePlayerRef.current.paused) await referencePlayerRef.current.play();
      else referencePlayerRef.current.pause();
      return;
    }
    setError(''); setReferenceLoading(true);
    try {
      wordPlayerRef.current?.pause();
      const [, audioUrl] = await Promise.all([annotatePrompt(prompt), prepareReferenceAudio(prompt)]);
      const audio = new Audio(audioUrl);
      audio.playbackRate = speechRate;
      audio.preservesPitch = true;
      const wordCount = (prompt.text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).length;
      audio.onplaying = () => setReferenceSpeaking(true);
      audio.ontimeupdate = () => {
        if (!Number.isFinite(audio.duration) || !wordCount) return;
        setReferenceWordIndex(Math.min(wordCount - 1, Math.floor(audio.currentTime / audio.duration * wordCount)));
      };
      audio.onpause = () => setReferenceSpeaking(false);
      audio.onended = () => { setReferenceSpeaking(false); setReferenceWordIndex(-1); referencePlayerRef.current = null; };
      audio.onerror = () => { setReferenceSpeaking(false); referencePlayerRef.current = null; setError('本地标准发音播放失败。'); };
      referencePlayerRef.current = audio;
      await audio.play();
    } catch (caught) {
      setReferenceSpeaking(false);
      setError(caught instanceof Error ? caught.message : '标准发音播放失败。');
    } finally {
      setReferenceLoading(false);
    }
  }

  async function playWord(word: string) {
    setError('');
    try {
      referencePlayerRef.current?.pause();
      wordPlayerRef.current?.pause();
      let audioUrl = wordAudioRef.current.get(word.toLowerCase()) || '';
      if (!audioUrl) {
        setWordSpeaking(word);
        const response = await fetch('/api/practice/reference-audio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: word, rate: 1 }) });
        const data = await response.json() as { audio?: string; mimeType?: string; error?: string };
        if (!response.ok || !data.audio) throw new Error(data.error || '单词发音生成失败。');
        const bytes = Uint8Array.from(atob(data.audio), (char) => char.charCodeAt(0));
        audioUrl = URL.createObjectURL(new Blob([bytes], { type: data.mimeType || 'audio/wav' }));
        wordAudioRef.current.set(word.toLowerCase(), audioUrl);
      }
      const audio = new Audio(audioUrl);
      audio.playbackRate = speechRate;
      audio.preservesPitch = true;
      audio.onplaying = () => setWordSpeaking(word);
      audio.onended = () => setWordSpeaking('');
      audio.onpause = () => setWordSpeaking('');
      wordPlayerRef.current = audio;
      await audio.play();
    } catch (caught) {
      setWordSpeaking('');
      setError(caught instanceof Error ? caught.message : '单词发音播放失败。');
    }
  }

  async function startRecording() {
    if (!prompt || recording) return;
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      chunksRef.current = [];
      processor.onaudioprocess = (event) => chunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      source.connect(processor);
      processor.connect(context.destination);
      streamRef.current = stream; contextRef.current = context; sourceRef.current = source; processorRef.current = processor;
      startedAtRef.current = performance.now();
      setRecording(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Microphone access failed.');
    }
  }

  async function stopAndAssess() {
    if (!recording || !prompt) return;
    setRecording(false);
    const recordedDuration = (performance.now() - startedAtRef.current) / 1000;
    const context = contextRef.current;
    processorRef.current?.disconnect(); sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    const chunks = chunksRef.current;
    const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const samples = new Float32Array(length);
    let offset = 0;
    chunks.forEach((chunk) => { samples.set(chunk, offset); offset += chunk.length; });
    const sampleRate = context?.sampleRate || 48000;
    await context?.close();
    contextRef.current = null;
    if (recordedDuration < 0.7 || samples.length < sampleRate / 2) { setError('录音太短，请完整读完题目。'); return; }
    const threshold = 0.018;
    let first = 0;
    let last = samples.length - 1;
    while (first < samples.length && Math.abs(samples[first]) < threshold) first += 1;
    while (last > first && Math.abs(samples[last]) < threshold) last -= 1;
    if (first >= samples.length) { setError('没有检测到清晰语音，请靠近麦克风再试一次。'); return; }
    const padding = Math.round(sampleRate * 0.12);
    const trimmed = samples.slice(Math.max(0, first - padding), Math.min(samples.length, last + padding));
    const duration = trimmed.length / sampleRate;
    setUserLevels(waveformLevels(trimmed));
    setUserDuration(duration);
    const recordingBlob = wavFromRecording(trimmed, sampleRate);
    await showUserRecording(recordingBlob);
    void saveRecording(prompt.id, recordingBlob).catch(() => setError('录音可以播放，但浏览器缓存保存失败。'));
    setEvaluating(true); setError('');
    try {
      const body = new FormData();
      body.append('audio', recordingBlob, 'pronunciation.wav');
      body.append('target', prompt.text);
      body.append('duration', String(duration));
      const response = await fetch('/api/practice/assess', { method: 'POST', body });
      const data = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(data.error || '评分失败，请再试一次。');
      if (result) setPreviousScore(result.overall);
      setResult(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '评分失败，请再试一次。');
    } finally {
      setEvaluating(false);
    }
  }

  return <main className="practice-page min-h-screen bg-[#10131b] text-slate-100">
    <div className="grid-noise" />
    <div className="relative mx-auto min-h-screen max-w-[1180px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <header className="practice-header"><button className="back-link" onClick={onExit}><ArrowLeft size={16} />自由对话</button><div><p>Pronunciation lab</p><h1>对比评分</h1></div><span className="practice-badge">跟读匹配度</span></header>
      <section className="practice-workspace">
        <div className="practice-main">
          <div className="practice-toolbar">
            <div className="practice-segments" aria-label="Practice type"><button className={type === 'sentence' ? 'active' : ''} onClick={() => setType('sentence')}>英文短句</button><button className={type === 'story' ? 'active' : ''} onClick={() => setType('story')}>小故事</button></div>
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}><option value="beginner">初级</option><option value="intermediate">中级</option><option value="advanced">高级</option></select>
          </div>
          <div className="practice-prompt">
            <span className="practice-kicker">Read aloud</span>
            <div ref={promptViewportRef} className="practice-text-frame scrollbar">{prompt ? <AnnotatedSentence prompt={prompt} activeWord={wordSpeaking} activeReadIndex={referenceWordIndex} onPlayWord={(word) => void playWord(word)} /> : <p className="prompt-plain-text">Loading...</p>}</div>
            <div className={`inline-translation ${prompt?.translation ? 'inline-translation-ready' : ''}`}><span>{type === 'story' ? '故事翻译' : '例句翻译'}</span><p>{prompt?.translation || '首次播放时生成翻译和逐词音标'}</p></div>
            <div className="practice-actions"><button onClick={() => void playReference()} disabled={!prompt || recording || referenceLoading}>{referenceLoading ? <LoaderCircle size={17} className="animate-spin" /> : referenceSpeaking ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />} {referenceLoading ? (prompt?.phonetics?.length ? '正在准备音频' : '正在生成翻译和音标') : referenceSpeaking ? '暂停' : type === 'story' ? '播放故事' : '播放短句'}</button><button onClick={() => void loadPrompt()} disabled={recording || evaluating || generating || viewingMastered}><RotateCcw size={16} />换一道</button><button onClick={() => void generatePrompt()} disabled={recording || evaluating || generating || libraryTotal < (type === 'story' ? 1 : 5) || viewingMastered} title={libraryTotal < (type === 'story' ? 1 : 5) ? '后台正在补充当前分类的内容' : type === 'story' ? '从本地故事库取出最新一篇' : '从本地例句库取出最新 5 条'}>{generating ? <LoaderCircle size={16} className="animate-spin" /> : <span className="add-symbol">+</span>}{generating ? '正在定位最新内容' : type === 'story' ? '故事新增 1 篇' : '例句新增 5 条'}</button><button onClick={() => void toggleMastered()} disabled={!prompt || recording || evaluating}><Check size={16} />{viewingMastered ? '移回学习' : '已学会'}</button><button onClick={() => viewingMastered ? void showLibraryPage(Math.max(1, libraryPage)) : void showMasteredPage(1)} disabled={!viewingMastered && !masteredTotal}><Library size={16} />{viewingMastered ? '返回例句库' : `已掌握库 ${masteredTotal}`}</button></div>
            <div className="practice-pagination"><span>{viewingMastered ? '已掌握例句' : '新增例句'}</span><button disabled={viewingMastered ? masteredPage <= 1 : libraryPage <= 1} onClick={() => viewingMastered ? void showMasteredPage(masteredPage - 1) : void showLibraryPage(libraryPage - 1)} title="上一条" aria-label="上一条例句"><ChevronLeft size={16} /></button><output>{viewingMastered ? (masteredTotal ? `${masteredPage} / ${masteredTotal}` : '0 / 0') : (libraryTotal ? `${libraryPage} / ${libraryTotal}` : '0 / 0')}</output><button disabled={viewingMastered ? masteredPage >= masteredTotal : libraryPage >= libraryTotal} onClick={() => viewingMastered ? void showMasteredPage(masteredPage + 1) : void showLibraryPage(libraryPage + 1)} title="下一条" aria-label="下一条例句"><ChevronRight size={16} /></button></div>
            <label className="practice-rate-control"><span>播放语速</span><input type="range" min="0.75" max="1.5" step="0.05" value={speechRate} onChange={(event) => onSpeechRateChange(Number(event.target.value))} aria-label="实时调整标准发音语速" /><output>{speechRate.toFixed(2)}x</output></label>
          </div>
          {result ? <div className="word-comparison" aria-label="Word comparison">{result.aligned.map((item, index) => <span key={`${item.word}-${index}`} className={`word-${item.status}`} title={item.heard && item.heard !== item.word ? `识别为 ${item.heard}` : undefined}>{item.word}</span>)}</div> : <div className="practice-empty"><Headphones size={22} /><span>先听标准发音，再完整跟读一次</span></div>}
          {prompt && (() => { const targetDuration = referenceDuration; const scale = Math.max(targetDuration || userDuration || 1, userDuration || targetDuration || 1) * 1.08; const difference = userDuration && targetDuration ? Math.round((userDuration / targetDuration - 1) * 100) : 0; return <div className="track-comparison"><WaveTrack label="标准音轨" levels={referenceLevels} duration={targetDuration} maxDuration={scale} active={referenceSpeaking || referenceLoading} /><WaveTrack label="我的跟读" levels={userLevels} duration={userDuration} maxDuration={scale} active={recording} /><div className="track-playback"><button disabled={!userAudioUrl || recording} onClick={() => { if (userAudioUrl) void new Audio(userAudioUrl).play(); }}><Play size={14} fill="currentColor" />播放我的录音</button><span>浏览器最多保存 20 条，每道题保留最新录音</span></div>{userDuration > 0 && targetDuration > 0 && <p className={Math.abs(difference) <= 10 ? 'tempo-good' : ''}>{difference > 10 ? `比标准慢 ${difference}%` : difference < -10 ? `比标准快 ${Math.abs(difference)}%` : '语速接近标准节奏'}</p>}</div>; })()}
          <div className="record-zone">
            <button className={`record-button ${recording ? 'recording' : ''}`} disabled={evaluating || !prompt} onClick={() => recording ? void stopAndAssess() : void startRecording()}>{evaluating ? <LoaderCircle size={24} className="animate-spin" /> : recording ? <Square size={21} fill="currentColor" /> : <Mic size={25} />}</button>
            <div><strong>{evaluating ? '正在分析发音...' : recording ? '正在录音，读完后点击停止' : result ? '再读一次，看看能否提高' : '点击麦克风开始跟读'}</strong><span>{recording ? '保持自然语速并完整读完' : `标准发音播放速度 ${speechRate.toFixed(2)}x`}</span></div>
          </div>
          {error && <div className="practice-error">{error}</div>}
        </div>
        <aside className="score-panel">
          <div className="score-total"><span>总分</span><strong>{result?.overall ?? '--'}</strong><small>{previousScore !== null && result ? `${previousScore} → ${result.overall}` : '100'}</small></div>
          <div className="score-list">{[['准确度', result?.accuracy], ['流利度', result?.fluency], ['完整度', result?.completeness], ['节奏', result?.rhythm]].map(([label, value]) => <div key={String(label)}><span>{label}</span><div><i style={{ width: `${value ?? 0}%` }} /></div><b>{value ?? '--'}</b></div>)}</div>
          <div className="practice-feedback"><span>练习建议</span><p>{result?.feedback || '完成一次跟读后，这里会显示需要重点练习的单词和建议。'}</p>{result && <small>识别结果：{result.transcript}</small>}</div>
          <p className="assessment-note">当前为转写匹配评分，可评估漏词、错词和语速；音素级发音将在接入专业评测服务后提供。</p>
        </aside>
      </section>
    </div>
  </main>;
}
