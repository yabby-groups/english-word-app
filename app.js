const storeKey = "word-garden-state-v2";
const fallbackState = {
  selectedTopic: "all",
  learnerProfile: "starter",
  repeatCount: 2,
  switchSeconds: 8,
  autoPlay: false,
  currentIndex: 0,
  mode: "recommend",
  voiceName: "__local__",
  userWords: {},
  topicInterest: {},
  addedWordIds: [],
  masteredWordIds: [],
  customWords: [],
  readerSelectedWords: [],
  aiExamples: {},
  examplePageByWord: {},
  savedAiExamples: [],
  savedStories: [],
  savedAiCardSheets: [],
  aiCardSheetPage: 0,
  randomDifficulty: 24,
  events: [],
  calendarMonth: ""
};

let topics = [];
let baseWords = [];
let wordPool = [];
let words = [];
let state = loadState();
let deck = [];
let voices = [];
let autoTimer = null;
let activeUtterance = null;
let activeAudio = null;
let readerUtterance = null;
let generatedReaderAudioUrl = "";
let ttsCountdownTimer = null;
let activeStoryId = "";
let currentSpeechTranslation = "";
let speechRecorder = null;
let speechStream = null;
let speechAudioContext = null;
let speechMonitorFrame = 0;
let speechRecordingStartedAt = 0;
let speechDetectedAt = 0;
let speechLastActiveAt = 0;
let speechChunks = [];

const $ = (selector) => document.querySelector(selector);
const hardWordHints = new Set([
  "ambiguous", "coherent", "elaborate", "interpretation", "substantial", "inevitable",
  "contradict", "comprehensive", "phenomenon", "sophisticated", "paradigm", "nuance",
  "pragmatic", "meticulous", "resilience", "implication", "scrutiny", "subtle",
  "articulate", "perspective", "implementation", "scalability", "compliance",
  "procurement", "feasibility", "stakeholder", "negotiate", "prioritize"
]);
const quickTranslations = {
  ambiguous: "模棱两可",
  coherent: "连贯",
  elaborate: "详细说明",
  interpretation: "解释",
  substantial: "大量/重要",
  inevitable: "不可避免",
  contradict: "反驳",
  comprehensive: "全面",
  phenomenon: "现象",
  sophisticated: "复杂精细",
  paradigm: "范式",
  nuance: "细微差别",
  pragmatic: "务实",
  meticulous: "一丝不苟",
  resilience: "韧性",
  implication: "含义/影响",
  scrutiny: "仔细审查",
  subtle: "微妙",
  articulate: "清楚表达",
  perspective: "视角",
  implementation: "实施",
  scalability: "可扩展性",
  compliance: "合规",
  procurement: "采购",
  feasibility: "可行性",
  stakeholder: "利益相关者",
  negotiate: "谈判",
  prioritize: "优先处理"
};
const learnerProfiles = {
  kids: { label: "儿童启蒙", min: 10, max: 24, center: 16, topics: ["kids", "daily"] },
  starter: { label: "日常入门", min: 16, max: 36, center: 26, topics: ["daily", "food", "school"] },
  travel: { label: "旅行实用", min: 22, max: 48, center: 34, topics: ["travel", "food", "daily"] },
  business: { label: "职场办公", min: 34, max: 66, center: 50, topics: ["business"] },
  exam: { label: "考试进阶", min: 48, max: 78, center: 62, topics: ["school", "business", "daily"] },
  advanced: { label: "高阶阅读", min: 62, max: 85, center: 74, topics: ["business", "school", "daily"] }
};

const cloudVoicePresets = [
  { value: "huabot:brian-teacher", label: "Huabot Brian Teacher", provider: "huabot", lang: "en-US", voice: "Brian", speed: 0.88, instructions: "" },
  { value: "huabot:emma-teacher", label: "Huabot Emma Teacher", provider: "huabot", lang: "en-US", voice: "Emma", speed: 0.88, instructions: "" },
  { value: "huabot:brian-business", label: "Huabot Brian Business", provider: "huabot", lang: "en-US", voice: "Brian", speed: 0.96, instructions: "" },
  { value: "huabot:emma-gentle", label: "Huabot Emma Gentle", provider: "huabot", lang: "en-US", voice: "Emma", speed: 0.82, instructions: "" },
  { value: "huabot:amy-clear", label: "Huabot Amy Clear", provider: "huabot", lang: "en-US", voice: "Amy", speed: 0.86, instructions: "" },
  { value: "openrouter:us-girl", label: "US Girl", provider: "openrouter", lang: "en-US", voice: "coral", speed: 0.86, instructions: "Speak in clear standard American English as a friendly girl. Keep pronunciation precise for English learners." },
  { value: "openrouter:us-boy", label: "US Boy", provider: "openrouter", lang: "en-US", voice: "echo", speed: 0.86, instructions: "Speak in clear standard American English as a friendly boy. Keep pronunciation precise for English learners." },
  { value: "openrouter:us-young-female", label: "US Young Female", provider: "openrouter", lang: "en-US", voice: "nova", speed: 0.9, instructions: "Speak in standard American English as a young adult woman. Use natural but careful classroom pronunciation." },
  { value: "openrouter:us-young-male", label: "US Young Male", provider: "openrouter", lang: "en-US", voice: "ash", speed: 0.9, instructions: "Speak in standard American English as a young adult man. Use natural but careful classroom pronunciation." },
  { value: "openrouter:us-adult-female", label: "US Adult Female", provider: "openrouter", lang: "en-US", voice: "shimmer", speed: 0.9, instructions: "Speak in standard American English as an adult female teacher. Pronounce each word clearly." },
  { value: "openrouter:us-adult-male", label: "US Adult Male", provider: "openrouter", lang: "en-US", voice: "onyx", speed: 0.9, instructions: "Speak in standard American English as an adult male teacher. Pronounce each word clearly." },
  { value: "openrouter:us-older-female", label: "US Older Female", provider: "openrouter", lang: "en-US", voice: "sage", speed: 0.84, instructions: "Speak in standard American English as an older adult woman. Use warm, steady, clear pronunciation." },
  { value: "openrouter:us-older-male", label: "US Older Male", provider: "openrouter", lang: "en-US", voice: "verse", speed: 0.84, instructions: "Speak in standard American English as an older adult man. Use warm, steady, clear pronunciation." },
  { value: "openrouter:uk-female", label: "UK Female", provider: "openrouter", lang: "en-GB", voice: "ballad", speed: 0.88, instructions: "Speak in clear standard British English as a female teacher. Keep pronunciation precise for English learners." },
  { value: "openrouter:uk-male", label: "UK Male", provider: "openrouter", lang: "en-GB", voice: "fable", speed: 0.88, instructions: "Speak in clear standard British English as a male teacher. Keep pronunciation precise for English learners." },
  { value: "openrouter:uk-senior", label: "UK Senior", provider: "openrouter", lang: "en-GB", voice: "cedar", speed: 0.82, instructions: "Speak in clear standard British English as a senior teacher. Use calm, slow, precise pronunciation." }
];

const elements = {
  topicList: $("#topicList"),
  todayCount: $("#todayCount"),
  progressFill: $("#progressFill"),
  progressText: $("#progressText"),
  voiceSelect: $("#voiceSelect"),
  cloudVoiceButtons: $("#cloudVoiceButtons"),
  voiceStatus: $("#voiceStatus"),
  addResult: $("#addResult"),
  repeatInput: $("#repeatInput"),
  secondsInput: $("#secondsInput"),
  autoPlayToggle: $("#autoPlayToggle"),
  profileSelect: $("#profileSelect"),
  difficultySlider: $("#difficultySlider"),
  difficultyLabel: $("#difficultyLabel"),
  modeLabel: $("#modeLabel"),
  deckTitle: $("#deckTitle"),
  wordText: $("#wordText"),
  phoneticText: $("#phoneticText"),
  meaningText: $("#meaningText"),
  sentenceText: $("#sentenceText"),
  translationText: $("#translationText"),
  examplesList: $("#examplesList"),
  examplePager: $("#examplePager"),
  prevExamplePageBtn: $("#prevExamplePageBtn"),
  nextExamplePageBtn: $("#nextExamplePageBtn"),
  examplePageLabel: $("#examplePageLabel"),
  levelBadge: $("#levelBadge"),
  topicBadge: $("#topicBadge"),
  rankBadge: $("#rankBadge"),
  mascotFace: $("#mascotFace"),
  interestStat: $("#interestStat"),
  masteryStat: $("#masteryStat"),
  nextStat: $("#nextStat"),
  masteredPanel: $("#masteredPanel"),
  masteredCount: $("#masteredCount"),
  masteredList: $("#masteredList"),
  calendarTitle: $("#calendarTitle"),
  calendarGrid: $("#calendarGrid"),
  calendarDetail: $("#calendarDetail"),
  readerInput: $("#readerInput"),
  readerOutput: $("#readerOutput"),
  readerStatus: $("#readerStatus"),
  readerAudioActions: $("#readerAudioActions"),
  playGeneratedBtn: $("#playGeneratedBtn"),
  downloadGeneratedLink: $("#downloadGeneratedLink"),
  articleTranslation: $("#articleTranslation"),
  chineseSpeechInput: $("#chineseSpeechInput"),
  speechTranslationOutput: $("#speechTranslationOutput"),
  speechTranslationStatus: $("#speechTranslationStatus"),
  startSpeechBtn: $("#startSpeechBtn"),
  translateSpeechBtn: $("#translateSpeechBtn"),
  playTranslationBtn: $("#playTranslationBtn"),
  storyAgeInput: $("#storyAgeInput"),
  storyLevelSelect: $("#storyLevelSelect"),
  storyThemeInput: $("#storyThemeInput"),
  storyOutput: $("#storyOutput"),
  storyHistory: $("#storyHistory"),
  storyStatus: $("#storyStatus"),
  playStoryBtn: $("#playStoryBtn"),
  exportDataBtn: $("#exportDataBtn"),
  importDataBtn: $("#importDataBtn"),
  importDataInput: $("#importDataInput"),
  cardSheetModal: $("#cardSheetModal"),
  cardSeedInput: $("#cardSeedInput"),
  cardRelationSelect: $("#cardRelationSelect"),
  cardCountInput: $("#cardCountInput"),
  customCardWordsInput: $("#customCardWordsInput"),
  cardSheetStatus: $("#cardSheetStatus"),
  cardSheetHistory: $("#cardSheetHistory"),
  prevAiCardSheetBtn: $("#prevAiCardSheetBtn"),
  nextAiCardSheetBtn: $("#nextAiCardSheetBtn"),
  aiCardSheetPageLabel: $("#aiCardSheetPageLabel"),
  cardSheetPreview: $("#cardSheetPreview")
};

