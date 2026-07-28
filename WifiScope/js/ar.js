/* AR 라이브 뷰 — 카메라 위 실시간 신호 품질 오버레이 */
(function () {
  'use strict';

  let video, canvas, ctx, stage;
  let stream = null;
  let running = false;
  let rafId = 0;
  let pingTimer = 0, downTimer = 0;
  let hasCamera = false;

  const state = {
    pings: [],        // 최근 핑 샘플
    emaDown: null,
    score: null,
    smooth: null,     // 표시용 EMA 점수
    lastColor: [110, 130, 170],
  };
  let ui = {};

  function init(els) {
    stage = els.stage; video = els.video; canvas = els.canvas; ui = els;
    ctx = canvas.getContext('2d');
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopSampling();
      else if (running) startSampling();
    });
  }

  async function start(useCamera) {
    hasCamera = false;
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
  }

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
    updateHud(ping);
  }

  function updateHud(ping) {
    const s = state.smooth;
    const g = Quality.grade(s);
    ui.score.textContent = s == null ? '–' : s;
    ui.gradeChip.textContent = s == null ? '측정 중…' : g.label;
    ui.gradeChip.className = 'grade-chip ' + g.cls;
    ui.ping.textContent = (ping == null ? '–' : Math.round(ping)) + ' ms';
    ui.down.textContent = (state.emaDown == null ? '–' : Quality.fmtMbps(state.emaDown)) + ' Mbps';
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
    // 색 전환 스무딩
    state.lastColor = state.lastColor.map((v, i) => v + (target[i] - v) * 0.06);
    return state.lastColor;
  }

  function loop(t) {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    if (canvas.width !== stage.clientWidth * Math.min(window.devicePixelRatio || 1, 2)) fitCanvas();
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const [r, g, b] = currentColor().map(Math.round);
    const col = (a) => `rgba(${r},${g},${b},${a})`;

    if (!hasCamera) {
      const bg = ctx.createRadialGradient(w / 2, h * 0.35, 0, w / 2, h * 0.35, h * 0.9);
      bg.addColorStop(0, '#141d31');
      bg.addColorStop(1, '#05080f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    }

    const pulse = 0.75 + 0.25 * Math.sin(t / 700);

    // 가장자리 글로우
    const edge = Math.round(Math.min(w, h) * 0.16);
    const mk = (x0, y0, x1, y1) => {
      const gr = ctx.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, col(0.5 * pulse));
      gr.addColorStop(1, col(0));
      return gr;
    };
    ctx.fillStyle = mk(0, 0, 0, edge); ctx.fillRect(0, 0, w, edge);
    ctx.fillStyle = mk(0, h, 0, h - edge); ctx.fillRect(0, h - edge, w, edge);
    ctx.fillStyle = mk(0, 0, edge, 0); ctx.fillRect(0, 0, edge, h);
    ctx.fillStyle = mk(w, 0, w - edge, 0); ctx.fillRect(w - edge, 0, edge, h);

    // 바닥 원근 그리드 (신호가 바닥에 깔린 느낌)
    const horizon = h * 0.55;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizon, w, h - horizon);
    ctx.clip();
    ctx.lineWidth = Math.max(1, w / 700);
    const vpx = w / 2;
    for (let i = -8; i <= 8; i++) {
      ctx.strokeStyle = col(0.34);
      ctx.beginPath();
      ctx.moveTo(vpx, horizon);
      ctx.lineTo(vpx + i * (w / 7), h);
      ctx.stroke();
    }
    const rows = 9;
    for (let i = 0; i < rows; i++) {
      const phase = ((t / 2600) + i / rows) % 1;
      const y = horizon + (h - horizon) * Math.pow(phase, 2.2);
      ctx.strokeStyle = col(0.12 + 0.3 * phase);
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();

    // 공중에 떠 있는 신호 입자
    for (let i = 0; i < 22; i++) {
      const px = ((i * 733) % 997) / 997;
      const speed = 9000 + (i % 5) * 2600;
      const py = 1 - ((t / speed + i * 0.13) % 1);
      const x = px * w + Math.sin(t / 900 + i) * w * 0.012;
      const y = py * h * 0.62 + h * 0.05;
      const rad = (2 + (i % 3)) * (w / 800);
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = col(0.18 + 0.22 * Math.sin(t / 500 + i * 2));
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
    // 스탬프
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
      try { await navigator.share({ files: [file] }); return; } catch (_) { /* 사용자가 취소 → 다운로드로 폴백하지 않음 */ return; }
    }
    App.downloadBlob(blob, file.name);
    App.toast('스냅샷을 저장했습니다');
  }

  function isRunning() { return running; }

  window.Ar = { init, start, stop, snapshot, isRunning };
})();
