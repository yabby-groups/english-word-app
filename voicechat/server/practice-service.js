const PROMPTS = {
  sentence: {
    beginner: [
      'I like to read books after dinner.',
      'The weather is warm and sunny today.',
      'My sister walks to school every morning.',
      'Could I have a glass of water, please?',
    ],
    intermediate: [
      'Learning a language becomes easier when you practice every day.',
      'The train was delayed, so we decided to take a taxi instead.',
      'She confidently explained her idea to everyone in the meeting.',
      'Although it was raining, we still enjoyed our walk through the park.',
    ],
    advanced: [
      'Consistent practice gradually transforms unfamiliar expressions into natural speech.',
      'The documentary offered a surprisingly nuanced perspective on technological progress.',
      'Effective communication requires curiosity, patience, and a willingness to reconsider assumptions.',
      'Despite the unexpected complications, the team delivered an exceptionally polished presentation.',
    ],
  },
  story: {
    beginner: [
      'Tom found a small dog near his home. The dog was cold and hungry. Tom gave it food and called its owner.',
      'Anna planted a flower in the spring. She watered it every morning. By summer, it had grown tall and bright.',
    ],
    intermediate: [
      'Maya missed her usual bus on Monday morning. Instead of feeling upset, she rented a bicycle and discovered a peaceful route along the river. She arrived at work with a smile.',
      'Daniel wanted to cook dinner for his friends. His first dish did not go as planned, but he stayed calm and tried again. Everyone loved the final meal.',
    ],
    advanced: [
      'When the neighborhood library faced closure, residents organized a weekend book fair to raise support. What began as a modest fundraiser became a celebration of local writers, musicians, and volunteers. By sunset, the community had secured the library\'s future.',
      'Elena had always avoided speaking in public, yet she agreed to present her research at an international conference. Her hands trembled at first, but the audience\'s thoughtful questions helped her find her rhythm. She left the stage eager to speak again.',
    ],
  },
};

const SENTENCE_DETAILS = {
  'I like to read books after dinner.': { translation: '我喜欢晚饭后读书。', phonetics: ['/aɪ/', '/laɪk/', '/tə/', '/riːd/', '/bʊks/', '/ˈɑːftər/', '/ˈdɪnər/'] },
  'The weather is warm and sunny today.': { translation: '今天天气温暖晴朗。', phonetics: ['/ðə/', '/ˈweðər/', '/ɪz/', '/wɔːrm/', '/ænd/', '/ˈsʌni/', '/təˈdeɪ/'] },
  'My sister walks to school every morning.': { translation: '我妹妹每天早上步行上学。', phonetics: ['/maɪ/', '/ˈsɪstər/', '/wɔːks/', '/tə/', '/skuːl/', '/ˈevri/', '/ˈmɔːrnɪŋ/'] },
  'Could I have a glass of water, please?': { translation: '请给我一杯水好吗？', phonetics: ['/kʊd/', '/aɪ/', '/hæv/', '/ə/', '/ɡlæs/', '/əv/', '/ˈwɔːtər/', '/pliːz/'] },
  'Learning a language becomes easier when you practice every day.': { translation: '每天练习会让语言学习变得更容易。', phonetics: ['/ˈlɜːrnɪŋ/', '/ə/', '/ˈlæŋɡwɪdʒ/', '/bɪˈkʌmz/', '/ˈiːziər/', '/wen/', '/juː/', '/ˈpræktɪs/', '/ˈevri/', '/deɪ/'] },
  'The train was delayed, so we decided to take a taxi instead.': { translation: '火车晚点了，所以我们决定改乘出租车。', phonetics: ['/ðə/', '/treɪn/', '/wəz/', '/dɪˈleɪd/', '/soʊ/', '/wiː/', '/dɪˈsaɪdɪd/', '/tə/', '/teɪk/', '/ə/', '/ˈtæksi/', '/ɪnˈsted/'] },
  'She confidently explained her idea to everyone in the meeting.': { translation: '她自信地向会议中的每个人解释了自己的想法。', phonetics: ['/ʃiː/', '/ˈkɑːnfɪdəntli/', '/ɪkˈspleɪnd/', '/hər/', '/aɪˈdiːə/', '/tə/', '/ˈevriwʌn/', '/ɪn/', '/ðə/', '/ˈmiːtɪŋ/'] },
  'Although it was raining, we still enjoyed our walk through the park.': { translation: '虽然下着雨，我们仍然很享受在公园里的散步。', phonetics: ['/ɔːlˈðoʊ/', '/ɪt/', '/wəz/', '/ˈreɪnɪŋ/', '/wiː/', '/stɪl/', '/ɪnˈdʒɔɪd/', '/aʊər/', '/wɔːk/', '/θruː/', '/ðə/', '/pɑːrk/'] },
  'Consistent practice gradually transforms unfamiliar expressions into natural speech.': { translation: '持续练习会逐渐把陌生表达转化为自然语言。', phonetics: ['/kənˈsɪstənt/', '/ˈpræktɪs/', '/ˈɡrædʒuəli/', '/trænsˈfɔːrmz/', '/ˌʌnfəˈmɪliər/', '/ɪkˈspreʃənz/', '/ˈɪntuː/', '/ˈnætʃərəl/', '/spiːtʃ/'] },
  'The documentary offered a surprisingly nuanced perspective on technological progress.': { translation: '这部纪录片对技术进步提出了令人意外且细致入微的观点。', phonetics: ['/ðə/', '/ˌdɑːkjuˈmentəri/', '/ˈɔːfərd/', '/sərˈpraɪzɪŋli/', '/ˈnuːɑːnst/', '/pərˈspektɪv/', '/ɑːn/', '/ˌteknəˈlɑːdʒɪkəl/', '/ˈprɑːɡres/'] },
  'Effective communication requires curiosity, patience, and a willingness to reconsider assumptions.': { translation: '有效沟通需要好奇心、耐心，以及重新审视假设的意愿。', phonetics: ['/ɪˈfektɪv/', '/kəˌmjuːnɪˈkeɪʃən/', '/rɪˈkwaɪərz/', '/ˌkjʊriˈɑːsəti/', '/ˈpeɪʃəns/', '/ænd/', '/ə/', '/ˈwɪlɪŋnəs/', '/tə/', '/ˌriːkənˈsɪdər/', '/əˈsʌmpʃənz/'] },
  'Despite the unexpected complications, the team delivered an exceptionally polished presentation.': { translation: '尽管出现了意外的复杂情况，团队仍完成了一场格外出色的演示。', phonetics: ['/dɪˈspaɪt/', '/ðə/', '/ˌʌnɪkˈspektɪd/', '/ˌkɑːmplɪˈkeɪʃənz/', '/ðə/', '/tiːm/', '/dɪˈlɪvərd/', '/ən/', '/ɪkˈsepʃənəli/', '/ˈpɑːlɪʃt/', '/ˌprezənˈteɪʃən/'] },
};