function loadState() {
  try {
    const loaded = { ...fallbackState, ...JSON.parse(localStorage.getItem(storeKey)) };
    loaded.addedWordIds = loaded.addedWordIds || [];
    loaded.masteredWordIds = loaded.masteredWordIds || [];
    loaded.customWords = loaded.customWords || [];
    loaded.readerSelectedWords = loaded.readerSelectedWords || [];
    loaded.aiExamples = loaded.aiExamples || {};
    loaded.examplePageByWord = loaded.examplePageByWord || {};
    loaded.savedAiExamples = loaded.savedAiExamples || [];
    loaded.savedStories = loaded.savedStories || [];
    loaded.savedAiCardSheets = loaded.savedAiCardSheets || [];
    loaded.aiCardSheetPage = Number.isFinite(Number(loaded.aiCardSheetPage)) ? Number(loaded.aiCardSheetPage) : 0;
    loaded.events = loaded.events || [];
    loaded.topicInterest = loaded.topicInterest || {};
    loaded.userWords = loaded.userWords || {};
    loaded.learnerProfile = loaded.learnerProfile || fallbackState.learnerProfile;
    loaded.randomDifficulty = loaded.randomDifficulty || fallbackState.randomDifficulty;
    return loaded;
  } catch {
    return { ...fallbackState };
  }
}

function saveState() {
  localStorage.setItem(storeKey, JSON.stringify(state));
}

function stateBackupSummary(data = state) {
  return {
    customWords: data.customWords?.length || 0,
    aiExampleWords: Object.keys(data.aiExamples || {}).length,
    savedAiExamples: data.savedAiExamples?.length || 0,
    savedStories: data.savedStories?.length || 0,
    savedAiCardSheets: data.savedAiCardSheets?.length || 0,
    events: data.events?.length || 0
  };
}

