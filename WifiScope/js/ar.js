/* AR 라이브 뷰 — 카메라 위 실시간 신호 시각화
 *
 * 월드 모드(기본, 센서 허용 시): 자이로(deviceorientation)로 기기 자세를 추적해
 * 바닥 그리드·발광 궤적·신호 블롭을 실제 바닥에 붙은 것처럼 3D 투영하고,
 * 가속도계 걸음 감지로 이동을 추정(dead-reckoning)해 걸어온 경로를 그린다.
 * 센서를 쓸 수 없으면 화면 고정 오버레이(폴백 모드)로 동작한다.
 */
(function () {
  'use strict';

  const D2R = Math.PI / 180;
  const CAM_H = 1.35;          // 카메라(폰) 높이 추정 m
  const STEP_LEN = 0.65;       // 걸음당 이동 거리 m
  const TRAIL_GAP = 0.45;      // 궤적 점 최소 간격 m
  const TRAIL_MAX = 240;

  let video, canvas, ctx, stage;
  let stream = null;
  let running = false;
  let rafId = 0;
  let pingTimer = 0, downTimer = 0;
  let hasCamera = false;

  // 측정 상태
  const state = {
    pings: [],
    emaDown: null,
    score: null,
    smooth: null,
    lastColor: [110, 130, 170],
  };

  // 월드(의사-AR) 상태
  const world = {
    sensorOn: false,        // orientation 이벤트 수신 여부
    motionOn: false,
    R: [1, 0, 0, 0, 1, 0, 0, 0, 1],   // 기기→지면 회전행렬 (스무딩 적용)
    Rt: null,               // 목표 행렬
    pos: { x: 0, y: 0 },
    dist: 0,                // 누적 이동 거리
    trail: [],              // {x, y, score}
    accEma: 9.81,
    lastStepT: 0,
  };
  let ui = {};

  function init(els) {
    stage = els.stage; video = els.video; canvas = els.canvas; ui = els;
    ctx = canvas.getContext('2d');
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopSampling();
      else if (running) startSampling();
    });
    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('devicemotion', onMotion);
  }

  // ── 센서 ──
  async function requestSensorPermission() {
    // iOS 13+: 사용자 제스처 안에서 호출해야 함 (start()가 버튼 클릭에서 불림)
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        await DeviceOrientationEvent.requestPermission();
      }
      if (typeof DeviceMotionEvent !== 'undefined' &&
          typeof DeviceMotionEvent.requestPermission === 'function') {
        await DeviceMotionEvent.requestPermission();
      }
    } catch (_) { /* 거부 시 폴백 모드 */ }
  }

  // W3C deviceorientation → 회전행렬 (기기 좌표 → 지면 좌표, 열 = 기기 축)
  function rotMatrix(a, b, g) {
    const cA = Math.cos(a), sA = Math.sin(a);
    const cB = Math.cos(b), sB = Math.sin(b);
    const cG = Math.cos(g), sG = Math.sin(g);
    return [
      cA * cG - sA * sB * sG, -cB * sA, cA * sG + cG * sA * sB,
      cG * sA + cA * sB * sG, cA * cB, sA * sG - cA * cG * sB,
      -cB * sG, sB, cB * cG,
    ];
  }

  function onOrientation(e) {
    if (!running || e.beta == null || e.gamma == null) return;
    world.Rt = rotMatrix((e.alpha || 0) * D2R, e.beta * D2R, e.gamma * D2R);
    if (!world.sensorOn) {
      world.sensorOn = true;
      if (!world.trail.length) dropTrailPoint();  // 시작 지점
    }
  }

  function smoothMatrix() {
    if (!world.Rt) return;
    const R = world.R, T = world.Rt, k = 0.35;
    for (let i = 0; i < 9; i++) R[i] += (T[i] - R[i]) * k;
    // 그램-슈미트 재정규화 (열 벡터 기준)
    const col = (i) => [R[i], R[3 + i], R[6 + i]];
    const put = (i, v) => { R[i] = v[0]; R[3 + i] = v[1]; R[6 + i] = v[2]; };
    const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const x = norm(col(0));
    let z = col(2);
    const y = norm(cross(z, x));
    z = cross(x, y);
    put(0, x); put(1, y); put(2, z);
  }

  // 걸음 감지: 중력 포함 가속도 크기의 피크
  function onMotion(e) {
    if (!running || !world.sensorOn) return;
    const acc = e.accelerationIncludingGravity;
    if (!acc || acc.x == null) return;
    world.motionOn = true;
    const m = Math.hypot(acc.x, acc.y, acc.z);
    world.accEma += (m - world.accEma) * 0.08;
    const hp = m - world.accEma;
    const now = performance.now();
    if (hp > 1.7 && now - world.lastStepT > 380) {
      world.lastStepT = now;
      stepForward();
    }
  }

  function heading() {
    // 카메라 전방(기기 -z)의 지면 투영
    const R = world.R;
    const fx = -R[2], fy = -R[5];
    const l = Math.hypot(fx, fy) || 1;
    return [fx / l, fy / l];
  }

  function stepForward() {
    const [hx, hy] = heading();
    world.pos.x += hx * STEP_LEN;
    world.pos.y += hy * STEP_LEN;
    world.dist += STEP_LEN;
    const last = world.trail[world.trail.length - 1];
    if (!last || Math.hypot(world.pos.x - last.x, world.pos.y - last.y) >= TRAIL_GAP) {
      dropTrailPoint();
    }
  }

  function dropTrailPoint() {
    world.trail.push({ x: world.pos.x, y: world.pos.y, score: state.smooth });
    if (world.trail.length > TRAIL_MAX) world.trail.shift();
  }

  function resetTrail() {
    world.pos = { x: 0, y: 0 };
    world.dist = 0;
    world.trail = [];
    if (world.sensorOn) dropTrailPoint();
    App.toast('궤적을 초기화했습니다');
  }

  // ── 시작/종료 ──
  async function start(useCamera) {
    hasCamera = false;
    await requestSensorPermission();
    if (useCamera) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 } },
          audio: false,
        });
        video.srcObject = stream;
        await video.play().catch(() => {});
        hasCamera = true;
      } catch (e) {
        App.toast('카메라를 사용할 수 없어 라이브 측정 모드로 시작합니다');
      }
    }
    video.classList.toggle('hidden', !hasCamera);
    ui.startPanel.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    running = true;
    fitCanvas();
    startSampling();
    loop(0);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
    stopSampling();
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    video.srcObject = null;
    ui.hud.classList.add('hidden');
    ui.startPanel.classList.remove('hidden');
    ctx && ctx.clearRect(0, 0, canvas.width, canvas.height);
    state.pings = []; state.emaDown = null; state.score = null; state.smooth = null;
    world.sensorOn = false; world.motionOn = false;
    world.pos = { x: 0, y: 0 }; world.dist = 0; world.trail = [];
    world.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; world.Rt = null;
  }

  // ── 라이브 측정 샘플링 ──
  function startSampling() {
    stopSampling();
    samplePing();
    sampleDown();
    pingTimer = setInterval(samplePing, 2000);
    downTimer = setInterval(sampleDown, 8000);
  }
  function stopSampling() {
    clearInterval(pingTimer); clearInterval(downTimer);
  }

  async function samplePing() {
    if (!running || SpeedTest.isRunning()) return;
    const { ping } = await SpeedTest.liveSample();
    if (!running) return;
    state.pings.push(ping);
    if (state.pings.length > 40) state.pings.shift();
    recompute();
  }

  async function sampleDown() {
    if (!running || SpeedTest.isRunning()) return;
    const { down } = await SpeedTest.liveDown();
    if (!running || down == null) return;
    state.emaDown = state.emaDown == null ? down : state.emaDown * 0.6 + down * 0.4;
    recompute();
  }

  function recompute() {
    const valid = state.pings.filter(p => p != null).slice(-8);
    const ping = valid.length ? valid.slice().sort((a, b) => a - b)[Math.floor(valid.length / 2)] : null;
    const s = Quality.score({ down: state.emaDown, ping, up: null });
    state.score = s;
    if (s != null) state.smooth = state.smooth == null ? s : Math.round(state.smooth * 0.65 + s * 0.35);
    // 제자리에 있어도 현재 위치 점수는 갱신
    const last = world.trail[world.trail.length - 1];
    if (last && Math.hypot(world.pos.x - last.x, world.pos.y - last.y) < TRAIL_GAP) last.score = state.smooth;
    updateHud(ping);
  }

  function updateHud(ping) {
    const s = state.smooth;
    const g = Quality.grade(s);
    ui.score.textContent = s == null ? '–' : s;
    ui.gradeChip.textContent = s == null ? '측정 중…' : g.label;
    ui.gradeChip.className = 'grade-chip ' + g.cls;
    const dist = world.dist >= 1 ? ` · ${Math.round(world.dist)}m` : '';
    ui.ping.textContent = (ping == null ? '–' : Math.round(ping)) + ' ms';
    ui.down.textContent = (state.emaDown == null ? '–' : Quality.fmtMbps(state.emaDown)) + ' Mbps' + dist;
    drawSpark();
  }

  function drawSpark() {
    const c = ui.spark, sctx = c.getContext('2d');
    const w = c.width, h = c.height;
    sctx.clearRect(0, 0, w, h);
    const data = state.pings.filter(p => p != null).slice(-30);
    if (data.length < 2) {
      sctx.fillStyle = 'rgba(255,255,255,0.4)';
      sctx.font = '600 10px sans-serif';
      sctx.textAlign = 'center';
      sctx.fillText('핑 추이', w / 2, h / 2 + 3);
      return;
    }
    const max = Math.max(80, ...data);
    sctx.beginPath();
    data.forEach((p, i) => {
      const x = 8 + (w - 16) * (i / (data.length - 1));
      const y = h - 7 - (h - 14) * Math.min(1, p / max);
      i ? sctx.lineTo(x, y) : sctx.moveTo(x, y);
    });
    sctx.strokeStyle = 'rgba(255,255,255,0.85)';
    sctx.lineWidth = 2;
    sctx.lineJoin = 'round';
    sctx.stroke();
    sctx.fillStyle = 'rgba(255,255,255,0.6)';
    sctx.font = '600 9px sans-serif';
    sctx.textAlign = 'left';
    sctx.fillText('핑 ' + Math.round(data[data.length - 1]) + 'ms', 8, 11);
  }

  function fitCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = stage.clientWidth * dpr;
    canvas.height = stage.clientHeight * dpr;
  }

  function currentColor() {
    const target = state.smooth == null ? [110, 130, 170] : Quality.rampRgb(state.smooth / 100);
    state.lastColor = state.lastColor.map((v, i) => v + (target[i] - v) * 0.06);
    return state.lastColor;
  }

  // ── 3D 투영 ──
  function project(px, py, pz, w, h, f) {
    const R = world.R;
    const dx = px - world.pos.x, dy = py - world.pos.y, dz = pz - CAM_H;
    // v_dev = Rᵀ · v_earth
    const vx = R[0] * dx + R[3] * dy + R[6] * dz;
    const vy = R[1] * dx + R[4] * dy + R[7] * dz;
    const vz = R[2] * dx + R[5] * dy + R[8] * dz;
    const depth = -vz;
    if (depth < 0.12) return null;
    return {
      x: w / 2 + f * vx / depth,
      y: h / 2 - f * vy / depth,
      d: Math.sqrt(dx * dx + dy * dy + dz * dz),
    };
  }

  function rgba(rgb, a) { return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`; }
  function scoreRgb(s) { return s == null ? [110, 130, 170] : Quality.rampRgb(s / 100); }

  // ── 월드 모드 렌더 ──
  function drawWorld(t, w, h) {
    smoothMatrix();
    const f = h * 0.9;   // 초점거리(px) — 세로 FOV 약 58°

    // 1) 바닥 그리드 (1m 격자, 사용자 주변 ±9m) — 알파 4단계로 배칭해 스트로크 수 최소화
    const R = 9;
    const cxg = Math.round(world.pos.x), cyg = Math.round(world.pos.y);
    const buckets = [[], [], [], []];
    for (let gx = cxg - R; gx <= cxg + R; gx++) {
      for (let gy = cyg - R; gy <= cyg + R; gy++) {
        const p0 = project(gx, gy, 0, w, h, f);
        if (!p0) continue;
        const fade = Math.max(0, 1 - p0.d / 10);
        if (fade <= 0.05) continue;
        const bi = Math.min(3, Math.floor(fade * 4));
        const px1 = project(gx + 1, gy, 0, w, h, f);
        const py1 = project(gx, gy + 1, 0, w, h, f);
        if (px1) buckets[bi].push(p0.x, p0.y, px1.x, px1.y);
        if (py1) buckets[bi].push(p0.x, p0.y, py1.x, py1.y);
      }
    }
    ctx.lineWidth = Math.max(1, w / 900);
    buckets.forEach((seg, bi) => {
      if (!seg.length) return;
      ctx.strokeStyle = `rgba(150,190,255,${0.075 * (bi + 1)})`;
      ctx.beginPath();
      for (let i = 0; i < seg.length; i += 4) {
        ctx.moveTo(seg[i], seg[i + 1]);
        ctx.lineTo(seg[i + 2], seg[i + 3]);
      }
      ctx.stroke();
    });

    // 2) 발광 궤적 리본 (걸어온 경로, 점수 색)
    const pts = world.trail.map(p => ({ p, s: project(p.x, p.y, 0.02, w, h, f) }));
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (!a.s || !b.s) continue;
      const col = scoreRgb(a.p.score);
      const lw = Math.min(30, Math.max(3, 26 / a.s.d * (w / 800)));
      ctx.lineCap = 'round';
      ctx.shadowColor = rgba(col, 0.9);
      ctx.shadowBlur = lw * 1.6;
      ctx.strokeStyle = rgba(col, 0.55);
      ctx.lineWidth = lw * 2.1;
      ctx.beginPath(); ctx.moveTo(a.s.x, a.s.y); ctx.lineTo(b.s.x, b.s.y); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1.5, lw * 0.4);
      ctx.beginPath(); ctx.moveTo(a.s.x, a.s.y); ctx.lineTo(b.s.x, b.s.y); ctx.stroke();
    }

    // 3) 신호 블롭 (측정 지점마다 공중에 떠 있는 발광 구름) — 12m 이내, 최대 24개
    let orbCount = 0;
    for (let i = 0; i < pts.length && orbCount < 24; i += 4) {
      const { p } = pts[i];
      const orb = project(p.x, p.y, 0.55, w, h, f);
      if (!orb || orb.d > 12) continue;
      orbCount++;
      const col = scoreRgb(p.score);
      const r = Math.min(w * 0.3, Math.max(10, 150 / orb.d * (w / 800))) * (1 + 0.08 * Math.sin(t / 600 + i));
      const g1 = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, r);
      g1.addColorStop(0, rgba(col, 0.42));
      g1.addColorStop(0.6, rgba(col, 0.16));
      g1.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g1;
      ctx.beginPath(); ctx.arc(orb.x, orb.y, r, 0, Math.PI * 2); ctx.fill();
      // 바닥 스플랫 (가까운 것만)
      const gnd = orb.d <= 7 ? project(p.x, p.y, 0.01, w, h, f) : null;
      if (gnd) {
        const r2 = r * 0.8;
        const g2 = ctx.createRadialGradient(gnd.x, gnd.y, 0, gnd.x, gnd.y, r2);
        g2.addColorStop(0, rgba(col, 0.25));
        g2.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(gnd.x, gnd.y, r2, 0, Math.PI * 2); ctx.fill();
      }
    }

    // 4) 현재 위치 스캔 링 (퍼지는 원, 월드 좌표 샘플링 투영)
    const phase = (t % 2200) / 2200;
    const ring = 0.25 + phase * 1.15;
    const col = currentColor().map(Math.round);
    ctx.strokeStyle = rgba(col, 0.55 * (1 - phase));
    ctx.lineWidth = Math.max(1.5, w / 500);
    ctx.beginPath();
    let started = false;
    for (let k = 0; k <= 26; k++) {
      const ang = (k / 26) * Math.PI * 2;
      const [hx, hy] = heading();
      const cxp = world.pos.x + hx * 1.1, cyp = world.pos.y + hy * 1.1; // 반 발짝 앞
      const s = project(cxp + Math.cos(ang) * ring, cyp + Math.sin(ang) * ring, 0.015, w, h, f);
      if (!s) { started = false; continue; }
      if (!started) { ctx.moveTo(s.x, s.y); started = true; }
      else ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
  }

  // ── 폴백(화면 고정) 렌더 ──
  function drawFallback(t, w, h) {
    const [r, g, b] = currentColor().map(Math.round);
    const col = (a) => `rgba(${r},${g},${b},${a})`;
    const horizon = h * 0.55;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizon, w, h - horizon);
    ctx.clip();
    ctx.lineWidth = Math.max(1, w / 700);
    const vpx = w / 2;
    for (let i = -8; i <= 8; i++) {
      ctx.strokeStyle = col(0.3);
      ctx.beginPath();
      ctx.moveTo(vpx, horizon);
      ctx.lineTo(vpx + i * (w / 7), h);
      ctx.stroke();
    }
    const rows = 9;
    for (let i = 0; i < rows; i++) {
      const phase = ((t / 2600) + i / rows) % 1;
      const y = horizon + (h - horizon) * Math.pow(phase, 2.2);
      ctx.strokeStyle = col(0.1 + 0.28 * phase);
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function loop(t) {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== stage.clientWidth * dpr) fitCanvas();
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const rgb = currentColor().map(Math.round);
    const col = (a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

    if (!hasCamera) {
      const bg = ctx.createRadialGradient(w / 2, h * 0.35, 0, w / 2, h * 0.35, h * 0.9);
      bg.addColorStop(0, '#141d31');
      bg.addColorStop(1, '#05080f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    }

    if (world.sensorOn) drawWorld(t, w, h);
    else drawFallback(t, w, h);

    // 가장자리 글로우 (현재 등급 색)
    const pulse = 0.72 + 0.28 * Math.sin(t / 700);
    const edge = Math.round(Math.min(w, h) * 0.14);
    const mk = (x0, y0, x1, y1) => {
      const gr = ctx.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, col(0.42 * pulse));
      gr.addColorStop(1, col(0));
      return gr;
    };
    ctx.fillStyle = mk(0, 0, 0, edge); ctx.fillRect(0, 0, w, edge);
    ctx.fillStyle = mk(0, h, 0, h - edge); ctx.fillRect(0, h - edge, w, edge);
    ctx.fillStyle = mk(0, 0, edge, 0); ctx.fillRect(0, 0, edge, h);
    ctx.fillStyle = mk(w, 0, w - edge, 0); ctx.fillRect(w - edge, 0, edge, h);

    // 공중 입자
    for (let i = 0; i < 14; i++) {
      const px = ((i * 733) % 997) / 997;
      const speed = 9000 + (i % 5) * 2600;
      const py = 1 - ((t / speed + i * 0.13) % 1);
      const x = px * w + Math.sin(t / 900 + i) * w * 0.012;
      const y = py * h * 0.62 + h * 0.05;
      const rad = (2 + (i % 3)) * (w / 800);
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = col(0.14 + 0.2 * Math.sin(t / 500 + i * 2));
      ctx.fill();
    }
  }

  async function snapshot() {
    const out = document.createElement('canvas');
    out.width = canvas.width; out.height = canvas.height;
    const c = out.getContext('2d');
    if (hasCamera && video.videoWidth) {
      // object-fit: cover 재현
      const vr = video.videoWidth / video.videoHeight;
      const cr = out.width / out.height;
      let sw, sh, sx, sy;
      if (vr > cr) { sh = video.videoHeight; sw = sh * cr; sx = (video.videoWidth - sw) / 2; sy = 0; }
      else { sw = video.videoWidth; sh = sw / cr; sx = 0; sy = (video.videoHeight - sh) / 2; }
      c.drawImage(video, sx, sy, sw, sh, 0, 0, out.width, out.height);
    } else {
      c.fillStyle = '#0a0f1c';
      c.fillRect(0, 0, out.width, out.height);
    }
    c.drawImage(canvas, 0, 0);
    const s = state.smooth;
    const g = Quality.grade(s);
    const fs = Math.round(out.width / 16);
    c.font = `900 ${fs}px sans-serif`;
    c.textAlign = 'left';
    c.lineWidth = fs / 8;
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    const label = (s == null ? '–' : s) + '점 · ' + (s == null ? '측정 중' : g.label.replace(' · 강한 신호', ''));
    c.strokeText(label, fs * 0.6, out.height - fs * 0.7);
    c.fillStyle = '#fff';
    c.fillText(label, fs * 0.6, out.height - fs * 0.7);
    c.font = `700 ${Math.round(fs * 0.42)}px sans-serif`;
    c.strokeText('와이파이 스코프', fs * 0.62, out.height - fs * 1.75);
    c.fillText('와이파이 스코프', fs * 0.62, out.height - fs * 1.75);

    const blob = await new Promise(res => out.toBlob(res, 'image/png'));
    if (!blob) return;
    const file = new File([blob], `wifiscope-ar-${Date.now()}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (_) { return; }
    }
    App.downloadBlob(blob, file.name);
    App.toast('스냅샷을 저장했습니다');
  }

  function isRunning() { return running; }
  function debug() {
    return { sensorOn: world.sensorOn, motionOn: world.motionOn, trail: world.trail.length, dist: world.dist, pos: { ...world.pos } };
  }

  window.Ar = { init, start, stop, snapshot, resetTrail, isRunning, debug };
})();
