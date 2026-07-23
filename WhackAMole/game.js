(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  // Logical resolution stays 420x640; the backing store is scaled by
  // devicePixelRatio so the canvas stays sharp on Retina displays.
  const W = 420;
  const H = 640;
  const DPR = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.scale(DPR, DPR);

  const hudScore = document.getElementById('score');
  const hudTime = document.getElementById('time');
  const hudBest = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const gameover = document.getElementById('gameover');
  const finalScore = document.getElementById('finalScore');
  const finalMoles = document.getElementById('finalMoles');
  const newRecord = document.getElementById('newRecord');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const soundBtn = document.getElementById('soundBtn');
  const registerBox = document.getElementById('registerBox');
  const nameInput = document.getElementById('nameInput');
  const saveScoreBtn = document.getElementById('saveScoreBtn');
  const rankList = document.getElementById('rankList');
  const ranksBtn = document.getElementById('ranksBtn');
  const ranksOverlay = document.getElementById('ranksOverlay');
  const closeRanksBtn = document.getElementById('closeRanksBtn');
  const rankListFull = document.getElementById('rankListFull');
  const ranksStatus = document.getElementById('ranksStatus');
  const ranksStatusGO = document.getElementById('ranksStatusGO');
  const ranksLead = document.getElementById('ranksLead');
  const ranksTitleGO = document.getElementById('ranksTitleGO');

  const TOTAL_TIME = 45000;
  const HOLE_X = [53, 158, 262, 367];
  const HOLE_Y = [215, 345, 475, 605];
  const HOLE_RX = 42;
  const HOLE_RY = 15;
  const MOLE_W = 58;
  const MOLE_H = 72;
  const RISE_MS = 130;
  const FALL_MS = 170;
  const WHACK_MS = 320;
  const HIT_HALF_W = 40;
  const NORMAL_PTS = 10;
  const GOLD_PTS = 30;
  const HELMET_PTS = 20;
  const BOMB_PENALTY = 30;
  const BOMB_TIME_MS = 2000;
  const GOLD_CHANCE = 0.09;

  const BEST_KEY = 'whackmole.best';
  const MUTE_KEY = 'whackmole.muted';
  const RANKS_KEY = 'whackmole.ranks';
  const NAME_KEY = 'whackmole.name';
  const MAX_RANKS = 20;

  /** @type {{cx:number,cy:number,state:string,type:string,t:number,upDur:number,hp:number}[]} */
  const holes = [];
  for (const cy of HOLE_Y) {
    for (const cx of HOLE_X) {
      holes.push({ cx, cy, state: 'empty', type: 'normal', t: 0, upDur: 0, hp: 1 });
    }
  }

  let running = false;
  let elapsed = 0;
  let score = 0;
  let best = loadBest();
  let combo = 0;
  let molesHit = 0;
  let level = 1;
  let spawnTimer = 0;
  let lastTickSecond = -1;
  let shakeT = 0;
  let shakeMag = 0;

  /** @type {{text:string,life:number}[]} */
  let banners = [];

  /** @type {{x:number,y:number,vx:number,vy:number,rot:number,vr:number,life:number,max:number,color:string,size:number,kind:string}[]} */
  let particles = [];
  /** @type {{x:number,y:number,text:string,color:string,life:number}[]} */
  let popups = [];
  /** @type {{x:number,y:number,t:number}[]} */
  let hammers = [];

  // Fixed decoration positions so the field looks the same every frame
  const tufts = [];
  const flowers = [];
  (() => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 26; i++) {
      tufts.push({ x: 12 + rnd() * (W - 24), y: 130 + rnd() * (H - 150), s: 0.7 + rnd() * 0.7 });
    }
    for (let i = 0; i < 8; i++) {
      flowers.push({ x: 12 + rnd() * (W - 24), y: 140 + rnd() * (H - 160), c: rnd() < 0.5 ? '#ffd9e8' : '#fff3b0' });
    }
  })();

  function loadBest() {
    const v = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
    return Number.isFinite(v) ? v : 0;
  }
  function saveBest(v) {
    try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* private mode */ }
  }

  // ---------- Leaderboard ----------
  // BOARD_URL: deployed Google Apps Script web-app endpoint everyone shares
  // (see server/Code.gs). Empty string = ranks stay on this device only.
  const BOARD_URL = 'https://script.google.com/macros/s/AKfycbytvivyO2RVwDCzpwsIA_kgC52yclOQWb43D_chB-hXDH3-IcjqnleNRC-rS2hHLB7MxA/exec';
  const BOARD_CACHE_KEY = 'whackmole.board.cache';
  const PENDING_KEY = 'whackmole.board.pending';
  const BOARD_TIMEOUT_MS = 25000; // generous: free backends wake up slowly
  const STORE_MAX = 50;

  const boardEnabled = () => BOARD_URL.length > 0;
  const byScore = (a, b) => (b.score - a.score) || ((a.date || 0) - (b.date || 0));

  function loadList(key) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }
  function saveList(key, list) {
    try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) { /* private mode */ }
  }
  const loadRanks = () => loadList(RANKS_KEY);
  const loadBoardCache = () => loadList(BOARD_CACHE_KEY);

  async function boardRequest(method, bodyObj) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), BOARD_TIMEOUT_MS);
    try {
      const opts = { method, signal: ctrl.signal, cache: 'no-store' };
      if (bodyObj) {
        // text/plain keeps this a "simple request": no CORS preflight,
        // which Apps Script web apps cannot answer
        opts.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
        opts.body = JSON.stringify(bodyObj);
      }
      const res = await fetch(BOARD_URL, opts);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      // The server reports lock contention as {error} with a 200 status
      if (data && data.error) throw new Error(String(data.error));
      const scores = (Array.isArray(data.scores) ? data.scores : []).slice();
      scores.sort(byScore);
      return scores.slice(0, STORE_MAX);
    } finally {
      clearTimeout(timer);
    }
  }

  // Callers persist the cache themselves (guarded by a request generation)
  // so a stale response can never overwrite a newer replica.
  async function fetchBoard() {
    let scores = await boardRequest('GET');
    const pending = loadList(PENDING_KEY);
    // Flush queued offline registrations; also heal a wiped server from replica
    if (pending.length || (!scores.length && loadBoardCache().length)) {
      scores = await boardRequest('POST', { scores: [...pending, ...loadBoardCache()] });
      saveList(PENDING_KEY, []);
    }
    return scores;
  }
  async function submitBoard(entry) {
    // Send queued entries and our replica along so nothing is ever lost
    const pending = loadList(PENDING_KEY);
    const scores = await boardRequest('POST', { scores: [entry, ...pending, ...loadBoardCache()] });
    saveList(PENDING_KEY, []);
    return scores;
  }

  // Offline view: whatever we saw from the server last, plus local records
  function mergedLocalView() {
    const seen = new Set();
    const all = [...loadBoardCache(), ...loadRanks()].filter((r) => {
      const k = r.id || `${r.name}|${r.score}|${r.date}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    all.sort(byScore);
    return all.slice(0, STORE_MAX);
  }

  function renderList(el, scores, highlightId) {
    el.innerHTML = '';
    if (!scores.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '아직 기록이 없어요';
      el.appendChild(li);
      return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    const addRow = (r, i) => {
      const li = document.createElement('li');
      if (highlightId && r.id === highlightId) li.className = 'me';
      const who = document.createElement('span');
      who.textContent = `${medals[i] || (i + 1) + '위'} ${r.name}`;
      const pts = document.createElement('span');
      pts.textContent = `${r.score}점 · ${r.moles}마리`;
      li.appendChild(who);
      li.appendChild(pts);
      el.appendChild(li);
    };
    scores.slice(0, MAX_RANKS).forEach(addRow);
    // My fresh record fell below the visible cut: still show where it landed
    if (highlightId) {
      const idx = scores.findIndex((r) => r.id === highlightId);
      if (idx >= MAX_RANKS) {
        const gap = document.createElement('li');
        gap.className = 'empty';
        gap.textContent = '⋯';
        el.appendChild(gap);
        addRow(scores[idx], idx);
      }
    }
  }

  // Request generation: only the newest in-flight request may paint the UI
  // or persist the replica, so slow stale responses can't undo fresh ones.
  let boardGen = 0;

  function showRanks(el, statusEl, highlightId) {
    if (!boardEnabled()) {
      statusEl.textContent = '';
      renderList(el, loadRanks(), highlightId);
      return;
    }
    const gen = ++boardGen;
    statusEl.textContent = '순위 불러오는 중…';
    el.innerHTML = '';
    fetchBoard()
      .then((scores) => {
        if (gen !== boardGen) return;
        saveList(BOARD_CACHE_KEY, scores);
        statusEl.textContent = '';
        renderList(el, scores, highlightId);
      })
      .catch(() => {
        if (gen !== boardGen) return;
        statusEl.textContent = '연결 실패 — 마지막으로 받아둔 순위예요';
        renderList(el, mergedLocalView(), highlightId);
      });
  }

  let registered = false;
  function registerScore() {
    if (registered) return;
    registered = true;
    // NFC: iOS가 분해형 한글을 보내는 경우 완성형으로 합쳐 저장
    const name = (nameInput.value || '').normalize('NFC').trim().slice(0, 8) || '무명 두더지꾼';
    try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* private mode */ }
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name,
      score,
      moles: molesHit,
      date: Date.now(),
    };
    // Always keep a copy on this device (works offline, heals the server)
    const local = loadRanks();
    local.push(entry);
    local.sort(byScore);
    saveList(RANKS_KEY, local.slice(0, MAX_RANKS));
    registerBox.classList.add('hidden');

    if (!boardEnabled()) {
      renderList(rankList, loadRanks(), entry.id);
      return;
    }
    const gen = ++boardGen; // also invalidates the game-over screen's GET
    ranksStatusGO.textContent = '순위 올리는 중…';
    submitBoard(entry)
      .then((scores) => {
        if (gen !== boardGen) return;
        saveList(BOARD_CACHE_KEY, scores);
        ranksStatusGO.textContent = '';
        renderList(rankList, scores, entry.id);
      })
      .catch(() => {
        // Queue it: the next successful board request uploads it automatically
        const pending = loadList(PENDING_KEY);
        pending.push(entry);
        saveList(PENDING_KEY, pending.slice(-20));
        if (gen !== boardGen) return;
        ranksStatusGO.textContent = '연결 실패 — 나중에 자동으로 올라가요';
        renderList(rankList, mergedLocalView(), entry.id);
      });
  }
  saveScoreBtn.addEventListener('click', registerScore);
  nameInput.addEventListener('keydown', (e) => {
    // Korean IME fires Enter while composing; registering then would cut
    // the last syllable off the name
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') registerScore();
  });
  nameInput.addEventListener('input', (e) => {
    // Length cap enforced only after composition ends — trimming mid-IME
    // is what used to shatter Hangul into loose jamo on iOS
    if (e.isComposing) return;
    if (nameInput.value.length > 8) nameInput.value = nameInput.value.slice(0, 8);
  });

  ranksBtn.addEventListener('click', () => {
    showRanks(rankListFull, ranksStatus, null);
    ranksOverlay.classList.remove('hidden');
  });
  closeRanksBtn.addEventListener('click', () => {
    ranksOverlay.classList.add('hidden');
  });

  // Hidden admin: tap the version badge 7 times quickly, enter the key set
  // in server/Code.gs (ADMIN_KEY) to wipe the shared leaderboard.
  const versionBadge = document.querySelector('.version-badge');
  let adminTaps = 0;
  let adminTapTimer = null;
  versionBadge.addEventListener('click', () => {
    adminTaps += 1;
    clearTimeout(adminTapTimer);
    adminTapTimer = setTimeout(() => { adminTaps = 0; }, 1500);
    if (adminTaps < 7) return;
    adminTaps = 0;
    if (!boardEnabled()) return;
    const key = prompt('관리자 키를 입력하세요');
    if (!key) return;
    boardRequest('POST', { admin: key, action: 'clear' })
      .then(() => {
        saveList(BOARD_CACHE_KEY, []);
        saveList(PENDING_KEY, []);
        alert('공유 순위판이 초기화됐어요');
      })
      .catch((err) => alert('초기화 실패: ' + err.message));
  });

  // ---------- Audio (synthesized, no asset files) ----------
  let audio = null;
  let muted = localStorage.getItem(MUTE_KEY) === '1';
  soundBtn.textContent = muted ? '🔇' : '🔊';

  function ensureAudio() {
    if (muted) return;
    if (!audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audio = new AC();
    }
    if (audio.state === 'suspended') audio.resume();
  }

  function beep(freq, dur, type, vol, slideTo, delay) {
    if (!audio || muted) return;
    const t0 = audio.currentTime + (delay || 0);
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol || 0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(audio.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur, vol) {
    if (!audio || muted) return;
    const len = Math.max(1, Math.floor(audio.sampleRate * dur));
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.createBufferSource();
    const g = audio.createGain();
    src.buffer = buf;
    g.gain.value = vol;
    src.connect(g).connect(audio.destination);
    src.start();
  }

  const sHit = () => beep(500, 0.09, 'square', 0.16, 200);
  const sGold = () => { beep(720, 0.07, 'sine', 0.16); beep(1080, 0.1, 'sine', 0.16, null, 0.07); };
  const sBomb = () => { noiseBurst(0.28, 0.25); beep(100, 0.3, 'sawtooth', 0.22, 45); };
  const sWhiff = () => noiseBurst(0.05, 0.05);
  const sTick = () => beep(1200, 0.04, 'square', 0.1);
  const sStart = () => { beep(520, 0.08, 'sine', 0.15); beep(780, 0.12, 'sine', 0.15, null, 0.09); };
  const sLevelUp = () => { beep(620, 0.07, 'square', 0.14); beep(830, 0.07, 'square', 0.14, null, 0.08); beep(1100, 0.12, 'square', 0.14, null, 0.16); };
  const sClink = () => { beep(1500, 0.05, 'square', 0.12, 1100); noiseBurst(0.03, 0.05); };
  const sEnd = () => { beep(660, 0.14, 'sine', 0.16); beep(520, 0.14, 'sine', 0.16, null, 0.15); beep(390, 0.25, 'sine', 0.16, null, 0.3); };

  soundBtn.addEventListener('click', () => {
    muted = !muted;
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    soundBtn.textContent = muted ? '🔇' : '🔊';
    if (!muted) ensureAudio();
  });

  // ---------- Level-based difficulty ----------
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const easeOut = (t) => 1 - (1 - t) * (1 - t);

  // Level up every LEVEL_MS; each level spawns faster, hides quicker,
  // pops more moles at once and mixes in more hazards.
  const LEVEL_MS = 9000;
  const LEVELS = [
    { spawn: 800, up: 1050, bomb: 0.07, helmet: 0.00, double: 0.10, triple: 0.00 },
    { spawn: 640, up: 890,  bomb: 0.10, helmet: 0.10, double: 0.25, triple: 0.00 },
    { spawn: 510, up: 750,  bomb: 0.12, helmet: 0.12, double: 0.40, triple: 0.10 },
    { spawn: 410, up: 630,  bomb: 0.14, helmet: 0.14, double: 0.55, triple: 0.22 },
    { spawn: 330, up: 520,  bomb: 0.16, helmet: 0.15, double: 0.70, triple: 0.35 },
  ];
  const MAX_LEVEL = LEVELS.length;

  function levelCfg() {
    return LEVELS[level - 1];
  }
  function spawnDelay() {
    return levelCfg().spawn;
  }
  function upTime(type) {
    let t = levelCfg().up;
    if (type === 'gold') t *= 0.72;
    if (type === 'bomb') t *= 1.1;
    if (type === 'helmet') t *= 1.25; // needs two hits, stays a touch longer
    return t;
  }

  // ---------- Game flow ----------
  function reset() {
    for (const h of holes) {
      h.state = 'empty';
      h.t = 0;
    }
    particles = [];
    popups = [];
    hammers = [];
    banners = [];
    elapsed = 0;
    score = 0;
    combo = 0;
    molesHit = 0;
    level = 1;
    spawnTimer = 450;
    lastTickSecond = -1;
    shakeT = 0;
    registered = false;
    updateHud();
  }

  function startGame() {
    ensureAudio();
    reset();
    overlay.classList.add('hidden');
    gameover.classList.add('hidden');
    ranksOverlay.classList.add('hidden');
    running = true;
    sStart();
  }

  function endGame() {
    running = false;
    for (const h of holes) {
      if (h.state === 'rising' || h.state === 'up') {
        h.state = 'falling';
        h.t = 0;
      }
    }
    finalScore.textContent = score;
    finalMoles.textContent = molesHit;
    if (score > best) {
      best = score;
      saveBest(best);
      newRecord.classList.remove('hidden');
    } else {
      newRecord.classList.add('hidden');
    }
    if (score > 0 && !registered) {
      nameInput.value = localStorage.getItem(NAME_KEY) || '';
      registerBox.classList.remove('hidden');
    } else {
      registerBox.classList.add('hidden');
    }
    showRanks(rankList, ranksStatusGO, null);
    updateHud();
    gameover.classList.remove('hidden');
    sEnd();
  }

  function updateHud() {
    hudScore.textContent = score;
    hudTime.textContent = Math.max(0, Math.ceil((TOTAL_TIME - elapsed) / 1000));
    hudBest.textContent = best;
  }

  function pickType() {
    const c = levelCfg();
    let r = Math.random();
    if ((r -= GOLD_CHANCE) < 0) return 'gold';
    if ((r -= c.bomb) < 0) return 'bomb';
    if ((r -= c.helmet) < 0) return 'helmet';
    return 'normal';
  }

  function spawnMole() {
    const empty = holes.filter((h) => h.state === 'empty');
    if (!empty.length) return;
    const h = empty[Math.floor(Math.random() * empty.length)];
    h.type = pickType();
    h.state = 'rising';
    h.t = 0;
    h.hp = h.type === 'helmet' ? 2 : 1;
    h.upDur = upTime(h.type);
  }

  // ---------- Input ----------
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!running) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    const y = (e.clientY - rect.top) * (H / rect.height);
    whackAt(x, y);
  });

  function visibleProgress(h) {
    if (h.state === 'rising') return easeOut(clamp01(h.t / RISE_MS));
    if (h.state === 'up') return 1;
    if (h.state === 'falling') return 1 - clamp01(h.t / FALL_MS);
    if (h.state === 'whacked') return 1 - clamp01(h.t / WHACK_MS) * 0.6;
    return 0;
  }

  function popHeight() {
    return MOLE_H; // bombs are disguised as moles, same silhouette
  }

  function whackAt(x, y) {
    hammers.push({ x, y, t: 0 });
    let hitSomething = false;
    let nearWhacked = false;

    for (const h of holes) {
      const p = visibleProgress(h);
      const top = h.cy - popHeight(h) * p - 8;
      const inBox = Math.abs(x - h.cx) <= HIT_HALF_W && y >= top && y <= h.cy + HOLE_RY + 8;
      if (!inBox) continue;
      if (h.state === 'rising' || h.state === 'up') {
        hitSomething = true;
        if (h.type === 'bomb') {
          hitBomb(h);
        } else if (h.type === 'helmet' && h.hp > 1) {
          hitHelmetBlock(h);
        } else {
          hitMole(h);
        }
        break;
      }
      if (h.state === 'whacked') nearWhacked = true;
    }

    // Tapping a mole that was just whacked shouldn't punish fast fingers,
    // so only a genuinely empty tap breaks the combo.
    if (!hitSomething && !nearWhacked) {
      combo = 0;
      sWhiff();
    }
  }

  function hitMole(h) {
    combo += 1;
    const bonus = Math.min(combo - 1, 10) * 2;
    const base = h.type === 'gold' ? GOLD_PTS : h.type === 'helmet' ? HELMET_PTS : NORMAL_PTS;
    const pts = base + bonus;
    score += pts;
    molesHit += 1;
    h.state = 'whacked';
    h.t = 0;

    const py = h.cy - popHeight(h) * 0.9;
    popups.push({
      x: h.cx, y: py, life: 0,
      text: `+${pts}`,
      color: h.type === 'gold' ? '#ffd54d' : '#ffffff',
    });
    spawnStars(h.cx, py + 20, h.type === 'gold' ? 10 : 6, h.type === 'gold' ? '#ffd54d' : '#ffe9a0');
    if (h.type === 'gold') sGold(); else sHit();
  }

  function hitHelmetBlock(h) {
    // First hit only knocks the hard hat off
    h.hp = 1;
    h.t = Math.max(0, h.t - 300); // give a beat to land the finishing hit
    popups.push({ x: h.cx, y: h.cy - MOLE_H, life: 0, text: '깡!', color: '#e8ecf3' });
    spawnStars(h.cx, h.cy - MOLE_H * 0.6, 5, '#c9cdd4');
    sClink();
  }

  function hitBomb(h) {
    combo = 0;
    score = Math.max(0, score - BOMB_PENALTY);
    // A bomb also burns 2 seconds off the clock
    elapsed = Math.min(TOTAL_TIME - 1, elapsed + BOMB_TIME_MS);
    h.state = 'whacked';
    h.t = 0;
    shakeT = 300;
    shakeMag = 8;

    const py = h.cy - MOLE_H * 0.7;
    popups.push({ x: h.cx, y: py, life: 0, text: `-${BOMB_PENALTY}`, color: '#ff5566' });
    popups.push({ x: W / 2, y: 92, life: 0, text: '⏱ -2초', color: '#ff5566' });
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3.5;
      particles.push({
        x: h.cx, y: py + 10,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        life: 0, max: 450 + Math.random() * 250,
        color: i % 3 === 0 ? '#ff9a3d' : i % 3 === 1 ? '#ffd54d' : '#8d8d8d',
        size: 3 + Math.random() * 5, kind: 'dot',
      });
    }
    sBomb();
  }

  function spawnStars(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 2.5;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.25,
        life: 0, max: 400 + Math.random() * 200,
        color, size: 5 + Math.random() * 4, kind: 'star',
      });
    }
  }

  // ---------- Update ----------
  function update(dt) {
    elapsed += dt;
    const remaining = TOTAL_TIME - elapsed;
    if (remaining <= 0) {
      endGame();
      return;
    }

    // Countdown ticks for the last 3 seconds
    const sec = Math.ceil(remaining / 1000);
    if (sec <= 3 && sec !== lastTickSecond) {
      lastTickSecond = sec;
      sTick();
    }

    const newLevel = Math.min(MAX_LEVEL, Math.floor(elapsed / LEVEL_MS) + 1);
    if (newLevel !== level) {
      level = newLevel;
      banners.push({ text: `LEVEL ${level}!`, life: 0 });
      sLevelUp();
      // Kick the new level off with an immediate wave
      spawnTimer = Math.min(spawnTimer, 120);
    }

    spawnTimer -= dt;
    while (spawnTimer <= 0) {
      spawnMole();
      // Higher levels pop several moles at once
      if (Math.random() < levelCfg().double) spawnMole();
      if (Math.random() < levelCfg().triple) spawnMole();
      spawnTimer += spawnDelay();
    }

    for (const h of holes) {
      if (h.state === 'empty') continue;
      h.t += dt;
      if (h.state === 'rising' && h.t >= RISE_MS) {
        h.state = 'up';
        h.t = 0;
      } else if (h.state === 'up' && h.t >= h.upDur) {
        h.state = 'falling';
        h.t = 0;
        if (h.type !== 'bomb') {
          // An escaped mole taunts you but doesn't break the combo
          popups.push({ x: h.cx, y: h.cy - MOLE_H, life: 0, text: '휙!', color: 'rgba(255,255,255,0.55)' });
        }
      } else if (h.state === 'falling' && h.t >= FALL_MS) {
        h.state = 'empty';
      } else if (h.state === 'whacked' && h.t >= WHACK_MS) {
        h.state = 'empty';
      }
    }

    for (const p of particles) {
      p.life += dt;
      p.x += p.vx * dt / 16;
      p.y += p.vy * dt / 16;
      p.vy += 0.08 * dt / 16;
      p.rot += p.vr * dt / 16;
    }
    particles = particles.filter((p) => p.life < p.max);

    for (const p of popups) {
      p.life += dt;
      p.y -= 0.55 * dt / 16;
    }
    popups = popups.filter((p) => p.life < 700);

    for (const hm of hammers) hm.t += dt;
    hammers = hammers.filter((hm) => hm.t < 230);

    for (const b of banners) b.life += dt;
    banners = banners.filter((b) => b.life < 1000);

    if (shakeT > 0) shakeT -= dt;

    updateHud();
  }

  // ---------- Drawing ----------
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shakeT > 0) {
      const k = shakeT / 300;
      ctx.translate((Math.random() - 0.5) * shakeMag * k, (Math.random() - 0.5) * shakeMag * k);
    }

    drawField();
    drawTimeBar();
    drawCombo();
    drawBanners();

    for (const h of holes) {
      drawHoleBack(h);
      if (h.state !== 'empty') {
        // Bombs look like moles now; only a tapped one reveals the explosion
        if (h.type === 'bomb' && h.state === 'whacked') drawBombExplosion(h);
        else drawMole(h);
      }
      drawHoleFront(h);
    }

    drawParticles();
    drawPopups();
    drawHammers();
    ctx.restore();
  }

  function drawField() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#57b85c');
    g.addColorStop(0.5, '#469c4b');
    g.addColorStop(1, '#357c3a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(28, 92, 33, 0.5)';
    ctx.lineWidth = 2;
    for (const t of tufts) {
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(t.x + i * 4 * t.s, t.y);
        ctx.quadraticCurveTo(t.x + i * 6 * t.s, t.y - 7 * t.s, t.x + i * 7 * t.s, t.y - 12 * t.s);
      }
      ctx.stroke();
    }
    for (const f of flowers) {
      ctx.fillStyle = f.c;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(f.x + Math.cos(a) * 4, f.y + Math.sin(a) * 4, 3, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffb300';
      ctx.beginPath();
      ctx.arc(f.x, f.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTimeBar() {
    // Level badge on the left, time bar fills the rest
    ctx.fillStyle = '#ffd54d';
    roundRect(24, 15, 58, 26, 13);
    ctx.fill();
    ctx.fillStyle = '#3a2a00';
    ctx.font = '800 15px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`LV ${level}`, 53, 29);

    const x = 92, y = 20, w = W - 92 - 24, h = 16;
    const frac = clamp01((TOTAL_TIME - elapsed) / TOTAL_TIME);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    roundRect(x, y, w, h, 8);
    ctx.fill();
    if (frac > 0) {
      const color = frac > 0.5 ? '#8bd450' : frac > 0.22 ? '#ffb300' : '#ff5566';
      ctx.fillStyle = color;
      roundRect(x + 2, y + 2, Math.max(4, (w - 4) * frac), h - 4, 6);
      ctx.fill();
    }
  }

  function drawBanners() {
    for (const b of banners) {
      const inK = clamp01(b.life / 180);            // pop in
      const outK = clamp01((b.life - 700) / 300);   // fade out
      const scale = 0.5 + easeOut(inK) * 0.5 + outK * 0.15;
      ctx.save();
      ctx.globalAlpha = 1 - outK;
      ctx.translate(W / 2, 120);
      ctx.scale(scale, scale);
      ctx.font = '800 40px -apple-system, "Apple SD Gothic Neo", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 8;
      ctx.strokeText(b.text, 0, 0);
      ctx.fillStyle = '#ffd54d';
      ctx.fillText(b.text, 0, 0);
      ctx.restore();
    }
  }

  function drawCombo() {
    if (combo < 2) return;
    const pulse = 1 + 0.06 * Math.sin(elapsed / 90);
    ctx.save();
    ctx.translate(W / 2, 58);
    ctx.scale(pulse, pulse);
    ctx.font = '800 20px -apple-system, "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd54d';
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 4;
    ctx.strokeText(`🔥 콤보 x${combo}`, 0, 0);
    ctx.fillText(`🔥 콤보 x${combo}`, 0, 0);
    ctx.restore();
  }

  function drawHoleBack(h) {
    // Dirt mound behind the opening
    ctx.fillStyle = '#6b4a2a';
    ctx.beginPath();
    ctx.ellipse(h.cx, h.cy + 4, HOLE_RX + 10, HOLE_RY + 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // The dark opening
    const g = ctx.createRadialGradient(h.cx, h.cy, 4, h.cx, h.cy, HOLE_RX);
    g.addColorStop(0, '#17100a');
    g.addColorStop(1, '#2e2013');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(h.cx, h.cy, HOLE_RX, HOLE_RY, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHoleFront(h) {
    // Front lip drawn over the mole so it looks like it comes out of the hole
    ctx.fillStyle = '#7d5732';
    ctx.beginPath();
    ctx.ellipse(h.cx, h.cy + 6, HOLE_RX + 8, HOLE_RY + 6, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#8f6539';
    ctx.beginPath();
    ctx.ellipse(h.cx, h.cy + 4, HOLE_RX + 4, HOLE_RY + 3, 0, 0.15, Math.PI - 0.15);
    ctx.fill();
  }

  function drawMole(h) {
    const p = visibleProgress(h);
    if (p <= 0.02) return;
    const whacked = h.state === 'whacked';
    const gold = h.type === 'gold';
    const bodyH = MOLE_H * p;
    const half = MOLE_W / 2;
    const bottom = h.cy + 6;
    const top = bottom - bodyH;

    ctx.save();
    // Body capsule doubles as a clip so face parts never leak out
    const body = new Path2D();
    body.moveTo(h.cx - half, bottom);
    body.lineTo(h.cx - half, top + half);
    body.arc(h.cx, top + half, half, Math.PI, 0);
    body.lineTo(h.cx + half, bottom);
    body.closePath();

    const g = ctx.createLinearGradient(h.cx - half, 0, h.cx + half, 0);
    if (gold) {
      g.addColorStop(0, '#e8b62a');
      g.addColorStop(0.5, '#ffd863');
      g.addColorStop(1, '#d8a41e');
    } else {
      g.addColorStop(0, '#7a5233');
      g.addColorStop(0.5, '#96693f');
      g.addColorStop(1, '#6e4a2d');
    }
    ctx.fillStyle = g;
    ctx.fill(body);
    ctx.clip(body);

    const muzzleColor = gold ? '#ffedb0' : '#cfa878';
    const faceY = top + half; // face anchored to the head
    // Muzzle
    ctx.fillStyle = muzzleColor;
    ctx.beginPath();
    ctx.ellipse(h.cx, faceY + 11, 17, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // Nose
    ctx.fillStyle = '#ef6a8a';
    ctx.beginPath();
    ctx.ellipse(h.cx, faceY + 4.5, 6.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Whiskers
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(h.cx + s * 10, faceY + 8);
      ctx.lineTo(h.cx + s * 24, faceY + 5);
      ctx.moveTo(h.cx + s * 10, faceY + 11);
      ctx.lineTo(h.cx + s * 24, faceY + 12);
    }
    ctx.stroke();

    if (whacked) {
      // X eyes
      ctx.strokeStyle = '#2b1c10';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      for (const s of [-1, 1]) {
        const ex = h.cx + s * 12;
        const ey = faceY - 5;
        ctx.beginPath();
        ctx.moveTo(ex - 3.2, ey - 3.2); ctx.lineTo(ex + 3.2, ey + 3.2);
        ctx.moveTo(ex + 3.2, ey - 3.2); ctx.lineTo(ex - 3.2, ey + 3.2);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#241812';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(h.cx + s * 12, faceY - 5, 3.8, 0, Math.PI * 2);
        ctx.fill();
      }
      // Eye glints
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(h.cx + s * 12 + 1.2, faceY - 6.2, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      // Front teeth
      ctx.fillStyle = '#fffdf5';
      ctx.fillRect(h.cx - 4, faceY + 14, 3.6, 5);
      ctx.fillRect(h.cx + 0.4, faceY + 14, 3.6, 5);
    }

    // Blush
    ctx.fillStyle = 'rgba(255, 120, 140, 0.25)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(h.cx + s * 20, faceY + 5, 5.5, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Paws grabbing the rim once fully up
    if (p > 0.85 && !whacked) {
      ctx.fillStyle = muzzleColor;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(h.cx + s * (half - 3), h.cy + 2, 7, 5, s * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (h.type === 'bomb' && !whacked) {
      // The lit fuse is the tell — big, with a pulsing glow, hard to miss
      ctx.strokeStyle = '#6b4a2a';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(h.cx, top + 3);
      ctx.quadraticCurveTo(h.cx + 6, top - 14, h.cx + 16, top - 12);
      ctx.stroke();
      const tws = Math.random();
      ctx.fillStyle = `rgba(255, 140, 40, ${0.25 + tws * 0.2})`;
      ctx.beginPath();
      ctx.arc(h.cx + 18, top - 14, 11 + tws * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, ${170 + tws * 70}, 50, ${0.85 + tws * 0.15})`;
      drawStarShape(h.cx + 18, top - 14, 7 + tws * 3);
    }

    if (h.type === 'helmet' && h.hp > 1 && !whacked) {
      // Hard hat: needs one hit to knock off
      ctx.fillStyle = '#f5b91e';
      ctx.beginPath();
      ctx.arc(h.cx, top + 15, half - 4, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#d99b06';
      ctx.beginPath();
      ctx.ellipse(h.cx, top + 15, half + 2, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.ellipse(h.cx - 8, top + 7, 5, 2.5, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (gold && !whacked) {
      // Sparkle so the bonus mole reads at a glance
      const tw = (Math.sin(elapsed / 120 + h.cx) + 1) / 2;
      ctx.fillStyle = `rgba(255, 255, 210, ${0.4 + tw * 0.6})`;
      drawStarShape(h.cx + half - 6, top + 5, 4 + tw * 2);
    }
  }

  function drawBombExplosion(h) {
    // Expanding flash ring where the disguised bomb mole was
    const k = clamp01(h.t / WHACK_MS);
    const cy = h.cy - MOLE_H * 0.5;
    ctx.strokeStyle = `rgba(255, 170, 60, ${1 - k})`;
    ctx.lineWidth = 6 * (1 - k) + 1;
    ctx.beginPath();
    ctx.arc(h.cx, cy, 20 + k * 40, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawParticles() {
    for (const p of particles) {
      const a = 1 - p.life / p.max;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.kind === 'star') {
        drawStarShape(0, 0, p.size);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawStarShape(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawPopups() {
    ctx.font = '800 22px -apple-system, "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of popups) {
      const a = 1 - Math.max(0, p.life - 350) / 350;
      ctx.globalAlpha = Math.max(0, a);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 4;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawHammers() {
    for (const hm of hammers) {
      const swing = clamp01(hm.t / 100);
      const fade = 1 - clamp01((hm.t - 150) / 80);
      const angle = lerp(-0.9, 0.785, easeOut(swing));
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(hm.x + 30, hm.y - 30);
      ctx.rotate(angle);
      // Handle
      ctx.fillStyle = '#a5713d';
      roundRect(-5, 0, 10, 46, 4);
      ctx.fill();
      // Head
      ctx.fillStyle = '#8d8d99';
      roundRect(-19, 40, 38, 20, 6);
      ctx.fill();
      ctx.fillStyle = '#6f6f7c';
      roundRect(-19, 40, 8, 20, 4);
      ctx.fill();
      ctx.restore();
      // Impact flash right at the tap point while swinging down
      if (swing >= 1 && hm.t < 160) {
        ctx.save();
        ctx.globalAlpha = fade * 0.5;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(hm.x, hm.y, 14 + (hm.t - 100) * 0.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- Main loop ----------
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    // Capping dt also freezes the timer while the tab is in the background
    const dt = Math.min(now - (last || now), 50);
    last = now;
    if (running) update(dt);
    draw();
  }

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  // Titles reflect whether the shared online board is wired up yet
  ranksLead.textContent = boardEnabled() ? '모두가 함께 겨루는 TOP 20' : '이 기기에 저장된 TOP 20';
  ranksTitleGO.textContent = boardEnabled() ? '🌍 전체 순위 TOP 20' : '🏅 순위 TOP 20 (이 기기)';

  updateHud();
  requestAnimationFrame(frame);
})();