function exportLearningData() {
  const backup = {
    app: "word-garden",
    version: 1,
    storeKey,
    exportedAt: new Date().toISOString(),
    summary: stateBackupSummary(),
    state
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  anchor.href = url;
  anchor.download = `word-garden-backup-${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  const summary = stateBackupSummary();
  elements.voiceStatus.textContent = `已导出备份：自定义词 ${summary.customWords}，AI例句 ${summary.savedAiExamples}，故事 ${summary.savedStories}，小纸片 ${summary.savedAiCardSheets}。`;
}

function normalizeImportedState(value) {
  const imported = value?.state && value?.storeKey === storeKey ? value.state : value;
  if (!imported || typeof imported !== "object") throw new Error("备份文件不是有效的学习数据。");
  const hasKnownField = ["customWords", "aiExamples", "savedAiExamples", "savedStories", "savedAiCardSheets", "events"]
    .some((key) => Object.prototype.hasOwnProperty.call(imported, key));
  if (!hasKnownField) throw new Error("备份文件里没有可恢复的学习记录。");
  return {
    ...fallbackState,
    ...state,
    ...imported,
    customWords: Array.isArray(imported.customWords) ? imported.customWords : state.customWords || [],
    readerSelectedWords: Array.isArray(imported.readerSelectedWords) ? imported.readerSelectedWords : state.readerSelectedWords || [],
    aiExamples: imported.aiExamples && typeof imported.aiExamples === "object" ? imported.aiExamples : state.aiExamples || {},
    savedAiExamples: Array.isArray(imported.savedAiExamples) ? imported.savedAiExamples : state.savedAiExamples || [],
    savedStories: Array.isArray(imported.savedStories) ? imported.savedStories : state.savedStories || [],
    savedAiCardSheets: Array.isArray(imported.savedAiCardSheets) ? imported.savedAiCardSheets : state.savedAiCardSheets || [],
    events: Array.isArray(imported.events) ? imported.events : state.events || [],
    userWords: imported.userWords && typeof imported.userWords === "object" ? imported.userWords : state.userWords || {},
    topicInterest: imported.topicInterest && typeof imported.topicInterest === "object" ? imported.topicInterest : state.topicInterest || {},
    addedWordIds: Array.isArray(imported.addedWordIds) ? imported.addedWordIds : state.addedWordIds || [],
    masteredWordIds: Array.isArray(imported.masteredWordIds) ? imported.masteredWordIds : state.masteredWordIds || []
  };
}

async function importLearningData(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const importedJson = JSON.parse(text);
    const importedState = normalizeImportedState(importedJson);
    state = importedState;
    saveState();
    rebuildWords();
    clampProfileDifficulty();
    buildDeck(state.mode || "recommend");
    render();
    renderStoryHistory();
    if (state.savedStories?.length) renderStory(state.savedStories[0]);
    const summary = stateBackupSummary();
    elements.voiceStatus.textContent = `已恢复备份：自定义词 ${summary.customWords}，AI例句 ${summary.savedAiExamples}，故事 ${summary.savedStories}，小纸片 ${summary.savedAiCardSheets}。`;
  } catch (error) {
    elements.voiceStatus.textContent = `恢复失败：${error.message}`;
  } finally {
    elements.importDataInput.value = "";
  }
}

async function loadWordBank() {
  const response = await fetch("./word-bank.json", { cache: "no-store" });
  const bank = await response.json();
  topics = bank.topics;
  baseWords = bank.baseWords.map(normalizeWord);
  wordPool = bank.wordPool.map((word, index) => normalizeWord({
    ...word,
    phonetic: `/${word.word}/`,
    sentence: `I want to learn the word ${word.word} today.`,
    translation: `我今天想学习“${word.meaning}”这个词。`,
    rank: 3000 + index,
    difficulty: levelDifficulty(word.level)
  }));
  rebuildWords();
}

function levelDifficulty(level) {
  if (level === "C1") return 78;
  if (level === "B2") return 66;
  if (level === "B1") return 50;
  if (level === "A2") return 34;
  return 20;
}

function normalizeWord(word) {
  const normalized = {
    difficulty: 24,
    rank: 4000,
    level: "A1",
    phonetic: `/${word.word}/`,
    ...word
  };
  normalized.examples = normalizeExamples(normalized);
  normalized.sentence = normalized.examples[0].sentence;
  normalized.translation = normalized.examples[0].translation;
  return normalized;
}

function normalizeExamples(word) {
  if (Array.isArray(word.examples) && word.examples.length >= 3) {
    return word.examples.slice(0, 3);
  }
  const first = {
    sentence: word.sentence || `I use ${word.word} in daily life.`,
    translation: word.translation || `${word.meaning}是一个实用词。`
  };
  const templates = exampleTemplates(word);
  return [first, ...templates].slice(0, 3);
}

function exampleTemplates(word) {
  const topic = word.topics?.[0] || "daily";
  const target = word.word;
  const meaning = word.meaning;
  if (topic === "business") {
    return [
      { sentence: `Please add ${target} to the meeting notes.`, translation: `请把“${meaning}”加入会议记录。` },
      { sentence: `Our team discussed ${target} before the deadline.`, translation: `我们的团队在截止日期前讨论了“${meaning}”。` }
    ];
  }
  if (topic === "travel") {
    return [
      { sentence: `I asked about ${target} at the hotel front desk.`, translation: `我在酒店前台询问了“${meaning}”。` },
      { sentence: `The travel app helped me find ${target} quickly.`, translation: `旅行应用帮我很快找到和“${meaning}”有关的信息。` }
    ];
  }
  if (topic === "food") {
    return [
      { sentence: `I ordered ${target} for lunch today.`, translation: `我今天午餐点了“${meaning}”。` },
      { sentence: `This restaurant serves fresh ${target}.`, translation: `这家餐厅供应新鲜的“${meaning}”。` }
    ];
  }
  if (topic === "school") {
    return [
      { sentence: `The teacher wrote ${target} on the board.`, translation: `老师把“${meaning}”写在黑板上。` },
      { sentence: `I reviewed ${target} before class.`, translation: `我上课前复习了“${meaning}”。` }
    ];
  }
  if (topic === "kids") {
    return [
      { sentence: `The child pointed to ${target} in the picture book.`, translation: `孩子在图画书里指着“${meaning}”。` },
      { sentence: `We played a simple game with ${target}.`, translation: `我们用“${meaning}”玩了一个简单游戏。` }
    ];
  }
  return [
    { sentence: `I saw ${target} on my way home.`, translation: `我回家路上看到了“${meaning}”。` },
    { sentence: `Can you use ${target} in a real sentence?`, translation: `你能用“${meaning}”造一个真实句子吗？` }
  ];
}

function rebuildWords() {
  const added = wordPool.filter((word) => state.addedWordIds.includes(word.id));
  const custom = state.customWords.map((word) => normalizeWord(word));
  words = [...baseWords, ...added, ...custom];
}

function activeWords() {
  return words.filter((word) => !state.masteredWordIds.includes(word.id));
}

function allKnownWords() {
  const map = new Map();
  [...baseWords, ...wordPool, ...state.customWords.map((word) => normalizeWord(word))].forEach((word) => map.set(word.id, word));
  words.forEach((word) => map.set(word.id, word));
  return map;
}

function difficultyText(value = state.randomDifficulty) {
  if (value < 24) return "A1 简单";
  if (value < 40) return "A2 常用";
  if (value < 52) return "B1 进阶";
  if (value < 68) return "B2 挑战";
  return "C1 高阶";
}

function currentProfile() {
  return learnerProfiles[state.learnerProfile] || learnerProfiles.starter;
}

function clampProfileDifficulty() {
  const profile = currentProfile();
  state.randomDifficulty = Math.max(profile.min, Math.min(profile.max, Number(state.randomDifficulty) || profile.center));
}

function applyProfile(profileId) {
  state.learnerProfile = profileId;
  const profile = currentProfile();
  state.randomDifficulty = profile.center;
  elements.difficultySlider.min = profile.min;
  elements.difficultySlider.max = profile.max;
  elements.difficultySlider.value = state.randomDifficulty;
  elements.difficultyLabel.textContent = `${profile.label} · ${difficultyText()}`;
  saveState();
}

function wordState(wordId) {
  if (!state.userWords[wordId]) {
    state.userWords[wordId] = {
      seen: 0,
      correct: 0,
      wrong: 0,
      favorite: 0,
      skipped: 0,
      familiarity: 0,
      interest: 0,
      lastSeenAt: 0,
      nextReviewAt: 0
    };
  }
  return state.userWords[wordId];
}

function dateKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function scoreWord(word) {
  const user = wordState(word.id);
  const topicMatch = state.selectedTopic === "all" || word.topics.includes(state.selectedTopic) ? 35 : 0;
  const due = user.nextReviewAt && user.nextReviewAt <= Date.now() ? 30 : 0;
  const interest = word.topics.reduce((sum, topic) => sum + (state.topicInterest[topic] || 0), 0);
  const frequency = Math.max(0, 24 - Math.log10(word.rank + 10) * 7);
  const difficultyFit = Math.max(0, 22 - Math.abs(word.difficulty - 32) * 0.35);
  const novelty = user.seen === 0 ? 14 : 0;
  const masteredPenalty = user.familiarity > 80 ? 35 : 0;
  const recentPenalty = Date.now() - user.lastSeenAt < 1000 * 60 * 5 ? 18 : 0;
  return topicMatch + due + interest * 1.6 + frequency + difficultyFit + novelty - masteredPenalty - recentPenalty;
}

function buildDeck(mode = state.mode) {
  state.mode = mode;
  const available = activeWords();
  const scoped = state.selectedTopic === "all" ? available : available.filter((word) => word.topics.includes(state.selectedTopic));
  if (mode === "review") {
    deck = scoped
      .filter((word) => {
        const user = wordState(word.id);
        return user.wrong > 0 || user.nextReviewAt <= Date.now();
      })
      .sort((a, b) => scoreWord(b) - scoreWord(a));
  } else {
    deck = [...scoped].sort((a, b) => scoreWord(b) - scoreWord(a));
  }
  if (!deck.length) deck = [...scoped].sort((a, b) => a.rank - b.rank);
  state.currentIndex = Math.min(state.currentIndex, Math.max(deck.length - 1, 0));
  saveState();
  render();
}

function currentWord() {
  return deck[state.currentIndex] || activeWords()[0] || null;
}

function currentWordExamples(word) {
  return currentWordExamplePage(word).examples;
}

function normalizeGeneratedExamples(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      sentence: String(item.sentence || "").trim(),
      translation: String(item.translation || "").trim(),
      scene: String(item.scene || item.context || "").trim()
    }))
    .filter((item) => item.sentence && item.translation)
    .slice(0, 3);
}

function examplePageSignature(page) {
  return normalizeGeneratedExamples(page)
    .map((item) => `${item.sentence}\n${item.translation}`)
    .join("\n---\n");
}

function generatedExamplePages(word) {
  const record = state.aiExamples[word.id];
  const pages = [];
  const seen = new Set();
  const addPage = (page) => {
    const normalized = normalizeGeneratedExamples(page);
    const signature = examplePageSignature(normalized);
    if (!normalized.length || seen.has(signature)) return;
    seen.add(signature);
    pages.push(normalized);
  };
  if (Array.isArray(record?.pages)) {
    record.pages.forEach(addPage);
  }
  addPage(record?.examples);
  (state.savedAiExamples || [])
    .filter((item) => item.wordId === word.id)
    .forEach((item) => addPage(item.examples));
  return pages;
}

function allWordExamplePages(word) {
  const basePage = normalizeGeneratedExamples(word.examples || []);
  const fallbackPage = normalizeGeneratedExamples([{ sentence: word.sentence, translation: word.translation }]);
  return [
    basePage.length ? basePage : fallbackPage,
    ...generatedExamplePages(word)
  ].filter((page) => page.length);
}

function currentExamplePageIndex(word, pages = allWordExamplePages(word)) {
  const raw = Number(state.examplePageByWord[word.id] || 0);
  return Math.max(0, Math.min(pages.length - 1, Number.isFinite(raw) ? raw : 0));
}

function currentWordExamplePage(word) {
  const pages = allWordExamplePages(word);
  const index = currentExamplePageIndex(word, pages);
  return {
    examples: pages[index] || [],
    index,
    count: pages.length
  };
}

function setExamplePage(word, index) {
  if (!word) return;
  const pages = allWordExamplePages(word);
  state.examplePageByWord[word.id] = Math.max(0, Math.min(pages.length - 1, index));
  saveState();
  render();
}

function shiftExamplePage(amount) {
  const word = currentWord();
  if (!word) return;
  const pages = allWordExamplePages(word);
  if (pages.length <= 1) return;
  const index = currentExamplePageIndex(word, pages);
  setExamplePage(word, (index + amount + pages.length) % pages.length);
}

function currentWordAllExamples(word) {
  return allWordExamplePages(word).flat();
}

function renderTopics() {
  elements.topicList.innerHTML = "";
  topics.forEach((topic) => {
    const available = activeWords();
    const count = topic.id === "all" ? available.length : available.filter((word) => word.topics.includes(topic.id)).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `topic-button${state.selectedTopic === topic.id ? " active" : ""}`;
    button.innerHTML = `<strong>${topic.name}</strong><span>${topic.zh} · ${count}</span>`;
    button.addEventListener("click", () => {
      state.selectedTopic = topic.id;
      state.currentIndex = 0;
      saveState();
      renderTopics();
      buildDeck();
    });
    elements.topicList.appendChild(button);
  });
}

function render() {
  const word = currentWord();
  if (!word) {
    elements.todayCount.textContent = "0";
    elements.progressFill.style.width = "0%";
    elements.progressText.textContent = "没有待学习单词";
    elements.wordText.textContent = "done";
    elements.phoneticText.textContent = "";
    elements.meaningText.textContent = "当前单词都已完全学会";
    elements.sentenceText.textContent = "Add random words to continue.";
    elements.examplesList.innerHTML = "";
    elements.examplePager.hidden = true;
    elements.translationText.textContent = "点击“随机增加 12 个”继续学习。";
    elements.profileSelect.value = state.learnerProfile;
    elements.difficultySlider.min = currentProfile().min;
    elements.difficultySlider.max = currentProfile().max;
    elements.difficultySlider.value = state.randomDifficulty;
    elements.difficultyLabel.textContent = `${currentProfile().label} · ${difficultyText()}`;
    renderMasteredLibrary();
    renderCalendar();
    return;
  }
  const user = wordState(word.id);
  const topic = topics.find((item) => item.id === state.selectedTopic) || topics[0];
  elements.todayCount.textContent = deck.length;
  elements.progressFill.style.width = `${((state.currentIndex + 1) / Math.max(deck.length, 1)) * 100}%`;
  elements.progressText.textContent = `${state.currentIndex + 1} / ${Math.max(deck.length, 1)} · 已看 ${user.seen} 次`;
  elements.modeLabel.textContent = state.mode === "review" ? "复习优先" : topic.zh;
  elements.deckTitle.textContent = state.mode === "review" ? "需要复习的单词" : "今日学习";
  elements.wordText.textContent = word.word;
  elements.phoneticText.textContent = word.phonetic;
  elements.meaningText.textContent = word.meaning;
  const examplePage = currentWordExamplePage(word);
  const examples = examplePage.examples;
  const primaryExample = examples[0] || { sentence: word.sentence, translation: word.translation };
  elements.sentenceText.textContent = primaryExample.sentence;
  elements.translationText.textContent = primaryExample.translation;
  elements.examplesList.innerHTML = examples.slice(1).map((example) => `
    <div class="example-item">
      <p>${escapeHtml(example.sentence)}</p>
      <span>${escapeHtml(example.translation)}</span>
      ${example.scene ? `<span>${escapeHtml(example.scene)}</span>` : ""}
    </div>
  `).join("");
  elements.examplePager.hidden = examplePage.count <= 1;
  elements.examplePageLabel.textContent = `Examples ${examplePage.index + 1} / ${examplePage.count}`;
  elements.prevExamplePageBtn.disabled = examplePage.count <= 1;
  elements.nextExamplePageBtn.disabled = examplePage.count <= 1;
  elements.levelBadge.textContent = word.level;
  elements.topicBadge.textContent = word.topics.map((id) => topics.find((topicItem) => topicItem.id === id)?.name).filter(Boolean).join(" · ");
  elements.rankBadge.textContent = `#${word.rank}`;
  const topInterest = Object.entries(state.topicInterest).sort((a, b) => b[1] - a[1])[0];
  elements.interestStat.textContent = topInterest ? topics.find((item) => item.id === topInterest[0])?.name || topInterest[0] : "Daily";
  elements.masteryStat.textContent = `${Math.round(averageMastery())}%`;
  elements.nextStat.textContent = deck[state.currentIndex + 1]?.word || deck[0]?.word || "new";
  elements.repeatInput.value = state.repeatCount;
  elements.secondsInput.value = state.switchSeconds;
  elements.autoPlayToggle.checked = state.autoPlay;
  elements.profileSelect.value = state.learnerProfile;
  elements.difficultySlider.min = currentProfile().min;
  elements.difficultySlider.max = currentProfile().max;
  elements.difficultySlider.value = state.randomDifficulty;
  elements.difficultyLabel.textContent = `${currentProfile().label} · ${difficultyText()}`;
  renderMasteredLibrary();
  renderCalendar();
}

function averageMastery() {
  const available = activeWords();
  if (!available.length) return 100;
  return available.map((word) => wordState(word.id).familiarity).reduce((sum, item) => sum + item, 0) / available.length;
}

function updateTopicInterest(word, amount) {
  word.topics.forEach((topic) => {
    state.topicInterest[topic] = Math.max(0, Math.min(20, (state.topicInterest[topic] || 0) + amount));
  });
}

function addEvent(type, word) {
  state.events.push({
    type,
    wordId: word.id,
    word: word.word,
    meaning: word.meaning,
    date: dateKey(),
    ts: Date.now()
  });
  state.events = state.events.slice(-800);
}

function track(eventType) {
  const word = currentWord();
  const user = wordState(word.id);
  user.seen += eventType === "view" ? 1 : 0;
  user.lastSeenAt = Date.now();
  if (eventType === "view") addEvent("learn", word);
  if (eventType === "known") {
    user.correct += 1;
    user.familiarity = Math.min(100, user.familiarity + 22);
    user.nextReviewAt = Date.now() + 1000 * 60 * 60 * 24 * 3;
    addEvent("mastered", word);
    updateTopicInterest(word, 1);
  }
  if (eventType === "complete") {
    user.correct += 1;
    user.familiarity = 100;
    user.nextReviewAt = 0;
    if (!state.masteredWordIds.includes(word.id)) state.masteredWordIds.push(word.id);
    addEvent("complete", word);
    updateTopicInterest(word, 1);
  }
  if (eventType === "repeat") {
    user.wrong += 1;
    user.familiarity = Math.max(0, user.familiarity - 8);
    user.interest = Math.min(100, user.interest + 10);
    user.nextReviewAt = Date.now() + 1000 * 60 * 20;
    addEvent("review", word);
    updateTopicInterest(word, 2);
  }
  if (eventType === "favorite") {
    user.favorite += 1;
    user.interest = Math.min(100, user.interest + 25);
    addEvent("favorite", word);
    updateTopicInterest(word, 4);
  }
  if (eventType === "skip") {
    user.skipped += 1;
    user.interest = Math.max(0, user.interest - 8);
    addEvent("skip", word);
    updateTopicInterest(word, -1);
  }
  saveState();
  render();
}

function markComplete() {
  const word = currentWord();
  track("complete");
  buildDeck(state.mode);
  if (deck.length) {
    state.currentIndex = Math.min(state.currentIndex, deck.length - 1);
    render();
  } else {
    elements.voiceStatus.textContent = "当前学习列表已经没有未完成单词，可随机增加新词。";
  }
}

function nextWord() {
  if (!deck.length) return;
  state.currentIndex = (state.currentIndex + 1) % deck.length;
  track("view");
  saveState();
  render();
}

function prevWord() {
  if (!deck.length) return;
  state.currentIndex = (state.currentIndex - 1 + deck.length) % deck.length;
  track("view");
  saveState();
  render();
}

function selectedCloudPreset() {
  return cloudVoicePresets.find((preset) => preset.value === state.voiceName) || null;
}

function selectedVoice() {
  if (state.voiceName === "__local__" || selectedCloudPreset()) return null;
  return voices.find((voice) => voice.name === state.voiceName) || voices[0] || null;
}

function renderCloudVoiceButtons() {
  if (!elements.cloudVoiceButtons) return;
  elements.cloudVoiceButtons.innerHTML = "";
  cloudVoicePresets.forEach((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `voice-preset${state.voiceName === preset.value ? " active" : ""}`;
    button.dataset.voicePreset = preset.value;
    button.textContent = preset.label;
    elements.cloudVoiceButtons.appendChild(button);
  });
}

async function speakWithCloudTts(text, fallbackLang) {
  const preset = selectedCloudPreset();
  if (!preset || !fallbackLang.startsWith("en")) return false;
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: preset.provider,
      text,
      lang: preset.lang,
      voice: preset.voice,
      instructions: preset.instructions || "",
      speed: preset.speed || 0.9,
      format: "mp3"
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Cloud TTS service unavailable.");
  if (!data.audioUrl) throw new Error("No cloud audio URL returned.");
  elements.voiceStatus.textContent = data.cached
    ? `${data.engine || "Cloud TTS"} cached: ${data.voice}`
    : `${data.engine || "Cloud TTS"} generated: ${data.voice}`;
  await playAudioFile(data.audioUrl, `Playing ${preset.label}`);
  return true;
}

function isCloudTtsConfigError(error) {
  return /not configured|OPENROUTER_API_KEY|OPENAI_API_KEY|HUABOT_TTS_API_KEY|SANDBOX_AI_KEY|HUABOT_OPENAI_API_KEY/i.test(error?.message || "");
}

function speakText(text, options = {}) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) {
      elements.voiceStatus.textContent = "当前浏览器不支持朗读，将只尝试播放离线音频。";
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.lang || "en-US";
    utterance.rate = options.rate || 0.86;
    utterance.pitch = options.pitch || 1.04;
    const voice = selectedVoice();
    if (voice) utterance.voice = voice;
    activeUtterance = utterance;
    const finish = () => {
      activeUtterance = null;
      resolve();
    };
    utterance.onstart = () => {
      elements.voiceStatus.textContent = `正在朗读：${voice ? voice.name : "浏览器默认声音"}`;
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
  });
}

