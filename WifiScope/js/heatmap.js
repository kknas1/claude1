/* 평면도 + IDW 보간 히트맵 렌더러 */
(function () {
  'use strict';

  const R_INFLUENCE = 0.38;   // 측정점 영향 반경 (짧은 변 기준 정규화)
  const MAX_ALPHA = 0.66;

  let canvas, ctx, wrap;
  let planImg = null;         // Image | null(기본 격자)
  let points = [];
  let pending = null;         // {x, y} 정규화 좌표
  let onTap = null;

  function init(canvasEl, wrapEl, tapHandler) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    wrap = wrapEl;
    onTap = tapHandler;

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      onTap && onTap(x, y);
    });

    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => { fitCanvas(); render(); }).observe(wrap);
    }
    fitCanvas();
  }

  function aspect() {
    return planImg ? planImg.naturalHeight / planImg.naturalWidth : 0.75;
  }

  function fitCanvas() {
    const w = wrap.clientWidth || 320;
    const h = Math.round(w * aspect());
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = h + 'px';
  }

  function setPlan(dataUrl) {
    return new Promise((resolve) => {
      if (!dataUrl) { planImg = null; fitCanvas(); render(); resolve(); return; }
      const img = new Image();
      img.onload = () => { planImg = img; fitCanvas(); render(); resolve(); };
      img.onerror = () => { planImg = null; fitCanvas(); render(); resolve(); };
      img.src = dataUrl;
    });
  }

  function setPoints(list) { points = list || []; }
  function setPending(x, y) { pending = { x, y }; render(); }
  function clearPending() { pending = null; render(); }
  function getPending() { return pending; }

  function drawBase(c, w, h) {
    if (planImg) {
      c.drawImage(planImg, 0, 0, w, h);
      c.fillStyle = 'rgba(10, 15, 28, 0.18)';
      c.fillRect(0, 0, w, h);
    } else {
      c.fillStyle = '#0d1526';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#1d2c48';
      c.lineWidth = 1;
      const step = Math.max(28, w / 14);
      for (let x = step; x < w; x += step) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      for (let y = step; y < h; y += step) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      if (!points.length) {
        c.fillStyle = '#3a4a6e';
        c.font = `600 ${Math.max(11, w / 34)}px sans-serif`;
        c.textAlign = 'center';
        c.fillText('평면도를 업로드하거나 이 격자 위에 바로 측정하세요', w / 2, h / 2);
      }
    }
  }

  // IDW(역거리 가중) 보간 히트 레이어
  function drawHeat(c, w, h) {
    if (!points.length) return;
    const gw = 130;
    const gh = Math.max(20, Math.round(gw * (h / w)));
    const off = document.createElement('canvas');
    off.width = gw; off.height = gh;
    const octx = off.getContext('2d');
    const img = octx.createImageData(gw, gh);
    const data = img.data;
    // x축 기준 등방 좌표계: x∈[0,1], y∈[0,h/w] — 영향 반경은 짧은 변 기준
    const pts = points.map(p => ({ x: p.x, y: p.y * (h / w), s: p.score }));
    const rr = R_INFLUENCE * Math.min(1, h / w);

    for (let gy = 0; gy < gh; gy++) {
      const ny = (gy + 0.5) / gh * (h / w);
      for (let gx = 0; gx < gw; gx++) {
        const nx = (gx + 0.5) / gw;
        let wSum = 0, vSum = 0, near = 0;
        for (const p of pts) {
          const dx = nx - p.x, dy = ny - p.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < rr) near = Math.max(near, 1 - d / rr);
          const wgt = 1 / (d * d + 1e-5);
          wSum += wgt; vSum += wgt * p.s;
        }
        if (near <= 0.02) continue;
        const val = vSum / wSum;
        const [r, g, b] = Quality.rampRgb(val / 100);
        const a = Math.min(MAX_ALPHA, Math.pow(near, 0.75) * MAX_ALPHA);
        const i = (gy * gw + gx) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = Math.round(a * 255);
      }
    }
    octx.putImageData(img, 0, 0);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(off, 0, 0, w, h);
  }

  function drawMarkers(c, w, h, scale) {
    const r = 13 * scale;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    points.forEach((p) => {
      const x = p.x * w, y = p.y * h;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = Quality.rampCss(p.score / 100);
      c.fill();
      c.lineWidth = 2 * scale;
      c.strokeStyle = 'rgba(255,255,255,0.92)';
      c.stroke();
      c.beginPath();
      c.arc(x, y, r + 1.6 * scale, 0, Math.PI * 2);
      c.lineWidth = 1.2 * scale;
      c.strokeStyle = 'rgba(0,0,0,0.55)';
      c.stroke();
      c.font = `800 ${11 * scale}px sans-serif`;
      c.lineWidth = 3 * scale;
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.strokeText(String(p.score), x, y + 0.5);
      c.fillStyle = '#fff';
      c.fillText(String(p.score), x, y + 0.5);
    });
    if (pending) {
      const x = pending.x * w, y = pending.y * h;
      c.strokeStyle = '#2fd672';
      c.lineWidth = 2 * scale;
      c.beginPath(); c.arc(x, y, 15 * scale, 0, Math.PI * 2); c.stroke();
      c.beginPath();
      c.moveTo(x - 22 * scale, y); c.lineTo(x - 8 * scale, y);
      c.moveTo(x + 8 * scale, y); c.lineTo(x + 22 * scale, y);
      c.moveTo(x, y - 22 * scale); c.lineTo(x, y - 8 * scale);
      c.moveTo(x, y + 8 * scale); c.lineTo(x, y + 22 * scale);
      c.stroke();
    }
  }

  function render() {
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    if (!w || !h) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    ctx.clearRect(0, 0, w, h);
    drawBase(ctx, w, h);
    drawHeat(ctx, w, h);
    drawMarkers(ctx, w, h, scale);
  }

  // 고해상도 합성 PNG (평면도 + 히트맵 + 마커 + 범례)
  function exportPng(title) {
    const W = 1400;
    const mapH = Math.round(W * aspect());
    const footH = 130;
    const out = document.createElement('canvas');
    out.width = W; out.height = mapH + footH;
    const c = out.getContext('2d');
    drawBase(c, W, mapH);
    drawHeat(c, W, mapH);
    drawMarkers2(c, W, mapH, W / 420);
    // 푸터: 제목 + 범례
    c.fillStyle = '#0c1220';
    c.fillRect(0, mapH, W, footH);
    c.fillStyle = '#eef2fb';
    c.font = '800 34px sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillText(title || '와이파이 스코프 히트맵', 36, mapH + 52);
    c.fillStyle = '#a8b3cc';
    c.font = '600 22px sans-serif';
    const d = new Date();
    c.fillText(`${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} · 측정점 ${points.length}개`, 36, mapH + 88);
    const gx0 = W - 480, gx1 = W - 60, gy = mapH + 62;
    const grad = c.createLinearGradient(gx0, 0, gx1, 0);
    for (let i = 0; i <= 10; i++) grad.addColorStop(i / 10, Quality.rampCss(i / 10));
    c.fillStyle = grad;
    roundRect(c, gx0, gy - 12, gx1 - gx0, 24, 12);
    c.fill();
    c.fillStyle = '#a8b3cc';
    c.font = '700 20px sans-serif';
    c.textAlign = 'center';
    c.fillText('약함 0', gx0 - 2, gy + 44);
    c.fillText('보통 50', (gx0 + gx1) / 2, gy + 44);
    c.fillText('100 좋음', gx1, gy + 44);
    return out.toDataURL('image/png');
  }

  function drawMarkers2(c, w, h, scale) {
    const saved = pending;
    pending = null;
    drawMarkers(c, w, h, scale);
    pending = saved;
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  window.Heatmap = { init, setPlan, setPoints, setPending, clearPending, getPending, render, exportPng };
})();