export function getPracticePrompt(type = 'sentence', difficulty = 'beginner', previous = '') {
  const safeType = type === 'story' ? 'story' : 'sentence';
  const safeDifficulty = ['beginner', 'intermediate', 'advanced'].includes(difficulty) ? difficulty : 'beginner';
  const choices = PROMPTS[safeType][safeDifficulty];
  const available = choices.filter((text) => text !== previous);
  const text = (available.length ? available : choices)[Math.floor(Math.random() * (available.length || choices.length))];
  const details = safeType === 'sentence' ? SENTENCE_DETAILS[text] : null;
  return { id: `${safeType}-${safeDifficulty}-${choices.indexOf(text)}`, type: safeType, difficulty: safeDifficulty, text, ...(details || {}) };
}

function words(text) {
  return String(text || '').toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [];
}

export function alignPracticeWords(targetText, spokenText) {
  const target = words(targetText);
  const spoken = words(spokenText);
  const rows = target.length + 1;
  const cols = spoken.length + 1;
  const cost = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) cost[i][0] = i;
  for (let j = 0; j < cols; j += 1) cost[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      cost[i][j] = Math.min(
        cost[i - 1][j] + 1,
        cost[i][j - 1] + 1,
        cost[i - 1][j - 1] + (target[i - 1] === spoken[j - 1] ? 0 : 1),
      );
    }
  }
  const aligned = [];
  let i = target.length;
  let j = spoken.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && cost[i][j] === cost[i - 1][j - 1] + (target[i - 1] === spoken[j - 1] ? 0 : 1)) {
      aligned.unshift({ word: target[i - 1], status: target[i - 1] === spoken[j - 1] ? 'good' : 'needs-work', heard: spoken[j - 1] });
      i -= 1; j -= 1;
    } else if (i > 0 && cost[i][j] === cost[i - 1][j] + 1) {
      aligned.unshift({ word: target[i - 1], status: 'missing' });
      i -= 1;
    } else {
      j -= 1;
    }
  }
  return { target, spoken, distance: cost[target.length][spoken.length], aligned };
}

export function scorePractice(targetText, spokenText, durationSeconds) {
  const comparison = alignPracticeWords(targetText, spokenText);
  const total = Math.max(comparison.target.length, 1);
  const matched = comparison.aligned.filter((item) => item.status === 'good').length;
  const accuracy = Math.round(Math.max(0, 1 - comparison.distance / Math.max(total, comparison.spoken.length, 1)) * 100);
  const completeness = Math.round(matched / total * 100);
  const wordsPerSecond = comparison.spoken.length / Math.max(Number(durationSeconds) || 1, 1);
  const fluency = Math.round(Math.max(35, 100 - Math.abs(wordsPerSecond - 2.1) * 38));
  const rhythm = Math.round(Math.max(40, Math.min(96, 86 - Math.abs(wordsPerSecond - 1.9) * 22)));
  const overall = Math.round(accuracy * 0.45 + fluency * 0.25 + completeness * 0.2 + rhythm * 0.1);
  const problemWords = comparison.aligned.filter((item) => item.status !== 'good').slice(0, 4).map((item) => item.word);
  const feedback = problemWords.length
    ? `重点再练：${problemWords.join(', ')}。先听标准发音，再放慢速度逐词跟读。`
    : overall >= 90 ? '跟读非常完整，节奏也很自然。可以提高难度继续练习。' : '单词匹配良好，再注意句子重音和自然停顿。';
  return { overall, accuracy, fluency, completeness, rhythm, wordsPerSecond: Number(wordsPerSecond.toFixed(2)), aligned: comparison.aligned, feedback };
}