function playAudioFile(src, statusText = "Playing audio") {
  return new Promise((resolve, reject) => {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio = null;
    }
    const audio = new Audio(src);
    activeAudio = audio;
    audio.onplaying = () => {
      elements.voiceStatus.textContent = "正在播放本地离线声音";
    };
    audio.onplaying = () => {
      elements.voiceStatus.textContent = statusText || "Playing audio";
    };
    audio.onended = () => {
      activeAudio = null;
      resolve();
    };
    audio.onerror = () => {
      activeAudio = null;
      reject(new Error(`Cannot play ${src}`));
    };
    audio.play().catch((error) => {
      activeAudio = null;
      reject(error);
    });
  });
}

async function speakGeneratedAudio(text, fallbackLang) {
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang: fallbackLang })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Generated TTS service unavailable.");
  if (!data.audioUrl) throw new Error("No generated audio URL returned.");
  await playAudioFile(data.audioUrl, data.cached ? "Playing cached generated audio" : "Playing generated audio");
  return true;
}

async function speakWordAudio(word, kind, fallbackText, fallbackLang, options = {}) {
  const preset = selectedCloudPreset();
  try {
    if (await speakWithCloudTts(fallbackText, fallbackLang)) return true;
  } catch (error) {
    elements.voiceStatus.textContent = isCloudTtsConfigError(error)
      ? "Cloud TTS is not configured; using local audio instead."
      : `Cloud TTS failed: ${error.message}. Using local audio instead.`;
  }
  if (options.preferGenerated) {
    try {
      await speakGeneratedAudio(fallbackText, fallbackLang);
      return true;
    } catch (error) {
      elements.voiceStatus.textContent = `Generated TTS failed: ${error.message}. Using browser voice instead.`;
      await speakText(fallbackText, { lang: fallbackLang, rate: fallbackLang === "zh-CN" ? 0.9 : 0.86 });
      return true;
    }
  }
  const file = `./audio/${word.id}-${kind}.wav`;
  try {
    await playAudioFile(file, preset ? "Cloud TTS unavailable; playing local audio" : "Playing local audio");
    return true;
  } catch {
    await speakText(fallbackText, { lang: fallbackLang, rate: fallbackLang === "zh-CN" ? 0.9 : 0.86 });
    return true;
  }
}

async function playCurrent() {
  if (!currentWord()) {
    elements.voiceStatus.textContent = "没有待学习单词。";
    return;
  }
  clearTimeout(autoTimer);
  window.speechSynthesis?.cancel();
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  await ensureVoices();
  elements.mascotFace.classList.add("speaking");
  const word = currentWord();
  track("view");
  for (let count = 0; count < state.repeatCount; count += 1) {
    const ok = await speakWordAudio(word, "word", word.word, "en-US");
    if (!ok && selectedCloudPreset()) {
      elements.mascotFace.classList.remove("speaking");
      return;
    }
  }
  await speakWordAudio(word, "meaning", word.meaning, "zh-CN");
  const examplePage = currentWordExamplePage(word);
  const examples = examplePage.examples;
  const useGeneratedExampleAudio = examplePage.index > 0;
  for (let index = 0; index < examples.length; index += 1) {
    const example = examples[index];
    const audioIndex = examplePage.index * 3 + index + 1;
    const ok = await speakWordAudio(word, `sentence-${audioIndex}`, example.sentence, "en-US", { preferGenerated: useGeneratedExampleAudio });
    if (!ok && selectedCloudPreset()) {
      elements.mascotFace.classList.remove("speaking");
      return;
    }
    await speakWordAudio(word, `translation-${audioIndex}`, example.translation, "zh-CN", { preferGenerated: useGeneratedExampleAudio });
  }
  elements.mascotFace.classList.remove("speaking");
  elements.voiceStatus.textContent = "已播放：英文单词、中文释义、英文例句、例句中文。";
  if (state.autoPlay) {
    autoTimer = setTimeout(() => {
      nextWord();
      playCurrent();
    }, state.switchSeconds * 1000);
  }
}

