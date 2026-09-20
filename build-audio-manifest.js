const fs = require("fs");

const bank = JSON.parse(fs.readFileSync("word-bank.json", "utf8"));
const enVoice = "Microsoft Zira Desktop";
const zhVoice = "Microsoft Huihui Desktop";

function levelDifficulty(level) {
  if (level === "C1") return 78;
  if (level === "B2") return 66;
  if (level === "B1") return 50;
  if (level === "A2") return 34;
  return 20;
}

function normalizeWord(word, index = 0) {
  const normalized = {
    difficulty: levelDifficulty(word.level),
    rank: 3000 + index,
    level: "A1",
    phonetic: `/${word.word}/`,
    sentence: `I want to learn the word ${word.word} today.`,
    translation: `我今天想学习“${word.meaning}”这个词。`,
    ...word
  };
  normalized.examples = normalizeExamples(normalized);
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
  return [first, ...exampleTemplates(word)].slice(0, 3);
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

const words = [
  ...bank.baseWords.map((word, index) => normalizeWord(word, index)),
  ...bank.wordPool.map((word, index) => normalizeWord(word, index + bank.baseWords.length))
];

const items = [];
for (const word of words) {
  items.push({ file: `${word.id}-word.wav`, text: word.word, voice: enVoice });
  items.push({ file: `${word.id}-meaning.wav`, text: word.meaning, voice: zhVoice });
  word.examples.forEach((example, index) => {
    const n = index + 1;
    items.push({ file: `${word.id}-sentence-${n}.wav`, text: example.sentence, voice: enVoice });
    items.push({ file: `${word.id}-translation-${n}.wav`, text: example.translation, voice: zhVoice });
  });
}
items.push({ file: "test-voice.wav", text: "Hello, welcome to Word Garden.", voice: enVoice });

fs.writeFileSync("audio-manifest.json", JSON.stringify(items, null, 2), "utf8");
console.log(`audio manifest: ${items.length} items`);
