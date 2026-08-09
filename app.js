// FIEZEL — App shell (state, navigation, quiz sessions)
const $id = id => document.getElementById(id);
const esc = s => (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const LEVEL_LABELS = { A1: 'Pemula (A1)', A2: 'Dasar (A2)', B1: 'Menengah (B1)', B2: 'Menengah Atas (B2)', C1: 'Mahir (C1)' };

const DEFAULT_STATE = {
  level: 'A1',
  totalAnswered: 0,
  totalCorrect: 0,
  vocabStatus: {},      // id -> 'seen' | 'learning' | 'mastered'
  vocabMistakes: {},    // id -> count
  grammarStats: {},     // subskill -> {correct, total}
  readingStats: {},     // level -> {attempts, accuracy}
  fingerprints: [],
};

let state = load();
let session = null;

function load() {
  try {
    const raw = localStorage.getItem('fiezel_state_v3');
    if (!raw) return structuredClone(DEFAULT_STATE);
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch (e) { return structuredClone(DEFAULT_STATE); }
}
function save() { localStorage.setItem('fiezel_state_v3', JSON.stringify(state)); }

function go(view) {
  document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
  const el = $id('n-' + view);
  if (el) el.classList.add('active');
  $id('nav').classList.remove('hidden');
  ({ home, grammar, vocab, reading, profile })[view]?.();
  window.scrollTo(0, 0);
}

// ---------- HOME ----------
function home() {
  const acc = state.totalAnswered ? Math.round(state.totalCorrect / state.totalAnswered * 100) : 0;
  const mastered = Object.values(state.vocabStatus).filter(s => s === 'mastered').length;
  const vocabTotal = Engine.vocabList?.length ?? 0;
  const readingTotal = Engine.readingList?.length ?? 0;
  $id('app').innerHTML = `
  <section class="fade">
    <div class="card p-6 mb-5">
      <span class="badge">⚡ FIEZEL — Local Adaptive Engine</span>
      <h1 class="hero">Belajar Bahasa Inggris<br><span class="accent">Sepenuhnya Offline.</span></h1>
      <p class="sub">Semua soal dibuat dari data lokal di perangkatmu. Tidak ada API key, tidak ada koneksi yang dibutuhkan setelah halaman ini dimuat.</p>
      <div class="grid gap-3">
        <button class="btn primary w-full" onclick="startPlacement()">🎯 Tes Penempatan Level</button>
        <button class="btn secondary w-full" onclick="go('grammar')">🧩 Latihan Grammar</button>
        <button class="btn secondary w-full" onclick="go('vocab')">🧠 Vocabulary Hub (${vocabTotal.toLocaleString('id-ID')} kata)</button>
        <button class="btn secondary w-full" onclick="go('reading')">📖 Reading (${readingTotal} bacaan)</button>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-4 mb-4">
      <div class="card p-5"><small class="label">LEVEL</small><div class="stat">${LEVEL_LABELS[state.level]}</div></div>
      <div class="card p-5"><small class="label">VOCAB DIKUASAI</small><div class="stat green">${mastered}</div></div>
    </div>
    <div class="card p-5"><div class="flex justify-between mb-3"><b>Akurasi Keseluruhan</b><b class="green">${acc}%</b></div>
      <div class="progress"><div class="fill" style="width:${acc}%"></div></div></div>
  </section>`;
}

// ---------- QUIZ SESSION (shared by grammar & placement) ----------
function quizFrame(title) {
  $id('nav').classList.add('hidden');
  $id('app').innerHTML = `
  <section class="fade">
    <div class="flex items-center justify-between mb-4 card p-3 pl-4">
      <button class="linklike" onclick="exitSession()">← Keluar</button>
      <div class="text-center flex-1 px-2">
        <div class="eyebrow" id="qtopic">${esc(title)}</div>
        <div class="qnum" id="qnumText"></div>
      </div>
      <div class="streak">🔥 <span id="streak">0</span></div>
    </div>
    <div class="progress mb-6"><div id="qfill" class="fill" style="width:0%"></div></div>
    <div id="question" class="question"></div>
    <div id="opts" class="grid gap-3"></div>
    <div id="feedback" class="hidden card p-5 mt-6 feedback">
      <b id="ftitle" class="ftitle"></b>
      <p id="frule" class="frule"></p>
      <p id="fwhy" class="fwhy"></p>
      <div id="fstrategy" class="fstrategy"></div>
    </div>
  </section>`;
}

function startPlacement() {
  session = { type: 'placement', index: 0, total: 20, score: 0, streak: 0, queue: buildPlacementQueue() };
  quizFrame('Tes Penempatan');
  renderQuestion();
}
function buildPlacementQueue() {
  const topics = Engine.grammarTopics;
  const qs = [];
  for (let i = 0; i < 20; i++) qs.push(Engine.grammarQuestion(Engine.pick(topics)));
  return qs;
}

function startGrammarSession(subskill) {
  session = { type: 'grammar', index: 0, total: 10, score: 0, streak: 0, subskill, queue: [] };
  for (let i = 0; i < 10; i++) session.queue.push(Engine.grammarQuestion(subskill));
  quizFrame(subskill.replace(/_/g, ' '));
  renderQuestion();
}

function startVocabQuiz() {
  const V = Engine.vocabList;
  const seenIds = Object.keys(state.vocabStatus).filter(id => state.vocabStatus[id] !== 'unseen');
  let pool = V.filter(x => seenIds.includes(x.id));
  if (!pool.length) pool = V;
  pool = [...pool].sort((a, b) => (state.vocabMistakes[b.id] || 0) - (state.vocabMistakes[a.id] || 0));
  session = { type: 'vocab', index: 0, total: 10, score: 0, streak: 0, queue: [] };
  for (let i = 0; i < 10; i++) session.queue.push(Engine.vocabQuestion(pool[i % pool.length] || Engine.pick(V)));
  quizFrame('Vocabulary Quiz');
  renderQuestion();
}

function renderQuestion() {
  const q = session.queue[session.index];
  session.current = q;
  $id('qnumText').textContent = `Soal ${session.index + 1}/${session.total}`;
  $id('qfill').style.width = `${(session.index) / session.total * 100}%`;
  $id('qtopic').textContent = q.topic;
  $id('feedback').classList.add('hidden');
  const displayPrompt = q.blank ? esc(q.prompt).replace('___', '<span class="blank"></span>') : esc(q.prompt);
  $id('question').innerHTML = displayPrompt;
  const optsEl = $id('opts');
  optsEl.innerHTML = '';
  q.options.forEach((opt, j) => {
    const b = document.createElement('button');
    b.className = 'option';
    b.textContent = opt;
    b.onclick = () => answer(j);
    optsEl.appendChild(b);
  });
}

function answer(j) {
  const q = session.current;
  document.querySelectorAll('#opts button').forEach(b => b.disabled = true);
  const buttons = document.querySelectorAll('#opts button');
  const ok = j === q.answerIndex;
  state.totalAnswered++;
  state.fingerprints.push(q.prompt);
  state.fingerprints = state.fingerprints.slice(-30);

  if (q.kind === 'grammar') {
    const s = state.grammarStats[q.subskill] ??= { correct: 0, total: 0 };
    s.total++;
  }
  if (q.kind === 'vocab') {
    state.vocabStatus[q.vocabId] = ok
      ? (state.vocabStatus[q.vocabId] === 'learning' ? 'mastered' : 'learning')
      : 'learning';
    if (!ok) state.vocabMistakes[q.vocabId] = (state.vocabMistakes[q.vocabId] || 0) + 1;
  }

  if (ok) {
    state.totalCorrect++;
    session.score++;
    session.streak++;
    buttons[j].classList.add('correct');
    if (q.kind === 'grammar') state.grammarStats[q.subskill].correct++;
    $id('ftitle').textContent = '✓ Tepat';
    $id('ftitle').className = 'ftitle ok';
  } else {
    session.streak = 0;
    buttons[j].classList.add('wrong');
    buttons[q.answerIndex].classList.add('correct');
    $id('ftitle').textContent = '✕ Belum tepat';
    $id('ftitle').className = 'ftitle bad';
  }
  $id('streak').textContent = session.streak;
  $id('frule').textContent = q.rule;
  $id('fwhy').textContent = ok ? q.why : `Jawaban benar: ${q.options[q.answerIndex]}. ${q.why}`;
  $id('fstrategy').textContent = q.howToAvoid || '';
  $id('feedback').classList.remove('hidden');
  save();

  setTimeout(() => {
    session.index++;
    if (session.index >= session.total) finishSession();
    else renderQuestion();
  }, 1100);
}

function finishSession() {
  const acc = Math.round(session.score / session.total * 100);
  if (session.type === 'placement') {
    const idx = Math.max(0, Math.min(LEVELS.length - 1, Math.round(acc / 100 * (LEVELS.length - 1))));
    state.level = LEVELS[idx];
    save();
  }
  $id('nav').classList.remove('hidden');
  $id('app').innerHTML = `
  <section class="fade text-center py-12">
    <div class="text-5xl">🎉</div>
    <h2 class="hero" style="font-size:1.8rem">Sesi Selesai</h2>
    <div class="bigscore">${acc}%</div>
    <p class="sub">${session.score} dari ${session.total} jawaban benar.</p>
    ${session.type === 'placement' ? `<p class="sub">Level kamu: <b>${LEVEL_LABELS[state.level]}</b></p>` : ''}
    <button class="btn primary w-full" onclick="go('home')">Kembali ke Beranda</button>
  </section>`;
  session = null;
}

function exitSession() {
  session = null;
  $id('nav').classList.remove('hidden');
  go('home');
}

// ---------- GRAMMAR ----------
function grammar() {
  const topics = Engine.grammarTopics;
  $id('app').innerHTML = `
  <section class="fade">
    <h2 class="section-title">Latihan Grammar</h2>
    <p class="sub mb-4">Pilih topik untuk latihan 10 soal.</p>
    <div class="grid gap-3" id="glist"></div>
  </section>`;
  const list = $id('glist');
  topics.forEach(t => {
    const s = state.grammarStats[t];
    const acc = s?.total ? Math.round(s.correct / s.total * 100) : null;
    const d = document.createElement('button');
    d.className = 'card p-5 text-left listcard';
    d.innerHTML = `<b class="cap">${esc(t.replace(/_/g, ' '))}</b>${acc !== null ? `<p class="sub2">Akurasi: ${acc}%</p>` : `<p class="sub2">Belum dicoba</p>`}`;
    d.onclick = () => startGrammarSession(t);
    list.appendChild(d);
  });
}

// ---------- VOCAB ----------
function vocab() {
  const V = Engine.vocabList;
  $id('app').innerHTML = `
  <section class="fade">
    <div class="flex justify-between items-center gap-3 mb-6">
      <div>
        <h2 class="section-title">Vocabulary Hub</h2>
        <p class="sub2">${V.length.toLocaleString('id-ID')} kosakata bertingkat A1–C1.</p>
      </div>
      <button class="btn primary text-xs" onclick="startVocabQuiz()">Uji Kuis 🎯</button>
    </div>
    <div class="grid gap-3" id="vlist"></div>
  </section>`;
  const groups = { A1: [], A2: [], B1: [], B2: [], C1: [] };
  V.forEach(x => (groups[x.level] || groups.B1).push(x));
  const list = $id('vlist');
  Object.entries(groups).filter(([, a]) => a.length).forEach(([lvl, arr]) => {
    const mastered = arr.filter(x => state.vocabStatus[x.id] === 'mastered').length;
    const d = document.createElement('button');
    d.className = 'card p-5 text-left listcard';
    d.innerHTML = `<div class="flex justify-between"><b>${lvl}</b><span class="green">${mastered}/${arr.length} dikuasai</span></div><p class="sub2">${arr.length} kata · tap untuk flashcards</p>`;
    d.onclick = () => flashcards(arr);
    list.appendChild(d);
  });
}

function flashcards(list) {
  let i = 0;
  let flipped = false;
  function render() {
    const w = list[i];
    $id('app').innerHTML = `
    <section class="fade">
      <div class="flex justify-between mb-4"><button class="linklike" onclick="go('vocab')">← Keluar</button><span class="sub2">${i + 1}/${list.length}</span></div>
      <div class="flashcard ${flipped ? 'flipped' : ''}" id="fcard">
        <div class="face front"><div class="fcword">${esc(w.word)}</div>${w.phonetic ? `<div class="fcphon">${esc(w.phonetic)}</div>` : ''}</div>
        <div class="face back"><div class="fcmeaning">${esc(w.meaning)}</div>${w.example ? `<div class="fcex">${esc(w.example)}</div>` : ''}</div>
      </div>
      <p class="sub2 text-center mt-3">Tap kartu untuk membalik</p>
      <div class="grid grid-cols-2 gap-3 mt-5">
        <button class="btn secondary" onclick="fcMark('${w.id}','learning')">Masih belajar</button>
        <button class="btn primary" onclick="fcMark('${w.id}','mastered')">Sudah hafal</button>
      </div>
    </section>`;
    $id('fcard').onclick = () => { flipped = !flipped; render(); };
  }
  window.fcMark = (id, status) => {
    state.vocabStatus[id] = status;
    save();
    i = Math.min(i + 1, list.length - 1);
    flipped = false;
    if (i === list.length - 1 && (state.vocabStatus[id])) render();
    else render();
  };
  render();
}

// ---------- READING ----------
function reading() {
  const R = Engine.readingList;
  $id('app').innerHTML = `
  <section class="fade">
    <div class="flex items-center justify-between gap-3 mb-2">
      <h2 class="section-title">Reading Comprehension</h2>
      <button class="btn primary text-xs" onclick="readSession(Engine.chooseReadingIndex(state.level))">⚡ Adaptif</button>
    </div>
    <p class="sub2 mb-5">${R.length} bacaan · level A1–C1.</p>
    <div class="grid gap-3" id="rlist"></div>
  </section>`;
  const groups = { A1: [], A2: [], B1: [], B2: [], C1: [] };
  R.forEach((x, i) => (groups[x.level] || groups.B1).push(i));
  const list = $id('rlist');
  Object.entries(groups).forEach(([lvl, idxs]) => {
    if (!idxs.length) return;
    const d = document.createElement('button');
    d.className = 'card p-5 text-left listcard';
    d.innerHTML = `<b>${lvl}</b><p class="sub2">${idxs.length} bacaan · ${idxs.length * 5} pertanyaan</p>`;
    d.onclick = () => readSession(Engine.pick(idxs));
    list.appendChild(d);
  });
}

function readSession(i) {
  const passage = Engine.readingPassage(i);
  let n = 0, score = 0;
  $id('nav').classList.add('hidden');
  function render() {
    const q = passage.questions[n];
    $id('app').innerHTML = `
    <section class="fade">
      <div class="flex justify-between mb-5"><button class="linklike" onclick="go('reading')">← Keluar</button><b>${passage.level}</b><span class="sub2">${n + 1}/${passage.questions.length}</span></div>
      <div class="card p-5 mb-6"><h3 class="cap">${esc(passage.title)}</h3><p class="passage">${esc(passage.text)}</p></div>
      <h2 class="question" style="font-size:1.2rem">${esc(q.prompt)}</h2>
      <div id="ropts" class="grid gap-3"></div>
      <div id="rfeedback" class="hidden card p-4 mt-5 feedback"><b id="rftitle" class="ftitle"></b><p id="rftext" class="fwhy"></p></div>
    </section>`;
    q.options.forEach((o, j) => {
      const b = document.createElement('button');
      b.className = 'option';
      b.textContent = o;
      b.onclick = () => {
        document.querySelectorAll('#ropts button').forEach(x => x.disabled = true);
        const ok = j === q.answerIndex;
        if (ok) {
          b.classList.add('correct'); score++;
          $id('rftitle').textContent = '✓ Tepat'; $id('rftitle').className = 'ftitle ok';
          $id('rftext').textContent = 'Jawabanmu sesuai dengan informasi dalam bacaan.';
        } else {
          b.classList.add('wrong');
          document.querySelectorAll('#ropts button')[q.answerIndex].classList.add('correct');
          $id('rftitle').textContent = '✕ Belum tepat'; $id('rftitle').className = 'ftitle bad';
          $id('rftext').textContent = `Jawaban benar: ${q.options[q.answerIndex]}. Cari bukti kalimatnya di bacaan.`;
        }
        $id('rfeedback').classList.remove('hidden');
        setTimeout(() => {
          n++;
          if (n >= passage.questions.length) {
            $id('nav').classList.remove('hidden');
            const acc = Math.round(score / passage.questions.length * 100);
            const key = passage.level.toLowerCase();
            state.readingStats[key] ??= { attempts: 0, accuracy: 0 };
            state.readingStats[key].attempts++;
            state.readingStats[key].accuracy = Math.round((state.readingStats[key].accuracy + acc) / 2);
            save();
            $id('app').innerHTML = `
            <section class="fade text-center py-12">
              <div class="text-5xl">📖</div>
              <h2 class="hero" style="font-size:1.8rem">Reading Selesai</h2>
              <div class="bigscore">${acc}%</div>
              <button class="btn primary w-full" onclick="readSession(${i})">🔄 Ulangi bacaan ini</button>
              <button class="btn secondary w-full mt-3" onclick="go('reading')">Bacaan lain</button>
            </section>`;
          } else render();
        }, 1100);
      };
      $id('ropts').appendChild(b);
    });
  }
  render();
}

// ---------- PROFILE ----------
function profile() {
  const rows = Object.entries(state.grammarStats).filter(([, x]) => x.total)
    .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total).slice(0, 8);
  $id('app').innerHTML = `
  <section class="fade">
    <h2 class="section-title">Profil Pembelajar</h2>
    <p class="sub2 mb-6">⚡ Local Adaptive Engine — 100% offline, tanpa API key</p>
    <div class="grid grid-cols-2 gap-4 mb-5">
      <div class="card p-5 text-center"><small class="label">LEVEL</small><div class="stat">${LEVEL_LABELS[state.level]}</div></div>
      <div class="card p-5 text-center"><small class="label">JAWABAN</small><div class="stat green">${state.totalAnswered}</div></div>
    </div>
    <div class="card p-5">
      <h3 class="cap mb-4">Materi Grammar Perlu Diperkuat</h3>
      ${rows.length ? rows.map(([k, v]) => {
        const a = Math.round(v.correct / v.total * 100);
        return `<div class="mb-4"><div class="flex justify-between text-sm mb-2"><b class="cap">${esc(k.replace(/_/g, ' '))}</b><span>${a}%</span></div><div class="progress"><div class="fill" style="width:${a}%"></div></div></div>`;
      }).join('') : `<p class="sub2">Belum ada data latihan.</p>`}
    </div>
    <div class="card p-5 mt-5">
      <h3 class="cap mb-2">Content Library</h3>
      <p class="sub2">${Engine.vocabList.length.toLocaleString('id-ID')} kosakata · ${Engine.readingList.length} bacaan · generator grammar lokal.</p>
    </div>
    <button class="btn secondary w-full mt-5 danger" onclick="resetData()">Reset seluruh progres</button>
  </section>`;
}

function resetData() {
  if (!confirm('Yakin reset seluruh progres belajar?')) return;
  state = structuredClone(DEFAULT_STATE);
  save();
  go('home');
}

// ---------- BOOT ----------
Engine.ready.then(() => go('home')).catch(err => {
  $id('app').innerHTML = `<section class="fade card p-6"><b class="bad">Gagal memuat data.</b><p class="sub2 mt-2">${esc(err.message)}</p></section>`;
  console.error(err);
});