function loadVoices() {
  elements.voiceSelect.innerHTML = "";
  renderCloudVoiceButtons();
  cloudVoicePresets.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.value;
    option.textContent = preset.label;
    elements.voiceSelect.appendChild(option);
  });
  const localOption = document.createElement("option");
  localOption.value = "__local__";
  localOption.textContent = "本地离线声音 · Microsoft Zira/Huihui";
  elements.voiceSelect.appendChild(localOption);
  if (!("speechSynthesis" in window)) {
    if (!selectedCloudPreset()) state.voiceName = "__local__";
    elements.voiceStatus.textContent = "将使用本地离线声音播放。";
    return;
  }
  voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.startsWith("en"));
  voices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} · ${voice.lang}`;
    elements.voiceSelect.appendChild(option);
  });
  if (!state.voiceName || (state.voiceName !== "__local__" && !selectedCloudPreset() && !voices.some((voice) => voice.name === state.voiceName))) {
    state.voiceName = "__local__";
  }
  elements.voiceSelect.value = state.voiceName;
  elements.voiceStatus.textContent = `已准备离线声音；浏览器英文声音 ${voices.length} 个。`;
  saveState();
  if (selectedCloudPreset()) {
    const preset = selectedCloudPreset();
    elements.voiceStatus.textContent = `${preset.label} selected. If the cloud TTS key is not configured, local audio will be used.`;
  }
  renderCloudVoiceButtons();
}

function ensureVoices() {
  return new Promise((resolve) => {
    loadVoices();
    if (voices.length || !("speechSynthesis" in window)) {
      resolve();
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      loadVoices();
      if (voices.length || Date.now() - startedAt > 1800) {
        clearInterval(timer);
        resolve();
      }
    }, 150);
  });
}

function addRandomWords() {
  const selectedTopic = state.selectedTopic;
  const profileTopics = currentProfile().topics;
  const topicMatches = (word) => selectedTopic === "all"
    ? word.topics.some((topic) => profileTopics.includes(topic))
    : word.topics.includes(selectedTopic);
  const preferred = wordPool.filter((word) => {
    const sameTopic = topicMatches(word);
    const unused = !state.addedWordIds.includes(word.id) && !state.masteredWordIds.includes(word.id);
    const difficultyFit = Math.abs(word.difficulty - state.randomDifficulty) <= 10;
    return sameTopic && unused && difficultyFit;
  });
  const fallback = wordPool.filter((word) => {
    const sameTopic = topicMatches(word);
    return sameTopic && !state.addedWordIds.includes(word.id) && !state.masteredWordIds.includes(word.id);
  });
  const candidates = preferred.length >= 12 ? preferred : fallback;
  const picked = shuffle(candidates).slice(0, 12);
  if (!picked.length) {
    elements.addResult.textContent = "No new words left here. Try another topic or difficulty.";
    elements.voiceStatus.textContent = "这个领域的新词已经加完了。";
    return;
  }
  state.addedWordIds.push(...picked.map((word) => word.id));
  picked.forEach((word) => addEvent("added", word));
  rebuildWords();
  state.currentIndex = 0;
  saveState();
  renderTopics();
  buildDeck("recommend");
  const pickedIds = new Set(picked.map((word) => word.id));
  deck = [...picked, ...deck.filter((word) => !pickedIds.has(word.id))];
  state.currentIndex = 0;
  saveState();
  render();
  elements.addResult.textContent = `Added ${picked.length}: ${picked.slice(0, 5).map((word) => word.word).join(", ")}${picked.length > 5 ? "..." : ""}`;
  elements.voiceStatus.textContent = `已按 ${difficultyText()} 随机增加 ${picked.length} 个同类新单词。`;
}

function topTopicId() {
  const topInterest = Object.entries(state.topicInterest).sort((a, b) => b[1] - a[1])[0];
  return topInterest?.[0] || "daily";
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function openCardSheetModal() {
  const word = currentWord();
  elements.cardSeedInput.value = word?.word || "";
  elements.cardCountInput.value = 10;
  elements.cardSheetModal.hidden = false;
  generateCardSheet();
  renderAiCardSheetHistoryControls();
  setTimeout(() => elements.cardSeedInput.focus(), 0);
}

function closeCardSheetModal() {
  elements.cardSheetModal.hidden = true;
}

function allPrintableWords() {
  const seen = new Map();
  [...baseWords, ...wordPool, ...state.customWords.map((word) => normalizeWord(word)), ...words].forEach((word) => {
    if (word?.word) seen.set(word.word.toLowerCase(), normalizeWord(word));
  });
  (state.savedAiCardSheets || []).forEach((record) => {
    (record.cards || []).forEach((word) => {
      if (word?.word) seen.set(String(word.word).toLowerCase(), normalizeWord(word));
    });
  });
  return [...seen.values()];
}

function findPrintableWord(value) {
  const needle = String(value || "").trim().toLowerCase();
  if (!needle) return null;
  return allPrintableWords().find((word) => word.word.toLowerCase() === needle)
    || allPrintableWords().find((word) => word.word.toLowerCase().includes(needle))
    || null;
}

function cardSeedSource(seedText) {
  const trimmed = String(seedText || "").trim();
  if (trimmed) return findPrintableWord(trimmed) || makePlaceholderCard(trimmed);
  return currentWord() || makePlaceholderCard("word");
}

function parseCustomCardWords() {
  return elements.customCardWordsInput.value
    .split(/[\s,;，；、\n]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function makePlaceholderCard(word) {
  return normalizeWord({
    id: `print-${word}`,
    word,
    phonetic: `/${word}/`,
    meaning: "自定义单词",
    sentence: `I want to remember the word ${word}.`,
    translation: `我想记住 ${word} 这个词。`,
    topics: ["daily"],
    level: difficultyLevelFromScore(state.randomDifficulty),
    difficulty: state.randomDifficulty,
    rank: 9999
  });
}

function cardWordId(word, index) {
  const slug = cleanToken(word).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `ai-card-${slug || `item-${index}`}-${Date.now()}-${index}`;
}

function cardRelationScore(source, candidate, mode) {
  if (!source || !candidate || source.word === candidate.word) return -Infinity;
  const sourceTopics = new Set(source.topics || []);
  const topicOverlap = (candidate.topics || []).filter((topic) => sourceTopics.has(topic)).length;
  const difficultyScore = Math.max(0, 22 - Math.abs((candidate.difficulty || 40) - (source.difficulty || 40)) * 0.8);
  const levelScore = candidate.level === source.level ? 10 : 0;
  const spellScore = spellingSimilarity(source.word, candidate.word) * 35;
  const rankScore = Math.max(0, 8 - Math.log10((candidate.rank || 9000) + 10));
  if (mode === "topic") return topicOverlap * 34 + difficultyScore + levelScore + rankScore;
  if (mode === "spelling") return spellScore * 1.8 + commonEdgeScore(source.word, candidate.word) + difficultyScore * 0.4;
  return topicOverlap * 24 + spellScore + difficultyScore + levelScore + rankScore;
}

function commonEdgeScore(a, b) {
  const left = commonPrefixLength(a, b);
  const right = commonSuffixLength(a, b);
  return Math.min(20, (left + right) * 4);
}

function commonPrefixLength(a, b) {
  let count = 0;
  while (count < a.length && count < b.length && a[count] === b[count]) count += 1;
  return count;
}

function commonSuffixLength(a, b) {
  let count = 0;
  while (count < a.length && count < b.length && a[a.length - 1 - count] === b[b.length - 1 - count]) count += 1;
  return count;
}

function spellingSimilarity(a, b) {
  const max = Math.max(a.length, b.length, 1);
  return Math.max(0, 1 - editDistance(a.toLowerCase(), b.toLowerCase()) / max);
}

function editDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = saved;
    }
  }
  return previous[b.length];
}

function relationReason(source, word, mode) {
  if (word.reason) return word.reason;
  if (!source) return "自定义卡片";
  const shared = (word.topics || []).filter((topic) => (source.topics || []).includes(topic));
  if (mode === "spelling" || spellingSimilarity(source.word, word.word) > 0.52) return `易混拼写：${source.word}`;
  if (shared.length) return `同主题：${shared.join(", ")}`;
  if (word.level === source.level) return `同难度：${word.level}`;
  return "近似学习";
}

function pickRelatedCardWords(source, count, mode, excludedWords = new Set()) {
  if (!source) return [];
  return allPrintableWords()
    .filter((word) => !excludedWords.has(word.word.toLowerCase()) && word.word.toLowerCase() !== source.word.toLowerCase())
    .map((word) => ({ word, score: cardRelationScore(source, word, mode) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((item) => item.word);
}

function generateCardSheet(statusMessage = "") {
  const count = Math.max(4, Math.min(24, Number(elements.cardCountInput.value) || 10));
  const mode = elements.cardRelationSelect.value || "mixed";
  const seedText = elements.cardSeedInput.value.trim() || currentWord()?.word || "";
  const source = cardSeedSource(seedText);
  const customWords = parseCustomCardWords();
  const used = new Set();
  const customCards = customWords.map((word) => {
    used.add(word);
    return findPrintableWord(word) || makePlaceholderCard(word);
  });
  const generated = pickRelatedCardWords(source, count - customCards.length, mode, used);
  const cards = [...customCards, ...generated].slice(0, count);
  renderCardSheet(cards, source, mode);
  renderAiCardSheetHistoryControls();
  elements.cardSheetStatus.textContent = statusMessage || (customWords.length
    ? `已按自定义列表生成 ${cards.length} 张；不足部分用近似词补齐。`
    : `已围绕 ${source?.word || seedText || "当前单词"} 生成 ${cards.length} 张近似单词卡。`);
}

function renderCardSheet(cards, source, mode) {
  if (!cards.length) {
    elements.cardSheetPreview.innerHTML = `<div class="calendar-detail">没有可生成的卡片，请换一个核心单词或输入自定义单词。</div>`;
    return;
  }
  elements.cardSheetPreview.innerHTML = cards.map((word, index) => `
    <article class="print-card">
      <div class="print-card-top">
        <span>#${index + 1}</span>
        <span>${escapeHtml(word.level || "")}</span>
      </div>
      <h3>${escapeHtml(word.word)}</h3>
      <div class="card-phonetic">${escapeHtml(word.phonetic || `/${word.word}/`)}</div>
      <div class="card-meaning">${escapeHtml(word.meaning || "自定义单词")}</div>
      <p class="card-example">${escapeHtml(word.sentence || `I want to learn ${word.word}.`)}</p>
      <p class="card-translation">${escapeHtml(word.translation || `${word.meaning || word.word}。`)}</p>
      <div class="card-reason">${escapeHtml(relationReason(source, word, mode))}</div>
    </article>
  `).join("");
}

function renderAiCardSheetHistoryControls() {
  const records = state.savedAiCardSheets || [];
  const total = records.length;
  if (!elements.cardSheetHistory) return;
  elements.cardSheetHistory.hidden = total === 0;
  if (!total) {
    elements.aiCardSheetPageLabel.textContent = "AI 0 / 0";
    return;
  }
  state.aiCardSheetPage = Math.max(0, Math.min(total - 1, Number(state.aiCardSheetPage) || 0));
  const record = records[state.aiCardSheetPage];
  const date = record?.createdAt ? new Date(record.createdAt).toLocaleString() : "";
  elements.aiCardSheetPageLabel.textContent = `AI ${state.aiCardSheetPage + 1} / ${total}${record?.seedText ? ` · ${record.seedText}` : ""}${date ? ` · ${date}` : ""}`;
  elements.prevAiCardSheetBtn.disabled = total <= 1;
  elements.nextAiCardSheetBtn.disabled = total <= 1;
}

function saveAiCardSheetRecord(record) {
  const records = state.savedAiCardSheets || [];
  records.push({
    id: `card-sheet-${Date.now()}`,
    createdAt: Date.now(),
    ...record
  });
  state.savedAiCardSheets = records.slice(-50);
  state.aiCardSheetPage = state.savedAiCardSheets.length - 1;
  saveState();
  renderAiCardSheetHistoryControls();
}

function showAiCardSheetRecord(offset) {
  const records = state.savedAiCardSheets || [];
  if (!records.length) return;
  state.aiCardSheetPage = (Math.max(0, Number(state.aiCardSheetPage) || 0) + offset + records.length) % records.length;
  const record = records[state.aiCardSheetPage];
  const source = record.source || makePlaceholderCard(record.seedText || "word");
  renderCardSheet((record.cards || []).map((word) => normalizeWord(word)), source, record.mode || "mixed");
  renderAiCardSheetHistoryControls();
  saveState();
  elements.cardSheetStatus.textContent = `已打开 AI 历史记录：${record.seedText || source.word}，共 ${(record.cards || []).length} 张。`;
}

async function generateAiCardSheet() {
  const count = Math.max(4, Math.min(24, Number(elements.cardCountInput.value) || 10));
  const mode = elements.cardRelationSelect.value || "mixed";
  const seedText = elements.cardSeedInput.value.trim() || currentWord()?.word || "";
  const source = cardSeedSource(seedText);
  const customWords = parseCustomCardWords();
  elements.cardSheetStatus.textContent = `AI 正在围绕 ${source.word} 生成 ${count} 张学习小纸片...`;
  try {
    const response = await fetch("/api/ai/card-words", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seedWord: source.word,
        seedInput: seedText,
        seedMeaning: source.meaning,
        level: source.level,
        topics: source.topics || [],
        mode,
        count,
        customWords,
        knownWords: allPrintableWords().slice(0, 120).map((word) => ({
          word: word.word,
          meaning: word.meaning,
          level: word.level,
          topics: word.topics
        }))
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${data.error || "AI generation failed"}${data.code ? ` (${data.code})` : ""}`);
    const aiCards = Array.isArray(data.cards) ? data.cards : [];
    if (!aiCards.length) throw new Error("AI did not return cards.");
    const cards = aiCards.slice(0, count).map((item, index) => normalizeWord({
      id: cardWordId(String(item.word || `word-${index}`), index),
      word: String(item.word || "").trim().toLowerCase(),
      phonetic: item.phonetic || `/${item.word || ""}/`,
      meaning: item.meaning || "AI 推荐词",
      sentence: item.sentence || `I want to learn ${item.word}.`,
      translation: item.translation || "",
      topics: Array.isArray(item.topics) && item.topics.length ? item.topics : source.topics || ["daily"],
      level: item.level || source.level || "A2",
      difficulty: levelDifficulty(item.level || source.level || "A2"),
      rank: 8800 + index,
      reason: item.reason || "AI 推荐"
    })).filter((word) => word.word);
    renderCardSheet(cards, source, mode);
    saveAiCardSheetRecord({
      seedText: seedText || source.word,
      source,
      mode,
      cards,
      provider: data.provider || "",
      chargedTokens: data.chargedTokens || data.usage?.total_tokens || 0
    });
    elements.cardSheetStatus.textContent = `AI 已生成 ${cards.length} 张；服务：${data.provider}；Token：${data.chargedTokens || data.usage?.total_tokens || "未知"}。`;
  } catch (error) {
    generateCardSheet(`AI 生成暂时不可用：${error.message}。已切回本地生成。`);
  }
}

function renderCalendar() {
  if (!state.calendarMonth) state.calendarMonth = monthKey();
  const [year, month] = state.calendarMonth.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const leading = (first.getDay() + 6) % 7;
  elements.calendarTitle.textContent = state.calendarMonth;
  elements.calendarGrid.innerHTML = "";
  for (let i = 0; i < leading; i += 1) {
    const empty = document.createElement("button");
    empty.className = "calendar-day empty";
    empty.type = "button";
    elements.calendarGrid.appendChild(empty);
  }
  for (let day = 1; day <= last.getDate(); day += 1) {
    const key = `${state.calendarMonth}-${String(day).padStart(2, "0")}`;
    const events = state.events.filter((event) => event.date === key);
    const reviewCount = events.filter((event) => event.type === "review").length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `calendar-day${events.length ? " has-study" : ""}${reviewCount ? " has-review" : ""}`;
    button.innerHTML = `<strong>${day}</strong><span>${events.length ? `${events.length} 词` : ""}</span>`;
    button.addEventListener("click", () => renderCalendarDetail(key));
    elements.calendarGrid.appendChild(button);
  }
}

