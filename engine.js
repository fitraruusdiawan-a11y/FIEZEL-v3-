// FIEZEL — Local Adaptive Engine
// 100% offline question generation. No API keys, no network calls after first load.

const Engine = (() => {
  let V = null, R = null, G = null;
  const dataBase = new URL('../data/', document.currentScript.src).href;

  async function loadJSON(name) {
    const res = await fetch(dataBase + name);
    if (!res.ok) throw new Error('Gagal memuat ' + name);
    return res.json();
  }

  const ready = Promise.all([
    loadJSON('vocabulary.json'),
    loadJSON('reading-bank.json'),
    loadJSON('grammar-templates.json'),
  ]).then(([v, r, g]) => { V = v; R = r; G = g; });

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

  // Slot substitution so the same 19 grammar templates don't feel identical
  // on every repeat. Swaps a small set of nouns for lexical variety.
  const SWAPS = [
    [['the project'], ['the assignment', 'the proposal', 'the plan']],
    [['the report'], ['the summary', 'the essay', 'the document']],
    [['the task'], ['the job', 'the chore', 'the assignment']],
    [['the course'], ['the workshop', 'the class', 'the program']],
    [['the meeting'], ['the interview', 'the session', 'the call']],
  ];
  function varySentence(s) {
    let out = s;
    for (const [froms, tos] of SWAPS) {
      for (const from of froms) {
        if (out.includes(from) && Math.random() < 0.5) {
          out = out.replace(from, pick(tos));
        }
      }
    }
    return out;
  }

  function vocabQuestion(target) {
    const word = target || pick(V);
    const pool = V.filter(x => x.id !== word.id && x.meaning !== word.meaning && x.level === word.level);
    let distractors = shuffle(pool).slice(0, 3).map(x => x.meaning);
    if (distractors.length < 3) {
      // widen the pool across adjacent levels if this level is sparse
      const widerPool = V.filter(x => x.id !== word.id && x.meaning !== word.meaning);
      distractors = shuffle([...new Set([...distractors, ...widerPool.map(x => x.meaning)])]).slice(0, 3);
    }
    const options = shuffle([word.meaning, ...distractors]);
    return {
      kind: 'vocab',
      topic: 'Vocabulary',
      subskill: 'vocabulary_meaning',
      level: word.level,
      prompt: `Apa arti kata "${word.word}" yang paling tepat?`,
      blank: false,
      options,
      answerIndex: options.indexOf(word.meaning),
      rule: `Vocabulary ${word.level} — ${word.partOfSpeech || 'word'}`,
      why: `"${word.word}" berarti "${word.meaning}".${word.example ? ' Contoh: ' + word.example : ''}`,
      whyWrong: 'Pilihan lain adalah arti dari kata yang berbeda maknanya.',
      howToAvoid: 'Jangan menebak dari kemiripan bentuk kata. Periksa konteks dan kelas katanya.',
      correctiveAction: `Buat satu kalimat baru memakai "${word.word}" dengan arti "${word.meaning}".`,
      vocabId: word.id,
    };
  }

  function grammarQuestion(subskillKey) {
    const keys = Object.keys(G);
    const key = keys.includes(subskillKey) ? subskillKey : pick(keys);
    const [sentence, opts, ansIdx, rule] = pick(G[key]);
    const question = varySentence(sentence);
    const shuffled = shuffle(opts.map((x, i) => ({ x, ok: i === ansIdx })));
    return {
      kind: 'grammar',
      topic: key.replace(/_/g, ' '),
      subskill: key,
      level: null,
      prompt: question,
      blank: true,
      options: shuffled.map(o => o.x),
      answerIndex: shuffled.findIndex(o => o.ok),
      rule,
      why: `Jawaban ini sesuai pola "${rule}"`,
      whyWrong: 'Pilihan lain melanggar pola grammar pada kalimat ini.',
      howToAvoid: 'Kenali penanda waktu/konteks kalimat sebelum memilih bentuk kata.',
      correctiveAction: `Ucapkan ulang kalimat lengkapnya dengan jawaban yang benar.`,
    };
  }

  function chooseReadingIndex(cefr) {
    const pool = R.map((x, i) => ({ x, i })).filter(o => o.x.level === cefr);
    return pool.length ? pick(pool).i : Math.floor(Math.random() * R.length);
  }

  function readingPassage(i) {
    const base = R[i];
    const qs = shuffle(base.qs).map(q => {
      const shuffled = shuffle(q[1].map((x, j) => ({ x, ok: j === q[2] })));
      return { prompt: q[0], options: shuffled.map(o => o.x), answerIndex: shuffled.findIndex(o => o.ok) };
    });
    return { index: i, level: base.level, title: base.title, text: base.text, questions: qs };
  }

  return {
    ready,
    get vocabList() { return V; },
    get readingList() { return R; },
    get grammarTopics() { return G ? Object.keys(G) : []; },
    vocabQuestion, grammarQuestion, chooseReadingIndex, readingPassage,
    pick, shuffle,
  };
})();