function renderCalendarDetail(key) {
  const events = state.events.filter((event) => event.date === key);
  if (!events.length) {
    elements.calendarDetail.textContent = `${key} 暂无学习记录。`;
    return;
  }
  const learned = uniqueWords(events.filter((event) => event.type === "learn"));
  const reviews = uniqueWords(events.filter((event) => event.type === "review"));
  const added = uniqueWords(events.filter((event) => event.type === "added"));
  elements.calendarDetail.innerHTML = [
    `<strong>${key}</strong>`,
    learned.length ? `学习：${learned.join("、")}` : "",
    reviews.length ? `复习：${reviews.join("、")}` : "",
    added.length ? `新增：${added.join("、")}` : ""
  ].filter(Boolean).join("<br>");
}

function uniqueWords(events) {
  return [...new Map(events.map((event) => [event.wordId, `${event.word}(${event.meaning})`])).values()];
}

function renderMasteredLibrary() {
  const wordMap = allKnownWords();
  const mastered = state.masteredWordIds.map((id) => wordMap.get(id)).filter(Boolean);
  elements.masteredCount.textContent = mastered.length;
  if (!mastered.length) {
    elements.masteredList.innerHTML = `<div class="calendar-detail">还没有 100% 学会的单词。</div>`;
    return;
  }
  elements.masteredList.innerHTML = mastered.map((word) => `
    <div class="mastered-item">
      <div>
        <strong>${word.word}</strong>
        <span>${word.meaning}</span>
      </div>
      <button class="restore-button" type="button" data-restore="${word.id}">移出</button>
    </div>
  `).join("");
}

function restoreMasteredWord(wordId) {
  state.masteredWordIds = state.masteredWordIds.filter((id) => id !== wordId);
  const user = wordState(wordId);
  user.familiarity = Math.min(user.familiarity, 80);
  user.nextReviewAt = Date.now();
  const word = allKnownWords().get(wordId);
  if (word) addEvent("restore", word);
  saveState();
  renderTopics();
  buildDeck(state.mode);
  elements.voiceStatus.textContent = "已从已掌握库移出，单词会重新出现在学习页。";
}

function tokenizeReaderText(text) {
  return text.match(/[A-Za-z]+(?:'[A-Za-z]+)?|[^A-Za-z]+/g) || [];
}

function cleanToken(token) {
  return token.toLowerCase().replace(/^'+|'+$/g, "");
}

function isHardReaderWord(word) {
  if (!word || word.length < 5) return false;
  const known = allKnownWords().get(word);
  if (known && known.difficulty >= state.randomDifficulty) return true;
  if (hardWordHints.has(word)) return true;
  if (word.length >= 11) return true;
  return /(tion|sion|ment|ity|ance|ence|ive|ous|ate|ize|ise|ship|ability|ibility)$/.test(word) && word.length >= 8;
}

function analyzeReaderText() {
  const text = elements.readerInput.value.trim();
  if (!text) {
    elements.readerStatus.textContent = "请先粘贴一段英文短文。";
    elements.readerOutput.innerHTML = "";
    return;
  }
  const tokens = tokenizeReaderText(text);
  const hardWords = new Set();
  elements.readerOutput.innerHTML = tokens.map((token) => {
    if (!/^[A-Za-z]/.test(token)) return `<span class="reader-punct">${escapeHtml(token)}</span>`;
    const word = cleanToken(token);
    const hard = isHardReaderWord(word);
    if (hard) hardWords.add(word);
    const selected = state.readerSelectedWords.includes(word);
    const translation = hard || selected ? readerWordTranslation(word) : "";
    return `
      <span class="reader-word">
        <button class="reader-token${hard ? " hard" : ""}${selected ? " selected" : ""}" type="button" data-reader-word="${word}">${escapeHtml(token)}</button>
        <span class="reader-translation">${escapeHtml(translation)}</span>
      </span>`;
  }).join("");
  elements.readerStatus.textContent = `自动标出 ${hardWords.size} 个高难词；点击任意词可手动点亮。`;
}

function readerWordTranslation(word) {
  const known = allKnownWords().get(word) || words.find((item) => item.word.toLowerCase() === word);
  if (known?.meaning) return known.meaning;
  return quickTranslations[word] || "待查";
}

function toggleReaderWord(word) {
  if (state.readerSelectedWords.includes(word)) {
    state.readerSelectedWords = state.readerSelectedWords.filter((item) => item !== word);
  } else {
    state.readerSelectedWords.push(word);
  }
  saveState();
  analyzeReaderText();
}

function addReaderWordsToLibrary() {
  const selected = [...new Set(state.readerSelectedWords)];
  if (!selected.length) {
    elements.readerStatus.textContent = "还没有选择要加入学习库的单词。";
    return;
  }
  const existing = new Set([...words.map((word) => word.id), ...state.customWords.map((word) => word.id)]);
  const sourceMap = allKnownWords();
  const created = selected
    .filter((word) => !existing.has(`custom-${word}`) && !sourceMap.has(word))
    .map((word, index) => normalizeWord({
      id: `custom-${word}`,
      word,
      meaning: "自定义词",
      phonetic: `/${word}/`,
      topics: ["daily"],
      level: difficultyLevelFromScore(state.randomDifficulty),
      difficulty: state.randomDifficulty,
      rank: 9000 + index,
      sentence: `I found ${word} in an English article today.`,
      translation: `我今天在英文短文里遇到了“${word}”。`
    }));

  const knownPicked = selected
    .map((word) => sourceMap.get(word))
    .filter(Boolean)
    .filter((word) => !state.addedWordIds.includes(word.id) && !baseWords.some((base) => base.id === word.id));

  state.customWords.push(...created);
  knownPicked.forEach((word) => {
    if (!state.addedWordIds.includes(word.id)) state.addedWordIds.push(word.id);
  });
  [...created, ...knownPicked].forEach((word) => addEvent("added", word));
  rebuildWords();
  saveState();
  renderTopics();
  buildDeck("recommend");
  elements.readerStatus.textContent = `已加入 ${created.length + knownPicked.length} 个单词到学习库。`;
}

function difficultyLevelFromScore(score) {
  if (score >= 68) return "C1";
  if (score >= 52) return "B2";
  if (score >= 40) return "B1";
  if (score >= 24) return "A2";
  return "A1";
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

async function readReaderText() {
  const text = elements.readerInput.value.trim();
  if (!text) {
    elements.readerStatus.textContent = "请先粘贴一段英文短文。";
    return;
  }
  const preset = selectedCloudPreset();
  if (preset) {
    try {
      await readTextWithLocalTts(text, { mode: "cloud" });
      return;
    } catch (error) {
      stopTtsCountdown();
      elements.readerStatus.textContent = `Cloud TTS failed: ${error.message}. Trying local TTS...`;
    }
  }
  try {
    await readTextWithLocalTts(text, { mode: "local" });
  } catch (error) {
    stopTtsCountdown();
    elements.readerStatus.textContent = `Local TTS failed: ${error.message}. Trying browser voice...`;
    readTextWithBrowserTts(text);
  }
}

async function readTextWithLocalTts(text, options = {}) {
  elements.readerAudioActions.hidden = true;
  generatedReaderAudioUrl = "";
  startTtsCountdown(text);
  const preset = selectedCloudPreset();
  const useCloud = options.mode === "cloud" && preset;
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(useCloud
      ? { provider: preset.provider, text, lang: preset.lang, voice: preset.voice, instructions: preset.instructions || "", speed: preset.speed || 0.9, format: "mp3" }
      : { text, lang: "en-US" })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "TTS service unavailable.");
  stopTtsCountdown();
  if (!data.audioUrl) throw new Error("No audio URL returned.");
  generatedReaderAudioUrl = data.audioUrl;
  elements.readerAudioActions.hidden = false;
  elements.downloadGeneratedLink.href = data.audioUrl;
  elements.downloadGeneratedLink.download = data.audioUrl.split("/").pop() || "reader.wav";
  const seconds = (data.elapsedMs / 1000).toFixed(2);
  const estimate = data.estimateMs ? `，预计 ${(data.estimateMs / 1000).toFixed(1)} 秒` : "";
  elements.readerStatus.textContent = data.cached
    ? `已找到缓存音频。资源：${data.engine}；声音：${data.voice}。`
    : `生成完成，用时 ${seconds} 秒${estimate}。资源：${data.engine}；声音：${data.voice}。`;
}

function startTtsCountdown(text) {
  stopTtsCountdown();
  const estimateMs = Math.max(1200, Math.min(90000, 900 + text.length * 2.8));
  const startedAt = Date.now();
  const render = () => {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, estimateMs - elapsed);
    elements.readerStatus.textContent = `正在生成本地朗读音频，预计 ${(estimateMs / 1000).toFixed(1)} 秒，剩余 ${(remaining / 1000).toFixed(1)} 秒...`;
  };
  render();
  ttsCountdownTimer = setInterval(render, 200);
}

function stopTtsCountdown() {
  if (ttsCountdownTimer) {
    clearInterval(ttsCountdownTimer);
    ttsCountdownTimer = null;
  }
}

function readTextWithBrowserTts(text) {
  stopTtsCountdown();
  if (!("speechSynthesis" in window)) {
    elements.readerStatus.textContent = "本地 TTS 服务未启动，浏览器也不支持朗读。请使用本地服务地址打开。";
    return;
  }
  window.speechSynthesis.cancel();
  readerUtterance = new SpeechSynthesisUtterance(text);
  readerUtterance.lang = "en-US";
  readerUtterance.rate = 0.9;
  readerUtterance.voice = selectedVoice();
  readerUtterance.onstart = () => {
    elements.readerStatus.textContent = "正在朗读短文。";
  };
  readerUtterance.onend = () => {
    elements.readerStatus.textContent = "短文朗读完成。";
    readerUtterance = null;
  };
  window.speechSynthesis.speak(readerUtterance);
}

async function translateReaderText() {
  const text = elements.readerInput.value.trim();
  if (!text) {
    elements.readerStatus.textContent = "请先粘贴一段英文短文。";
    return;
  }
  const estimatedTokens = estimateAiTokens(text);
  elements.articleTranslation.hidden = false;
  elements.articleTranslation.textContent = `正在 AI 翻译整篇文章，预计消耗约 ${estimatedTokens} AI Token...`;
  try {
    const startedAt = Date.now();
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`${data.error || "Translate failed"}${data.code ? ` (${data.code})` : ""}`);
    const seconds = ((data.elapsedMs || Date.now() - startedAt) / 1000).toFixed(2);
    elements.articleTranslation.textContent = data.translatedText || "翻译服务没有返回译文。";
    if (Array.isArray(data.difficultWords)) mergeAiDifficultWords(data.difficultWords);
    const used = data.usage?.total_tokens || data.chargedTokens || estimatedTokens;
    elements.readerStatus.textContent = `整篇翻译完成，用时 ${seconds} 秒，消耗 ${used} AI Token。服务：${data.provider}`;
  } catch (error) {
    elements.articleTranslation.textContent = "翻译服务暂时不可用，请稍后再试。";
    elements.readerStatus.textContent = `翻译服务暂时不可用。${error.message ? `原因：${error.message}` : ""}`;
  }
}

async function translateSpokenChinese() {
  const text = elements.chineseSpeechInput.value.trim();
  if (!text) {
    elements.speechTranslationStatus.textContent = "请先说一句中文，或手动输入中文。";
    return;
  }

  elements.translateSpeechBtn.disabled = true;
  elements.speechTranslationOutput.hidden = false;
  elements.speechTranslationOutput.textContent = "正在翻译...";
  elements.speechTranslationStatus.textContent = "正在把中文翻译成英文。";
  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, direction: "zh-to-en" })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Translate failed");
    currentSpeechTranslation = String(data.translatedText || "").trim();
    elements.speechTranslationOutput.textContent = currentSpeechTranslation || "翻译服务没有返回内容。";
    elements.playTranslationBtn.disabled = !currentSpeechTranslation;
    elements.speechTranslationStatus.textContent = currentSpeechTranslation
      ? "翻译完成，可以播放英文发音。"
      : "翻译服务没有返回内容。";
  } catch (error) {
    currentSpeechTranslation = "";
    elements.playTranslationBtn.disabled = true;
    elements.speechTranslationOutput.textContent = "翻译服务暂时不可用，请稍后再试。";
    elements.speechTranslationStatus.textContent = `翻译失败：${error.message}`;
  } finally {
    elements.translateSpeechBtn.disabled = false;
  }
}

function stopSpeechRecording() {
  if (speechRecorder?.state === "recording") speechRecorder.stop();
}

function resetSpeechRecorder() {
  cancelAnimationFrame(speechMonitorFrame);
  speechMonitorFrame = 0;
  speechStream?.getTracks().forEach((track) => track.stop());
  speechStream = null;
  speechAudioContext?.close().catch(() => {});
  speechAudioContext = null;
  speechRecorder = null;
  elements.startSpeechBtn.classList.remove("listening");
  elements.startSpeechBtn.querySelector("span").textContent = "说中文";
}

async function submitSpeechRecording(blob) {
  elements.speechTranslationStatus.textContent = "正在识别中文语音...";
  elements.speechTranslationOutput.hidden = false;
  elements.speechTranslationOutput.textContent = "正在识别和翻译...";
  try {
    const response = await fetch("/api/speech-translate", {
      method: "POST",
      headers: { "Content-Type": blob.type || "audio/webm" },
      body: blob
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || data.detail || "Speech recognition failed");
    elements.chineseSpeechInput.value = data.transcript || "";
    currentSpeechTranslation = String(data.translatedText || "").trim();
    elements.speechTranslationOutput.textContent = currentSpeechTranslation || "翻译服务没有返回内容。";
    elements.playTranslationBtn.disabled = !currentSpeechTranslation;
    elements.speechTranslationStatus.textContent = `已识别：${data.transcript || ""}`;
  } catch (error) {
    currentSpeechTranslation = "";
    elements.playTranslationBtn.disabled = true;
    elements.speechTranslationOutput.textContent = "语音识别失败，请重试或直接输入中文。";
    elements.speechTranslationStatus.textContent = `识别失败：${error.message}`;
  }
}

async function toggleSpeechRecording() {
  if (speechRecorder?.state === "recording") {
    elements.speechTranslationStatus.textContent = "录音结束，正在处理...";
    stopSpeechRecording();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    elements.startSpeechBtn.disabled = true;
    elements.speechTranslationStatus.textContent = "当前浏览器不支持录音，请使用新版 Chrome 或 Edge。";
    return;
  }
  elements.speechTranslationStatus.textContent = "正在申请麦克风权限...";
  try {
    speechStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, autoGainControl: true, noiseSuppression: true }
    });
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
    speechRecorder = new MediaRecorder(speechStream, mimeType ? { mimeType } : undefined);
    speechChunks = [];
    speechRecorder.ondataavailable = (event) => {
      if (event.data.size) speechChunks.push(event.data);
    };
    speechRecorder.onstop = async () => {
      const blob = new Blob(speechChunks, { type: speechRecorder.mimeType || "audio/webm" });
      resetSpeechRecorder();
      if (blob.size < 1000) {
        elements.speechTranslationStatus.textContent = "录音太短，请再说一次。";
        return;
      }
      await submitSpeechRecording(blob);
    };
    speechRecorder.start(250);
    speechRecordingStartedAt = Date.now();
    speechDetectedAt = 0;
    speechLastActiveAt = 0;
    elements.startSpeechBtn.classList.add("listening");
    elements.startSpeechBtn.querySelector("span").textContent = "结束录音";
    elements.speechTranslationStatus.textContent = "正在听，请说中文；停顿后会自动结束。";

    speechAudioContext = new AudioContext();
    const source = speechAudioContext.createMediaStreamSource(speechStream);
    const analyser = speechAudioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const monitor = () => {
      if (speechRecorder?.state !== "recording") return;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }
      const level = Math.sqrt(sum / samples.length);
      const now = Date.now();
      if (level > 0.025) {
        if (!speechDetectedAt) speechDetectedAt = now;
        speechLastActiveAt = now;
      }
      if ((speechDetectedAt && now - speechLastActiveAt > 1200) || now - speechRecordingStartedAt > 20000) {
        stopSpeechRecording();
        return;
      }
      speechMonitorFrame = requestAnimationFrame(monitor);
    };
    monitor();
  } catch (error) {
    resetSpeechRecorder();
    const permissionDenied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
    elements.speechTranslationStatus.textContent = permissionDenied
      ? "麦克风权限被拒绝，请在地址栏允许麦克风后重试。"
      : `无法启动录音：${error.message}`;
  }
}

function estimateAiTokens(text) {
  return Math.ceil(String(text || "").length / 3.6) + 180;
}

function mergeAiDifficultWords(items) {
  const wordsToAdd = items
    .map((item) => String(item.word || item).toLowerCase().trim())
    .filter(Boolean)
    .slice(0, 18);
  for (const word of wordsToAdd) {
    if (!state.readerSelectedWords.includes(word)) state.readerSelectedWords.push(word);
  }
  saveState();
  if (elements.readerOutput.innerHTML.trim()) analyzeReaderText();
}

function renderStory(story) {
  if (!story) {
    elements.storyOutput.hidden = true;
    elements.storyOutput.innerHTML = "";
    activeStoryId = "";
    return;
  }
  activeStoryId = story.id || "";
  const pairs = storyLinePairs(story);
  elements.storyOutput.hidden = false;
  elements.storyOutput.innerHTML = `
    <strong>${escapeHtml(story.title || "Bedtime Story")}</strong>
    <div class="story-lines">
      ${pairs.map((pair) => `
        <div class="story-line-pair">
          ${pair.english ? `<p class="story-line-en">${escapeHtml(pair.english)}</p>` : ""}
          ${pair.chinese ? `<p class="story-line-zh">${escapeHtml(pair.chinese)}</p>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function splitStoryText(value) {
  const lines = String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1) return lines;
  return String(value || "")
    .match(/[^.!?。！？]+[.!?。！？]?/g)
    ?.map((line) => line.trim())
    .filter(Boolean) || lines;
}

function storyLinePairs(story) {
  const english = splitStoryText(story?.english || "");
  const chinese = splitStoryText(story?.chinese || "");
  const count = Math.max(english.length, chinese.length);
  return Array.from({ length: count }, (_, index) => ({
    english: english[index] || "",
    chinese: chinese[index] || ""
  })).filter((pair) => pair.english || pair.chinese);
}

function renderStoryHistory() {
  const stories = Array.isArray(state.savedStories) ? state.savedStories : [];
  elements.storyHistory.hidden = !stories.length;
  elements.storyHistory.innerHTML = stories.map((story) => {
    const date = story.createdAt ? new Date(story.createdAt).toLocaleString() : "";
    const words = Array.isArray(story.targetWords) && story.targetWords.length ? story.targetWords.join(", ") : story.theme || "";
    return `
      <button class="story-history-item" type="button" data-story-id="${escapeHtml(story.id)}">
        <span>
          <strong>${escapeHtml(story.title || "Bedtime Story")}</strong>
          <span>${escapeHtml(words)}</span>
        </span>
        <small>${escapeHtml(date)}</small>
      </button>
    `;
  }).join("");
}

function showSavedStory(storyId) {
  const story = state.savedStories.find((item) => item.id === storyId);
  if (!story) return;
  renderStory(story);
  elements.storyStatus.textContent = `Loaded saved story: ${story.title || "Bedtime Story"}.`;
}

async function playStoryText(text, lang) {
  if (!text) return;
  try {
    await speakGeneratedAudio(text, lang);
  } catch (error) {
    elements.storyStatus.textContent = `Story TTS failed: ${error.message}. Using browser voice.`;
    await speakText(text, { lang, rate: lang === "zh-CN" ? 0.9 : 0.86 });
  }
}

async function playCurrentStory() {
  const story = state.savedStories.find((item) => item.id === activeStoryId) || state.savedStories[0];
  if (!story) {
    elements.storyStatus.textContent = "No saved story to play.";
    return;
  }
  clearTimeout(autoTimer);
  window.speechSynthesis?.cancel();
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  elements.playStoryBtn.disabled = true;
  elements.storyStatus.textContent = `Playing story: ${story.title || "Bedtime Story"}.`;
  try {
    for (const pair of storyLinePairs(story)) {
      await playStoryText(pair.english, "en-US");
      await playStoryText(pair.chinese, "zh-CN");
    }
    elements.storyStatus.textContent = "Story playback finished.";
  } finally {
    elements.playStoryBtn.disabled = false;
  }
}

async function generateStory() {
  const targetWords = deck.slice(state.currentIndex, state.currentIndex + 6).map((word) => word.word);
  const payload = {
    ageRange: elements.storyAgeInput.value.trim() || "6-8",
    englishLevel: elements.storyLevelSelect.value,
    theme: elements.storyThemeInput.value.trim() || "a gentle bedtime adventure",
    targetWords
  };
  const estimatedTokens = 1200 + targetWords.length * 20;
  elements.storyOutput.hidden = false;
  elements.storyOutput.textContent = `正在生成 AI 睡前故事，预计消耗约 ${estimatedTokens} AI Token...`;
  elements.storyStatus.textContent = "AI 正在创作短故事，通常需要 5-30 秒。";
  try {
    const response = await fetch("/api/ai/story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`${data.error || "Story generation failed"}${data.code ? ` (${data.code})` : ""}`);
    elements.storyOutput.innerHTML = `
      <strong>${escapeHtml(data.title || "Bedtime Story")}</strong>
      <p>${escapeHtml(data.story_en || data.english || "").replace(/\n/g, "<br>")}</p>
      <p>${escapeHtml(data.story_zh || data.chinese || "").replace(/\n/g, "<br>")}</p>
    `;
    const story = {
      id: `story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: data.title || "Bedtime Story",
      english: data.story_en || data.english || "",
      chinese: data.story_zh || data.chinese || "",
      ageRange: payload.ageRange,
      englishLevel: payload.englishLevel,
      theme: payload.theme,
      targetWords,
      provider: data.provider || "",
      tokens: data.usage?.total_tokens || data.chargedTokens || estimatedTokens,
      createdAt: Date.now()
    };
    state.savedStories = [story, ...(state.savedStories || [])].slice(0, 20);
    saveState();
    renderStory(story);
    renderStoryHistory();
    elements.storyStatus.textContent = `故事生成完成，消耗 ${data.usage?.total_tokens || data.chargedTokens || estimatedTokens} AI Token。`;
  } catch (error) {
    elements.storyOutput.textContent = "AI 故事服务暂时不可用，请稍后再试。";
    elements.storyStatus.textContent = `AI 故事服务暂时不可用。${error.message ? `原因：${error.message}` : ""}`;
  }
}

async function generateAiExamples() {
  const word = currentWord();
  if (!word) {
    elements.voiceStatus.textContent = "没有可生成例句的当前单词。";
    return;
  }
  elements.voiceStatus.textContent = `AI 正在为 ${word.word} 生成真实场景短句...`;
  try {
    const response = await fetch("/api/ai/examples", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        word: word.word,
        meaning: word.meaning,
        phonetic: word.phonetic,
        level: word.level,
        topics: word.topics,
        learnerProfile: currentProfile().label,
        currentTopic: topics.find((topic) => topic.id === state.selectedTopic)?.name || state.selectedTopic,
        existingExamples: currentWordAllExamples(word),
        shortTextContext: elements.readerInput.value.trim().slice(0, 1200)
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 405) {
        throw new Error("server is still running an old version; restart server.js to enable /api/ai/examples");
      }
      throw new Error(`${data.error || "AI examples failed"}${data.code ? ` (${data.code})` : ""}`);
    }
    const examples = normalizeGeneratedExamples(data.examples);
    if (examples.length < 3) throw new Error("AI did not return enough examples.");
    const existingRecord = state.aiExamples[word.id] || {};
    const pages = generatedExamplePages(word);
    pages.push(examples);
    const chargedTokens = Number(data.chargedTokens || data.usage?.total_tokens || 0);
    const savedExampleSet = {
      id: `examples-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      wordId: word.id,
      word: word.word,
      meaning: word.meaning,
      examples,
      provider: data.provider || "",
      tokens: chargedTokens,
      createdAt: Date.now()
    };
    state.aiExamples[word.id] = {
      pages,
      provider: data.provider || "",
      chargedTokens: (Number(existingRecord.chargedTokens) || 0) + chargedTokens,
      generatedAt: Date.now()
    };
    state.savedAiExamples = [savedExampleSet, ...(state.savedAiExamples || [])].slice(0, 100);
    state.examplePageByWord[word.id] = pages.length;
    saveState();
    render();
    elements.voiceStatus.textContent = `AI\u4f8b\u53e5\u5df2\u4fdd\u5b58\uff1a\u5f53\u524d\u5171 ${pages.length + 1} \u9875\uff1bToken\uff1a${state.aiExamples[word.id].chargedTokens || "\u672a\u77e5"}\u3002`;
    /*
    elements.voiceStatus.textContent = `AI 例句已生成：${examples.length} 条；Token：${state.aiExamples[word.id].chargedTokens || "未知"}。`;
    */
  } catch (error) {
    elements.voiceStatus.textContent = `AI 例句暂时不可用：${error.message}`;
  }
}

function shiftMonth(amount) {
  const [year, month] = (state.calendarMonth || monthKey()).split("-").map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  state.calendarMonth = monthKey(date);
  saveState();
  renderCalendar();
}

function bindEvents() {
  $("#playBtn").addEventListener("click", playCurrent);
  $("#nextBtn").addEventListener("click", nextWord);
  $("#prevBtn").addEventListener("click", prevWord);
  $("#nextExamplePageBtn").addEventListener("click", () => shiftExamplePage(1));
  $("#prevExamplePageBtn").addEventListener("click", () => shiftExamplePage(-1));
  $("#knownBtn").addEventListener("click", () => track("known"));
  $("#completeBtn").addEventListener("click", markComplete);
  $("#repeatBtn").addEventListener("click", () => track("repeat"));
  $("#favoriteBtn").addEventListener("click", () => track("favorite"));
  $("#skipBtn").addEventListener("click", () => { track("skip"); nextWord(); });
  $("#aiExamplesBtn").addEventListener("click", generateAiExamples);
  $("#recommendBtn").addEventListener("click", () => buildDeck("recommend"));
  $("#aiConversationBtn").addEventListener("click", () => {
    $("#aiConversationPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#reloadVoicechatBtn").addEventListener("click", () => {
    const frame = $("#voicechatFrame");
    frame.src = frame.src;
  });
  $("#reviewBtn").addEventListener("click", () => buildDeck("review"));
  $("#cardSheetBtn").addEventListener("click", openCardSheetModal);
  $("#cardSheetInlineBtn").addEventListener("click", openCardSheetModal);
  $("#closeCardSheetBtn").addEventListener("click", closeCardSheetModal);
  $("#generateCardSheetBtn").addEventListener("click", generateCardSheet);
  $("#aiCardSheetBtn").addEventListener("click", generateAiCardSheet);
  $("#prevAiCardSheetBtn").addEventListener("click", () => showAiCardSheetRecord(-1));
  $("#nextAiCardSheetBtn").addEventListener("click", () => showAiCardSheetRecord(1));
  $("#useCurrentCardBtn").addEventListener("click", () => {
    elements.cardSeedInput.value = currentWord()?.word || "";
    elements.customCardWordsInput.value = "";
    generateCardSheet();
  });
  $("#printCardSheetBtn").addEventListener("click", () => {
    if (!elements.cardSheetPreview.children.length) generateCardSheet();
    document.body.classList.add("printing-card-sheet");
    window.print();
  });
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("printing-card-sheet");
  });
  elements.cardCountInput.addEventListener("input", () => {
    $("#generateCardSheetBtn").textContent = `生成 ${Math.max(4, Math.min(24, Number(elements.cardCountInput.value) || 10))} 张`;
  });
  $("#masteredLibraryBtn").addEventListener("click", () => {
    elements.masteredPanel.hidden = !elements.masteredPanel.hidden;
    renderMasteredLibrary();
  });
  $("#addRandomBtn").addEventListener("click", addRandomWords);
  $("#analyzeTextBtn").addEventListener("click", analyzeReaderText);
  $("#readTextBtn").addEventListener("click", readReaderText);
  $("#translateTextBtn").addEventListener("click", translateReaderText);
  elements.startSpeechBtn.addEventListener("click", toggleSpeechRecording);
  elements.translateSpeechBtn.addEventListener("click", translateSpokenChinese);
  elements.playTranslationBtn.addEventListener("click", () => {
    if (currentSpeechTranslation) speakText(currentSpeechTranslation, { lang: "en-US" });
  });
  $("#generateStoryBtn").addEventListener("click", generateStory);
  $("#playStoryBtn").addEventListener("click", playCurrentStory);
  elements.storyHistory.addEventListener("click", (event) => {
    const button = event.target.closest("[data-story-id]");
    if (button) showSavedStory(button.dataset.storyId);
  });
  $("#addReaderWordsBtn").addEventListener("click", addReaderWordsToLibrary);
  $("#playGeneratedBtn").addEventListener("click", () => {
    if (generatedReaderAudioUrl) playAudioFile(generatedReaderAudioUrl);
  });
  elements.readerOutput.addEventListener("click", (event) => {
    const button = event.target.closest("[data-reader-word]");
    if (button) toggleReaderWord(button.dataset.readerWord);
  });
  elements.masteredList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-restore]");
    if (button) restoreMasteredWord(button.dataset.restore);
  });
  $("#prevMonthBtn").addEventListener("click", () => shiftMonth(-1));
  $("#nextMonthBtn").addEventListener("click", () => shiftMonth(1));
  $("#testVoiceBtn").addEventListener("click", async () => {
    const preset = selectedCloudPreset();
    if (preset) {
      await speakWithCloudTts("Hello, welcome to Word Garden.", preset.lang).catch(() => speakText("Hello, welcome to Word Garden.", { lang: preset.lang }));
      return;
    }
    const played = await playAudioFile("./audio/test-voice.wav").then(() => true).catch(() => false);
    if (!played) speakText("Hello, welcome to Word Garden.");
  });
  $("#refreshVoicesBtn").addEventListener("click", loadVoices);
  elements.cloudVoiceButtons?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-voice-preset]");
    if (!button) return;
    state.voiceName = button.dataset.voicePreset;
    const preset = selectedCloudPreset();
    elements.voiceSelect.value = state.voiceName;
    elements.voiceStatus.textContent = `Cloud TTS selected: ${preset.label}`;
    renderCloudVoiceButtons();
    saveState();
  });
  elements.voiceSelect.addEventListener("change", (event) => {
    state.voiceName = event.target.value;
    const preset = selectedCloudPreset();
    if (preset) elements.voiceStatus.textContent = `Cloud TTS selected: ${preset.label}`;
    renderCloudVoiceButtons();
    saveState();
  });
  elements.repeatInput.addEventListener("change", (event) => {
    state.repeatCount = Math.max(1, Math.min(8, Number(event.target.value) || 1));
    saveState();
    render();
  });
  elements.secondsInput.addEventListener("change", (event) => {
    state.switchSeconds = Math.max(3, Math.min(60, Number(event.target.value) || 8));
    saveState();
    render();
  });
  elements.autoPlayToggle.addEventListener("change", (event) => {
    state.autoPlay = event.target.checked;
    saveState();
    render();
  });
  elements.profileSelect.addEventListener("change", (event) => {
    applyProfile(event.target.value);
    elements.addResult.textContent = `Profile: ${currentProfile().label}. Random words will target ${difficultyText()}.`;
  });
  elements.difficultySlider.addEventListener("input", (event) => {
    state.randomDifficulty = Number(event.target.value);
    elements.difficultyLabel.textContent = `${currentProfile().label} · ${difficultyText()}`;
    saveState();
  });
  if ("speechSynthesis" in window) window.speechSynthesis.onvoiceschanged = loadVoices;
}

async function init() {
  state.calendarMonth = state.calendarMonth || monthKey();
  clampProfileDifficulty();
  bindEvents();
  await loadWordBank();
  renderTopics();
  loadVoices();
  renderStoryHistory();
  if (state.savedStories.length) renderStory(state.savedStories[0]);
  buildDeck();
  track("view");
}

init().catch((error) => {
  elements.voiceStatus.textContent = `加载词库失败：${error.message}`;
});
