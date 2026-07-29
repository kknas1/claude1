/* 와이파이 스코프 — 메인 컨트롤러 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const APP_VERSION = '1.3.0';   // 릴리스마다 sw.js CACHE 버전과 함께 올릴 것
  const STORE_KEY = 'wifiscope.v1';

  // ── 저장소 (모든 데이터는 이 기기의 localStorage에만 저장) ──
  let store = { plan: null, points: [], history: [] };
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) store = Object.assign(store, JSON.parse(raw));
    } catch (_) { }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) {
      toast('저장 공간이 부족합니다. 평면도 화질을 낮추거나 기록을 정리하세요.');
    }
  }

  // ── 공용 유틸 ──
  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }
  function dataUrlToBlob(dataUrl) {
    const [head, b64] = dataUrl.split(',');
    const mime = head.match(/data:(.*?);/)[1];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  async function sharePng(dataUrl, name, doneMsg) {
    const blob = dataUrlToBlob(dataUrl);
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (_) { return; }
    }
    downloadBlob(blob, name);
    toast(doneMsg);
  }
  function csvDownload(rows, name) {
    const csv = '﻿' + rows.map(r => r.map(v => {  // BOM: 엑셀 한글 인코딩 대응
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), name);
    toast('CSV 파일을 저장했습니다');
  }

  // ── 탭 ──
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(btn => btn.addEventListener('click', () => {
    tabs.forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    $('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'map') { requestAnimationFrame(() => Heatmap.render()); }
    if (btn.dataset.tab !== 'ar' && Ar.isRunning()) Ar.stop();
    if (btn.dataset.tab === 'history') renderHistory();
  }));

  // ── 게이지 ──
  const ARC_LEN = Math.PI * 80;
  function setupGauge() {
    const d = 'M 20 100 A 80 80 0 0 1 180 100';
    $('gaugeTrack').setAttribute('d', d);
    const arc = $('gaugeArc');
    arc.setAttribute('d', d);
    arc.style.strokeDasharray = `0 ${ARC_LEN}`;
  }
  function setGauge(score) {
    const arc = $('gaugeArc');
    const frac = score == null ? 0 : Math.max(0.02, score / 100);
    arc.style.strokeDasharray = `${frac * ARC_LEN} ${ARC_LEN}`;
    arc.style.stroke = score == null ? '#3a4a6e' : Quality.rampCss(score / 100);
    $('gaugeScore').textContent = score == null ? '–' : score;
    const g = Quality.grade(score);
    const chip = $('gaugeGrade');
    chip.textContent = g.label;
    chip.className = 'grade-chip ' + g.cls;
  }

  // ── 연결 정보 ──
  function renderNetBadge() {
    const on = navigator.onLine;
    const b = $('netBadge');
    b.textContent = on ? '온라인' : '오프라인';
    b.classList.toggle('offline', !on);
    $('ciOnline').textContent = on ? '연결됨' : '오프라인';
  }
  function renderConnInfo(meta) {
    if (meta) {
      $('ciIsp').textContent = meta.asOrganization || meta.isp || '알 수 없음';
      $('ciCity').textContent = [meta.city, meta.country].filter(Boolean).join(', ') || '알 수 없음';
      $('ciColo').textContent = meta.colo ? `Cloudflare ${meta.colo}` : '알 수 없음';
    }
    const conn = navigator.connection;
    if (conn && (conn.effectiveType || conn.downlink)) {
      $('ciTypeRow').classList.remove('hidden');
      $('ciType').textContent = [conn.type, conn.effectiveType].filter(Boolean).join(' · ') || '–';
    }
  }
  window.addEventListener('online', renderNetBadge);
  window.addEventListener('offline', renderNetBadge);

  // ── 측정 실행 (측정 탭 + 평면도 공용) ──
  let measuring = false;
  async function runTest(onPhase) {
    const mode = $('testMode').value;
    const res = await SpeedTest.run(mode, onPhase);
    res.score = Quality.score(res);
    return res;
  }
  function pushHistory(entry) {
    store.history.unshift(entry);
    if (store.history.length > 200) store.history.length = 200;
    save();
  }

  $('btnMeasure').addEventListener('click', async () => {
    if (measuring) return;
    if (!navigator.onLine) { toast('오프라인 상태입니다. 네트워크 연결을 확인하세요.'); return; }
    measuring = true;
    $('btnMeasure').disabled = true;
    $('btnMeasure').textContent = '측정 중…';
    $('btnCancelMeasure').classList.remove('hidden');
    try {
      const res = await runTest((label, frac) => {
        $('measureStatus').textContent = label;
        $('measureProgress').style.width = Math.round(frac * 100) + '%';
      });
      $('statDown').textContent = Quality.fmtMbps(res.down);
      $('statUp').textContent = Quality.fmtMbps(res.up);
      $('statPing').textContent = Quality.fmtMs(res.ping);
      $('statJitter').textContent = Quality.fmtMs(res.jitter);
      setGauge(res.score);
      renderConnInfo(res.meta);
      if (res.score == null) {
        $('measureStatus').textContent = '측정에 실패했습니다. 네트워크를 확인하고 다시 시도하세요.';
      } else {
        $('measureStatus').textContent = res.errors.length
          ? '일부 항목 측정 실패 — 가능한 항목으로 점수를 계산했습니다'
          : '측정 완료 · 결과가 기록에 저장되었습니다';
        pushHistory({ ts: res.ts, score: res.score, down: res.down, up: res.up, ping: res.ping, jitter: res.jitter, source: '측정' });
      }
    } catch (e) {
      $('measureStatus').textContent = '측정이 중지되었습니다';
      $('measureProgress').style.width = '0%';
    } finally {
      measuring = false;
      $('btnMeasure').disabled = false;
      $('btnMeasure').textContent = '다시 측정';
      $('btnCancelMeasure').classList.add('hidden');
    }
  });
  $('btnCancelMeasure').addEventListener('click', () => SpeedTest.cancel());

  // ── AR ──
  Ar.init({
    stage: $('arStage'), video: $('arVideo'), canvas: $('arCanvas'),
    startPanel: $('arStart'), hud: $('arHud'),
    score: $('arScore'), gradeChip: $('arGrade'), ping: $('arPing'), down: $('arDown'), spark: $('arSpark'),
  });
  $('btnArStart').addEventListener('click', () => Ar.start(true));
  $('btnArNoCam').addEventListener('click', () => Ar.start(false));
  $('btnArStop').addEventListener('click', () => Ar.stop());
  $('btnArSnap').addEventListener('click', () => Ar.snapshot());
  $('btnArReset').addEventListener('click', () => Ar.resetTrail());

  // ── 평면도 ──
  Heatmap.init($('mapCanvas'), $('mapWrap'), (x, y) => {
    if (measuring || !$('mapBusy').classList.contains('hidden')) return;
    Heatmap.setPending(x, y);
    $('mapConfirm').classList.remove('hidden');
  });

  $('btnPlanUpload').addEventListener('click', () => $('planFile').click());
  $('planFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1600;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        store.plan = c.toDataURL('image/jpeg', 0.82);
        save();
        Heatmap.setPlan(store.plan).then(() => toast('평면도를 불러왔습니다. 위치를 탭해 측정하세요.'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
  $('btnPlanGrid').addEventListener('click', () => {
    store.plan = null;
    save();
    Heatmap.setPlan(null);
    toast('기본 격자로 전환했습니다');
  });
  $('btnPointsClear').addEventListener('click', () => {
    if (!store.points.length) { toast('삭제할 측정점이 없습니다'); return; }
    if (!confirm(`측정점 ${store.points.length}개를 모두 삭제할까요?`)) return;
    store.points = [];
    save();
    Heatmap.setPoints(store.points);
    Heatmap.render();
    renderPointList();
  });

  $('btnPointCancel').addEventListener('click', () => {
    $('mapConfirm').classList.add('hidden');
    Heatmap.clearPending();
  });
  $('btnPointMeasure').addEventListener('click', async () => {
    const p = Heatmap.getPending();
    if (!p || measuring) return;
    if (!navigator.onLine) { toast('오프라인 상태입니다'); return; }
    measuring = true;
    $('mapConfirm').classList.add('hidden');
    $('mapBusy').classList.remove('hidden');
    try {
      const res = await runTest((label) => { $('mapBusyText').textContent = label; });
      if (res.score == null) {
        toast('측정에 실패했습니다. 다시 시도하세요.');
      } else {
        store.points.push({
          id: Date.now(), x: p.x, y: p.y,
          score: res.score, down: res.down, up: res.up, ping: res.ping, ts: res.ts,
        });
        pushHistory({ ts: res.ts, score: res.score, down: res.down, up: res.up, ping: res.ping, jitter: res.jitter, source: '평면도' });
        save();
        Heatmap.setPoints(store.points);
        renderPointList();
        toast(`측정 완료 — ${res.score}점 (${Quality.grade(res.score).label.split(' · ')[0]})`);
      }
    } catch (_) {
      toast('측정이 중지되었습니다');
    } finally {
      measuring = false;
      $('mapBusy').classList.add('hidden');
      Heatmap.clearPending();
      Heatmap.render();
    }
  });

  function renderPointList() {
    const ul = $('pointList');
    $('pointCount').textContent = store.points.length;
    if (!store.points.length) {
      ul.innerHTML = '<li class="empty">아직 측정점이 없습니다. 평면도를 탭해 시작하세요.</li>';
      return;
    }
    ul.innerHTML = '';
    store.points.slice().reverse().forEach((p, ri) => {
      const idx = store.points.length - ri;
      const li = document.createElement('li');
      const g = Quality.grade(p.score);
      li.innerHTML =
        `<span class="p-badge" style="background:${Quality.rampCss(p.score / 100)}">${p.score}</span>` +
        `<div class="p-info"><b>측정점 ${idx} · ${g.label.split(' · ')[0]}</b>` +
        `<span>↓${Quality.fmtMbps(p.down)} ↑${Quality.fmtMbps(p.up)} Mbps · 핑 ${Quality.fmtMs(p.ping)}ms · ${Quality.fmtTime(p.ts)}</span></div>`;
      const del = document.createElement('button');
      del.className = 'p-del';
      del.textContent = '삭제';
      del.addEventListener('click', () => {
        store.points = store.points.filter(q => q.id !== p.id);
        save();
        Heatmap.setPoints(store.points);
        Heatmap.render();
        renderPointList();
      });
      li.appendChild(del);
      ul.appendChild(li);
    });
  }

  // ── 내보내기 ──
  $('btnExportPng').addEventListener('click', () => {
    if (!store.points.length) { toast('먼저 측정점을 1개 이상 추가하세요'); return; }
    sharePng(Heatmap.exportPng('와이파이 스코프 히트맵'), `wifiscope-heatmap-${Date.now()}.png`, 'PNG를 저장했습니다');
  });
  $('btnExportCsv').addEventListener('click', () => {
    if (!store.points.length) { toast('먼저 측정점을 1개 이상 추가하세요'); return; }
    const rows = [['측정점', '시각', '점수', '등급', '다운로드(Mbps)', '업로드(Mbps)', '핑(ms)', 'X(0-1)', 'Y(0-1)']];
    store.points.forEach((p, i) => rows.push([
      i + 1, new Date(p.ts).toLocaleString('ko-KR'), p.score, Quality.grade(p.score).label.split(' · ')[0],
      p.down == null ? '' : p.down.toFixed(2), p.up == null ? '' : p.up.toFixed(2),
      p.ping == null ? '' : Math.round(p.ping), p.x.toFixed(3), p.y.toFixed(3),
    ]));
    csvDownload(rows, `wifiscope-points-${Date.now()}.csv`);
  });
  $('btnExportPdf').addEventListener('click', () => {
    if (!store.points.length && !store.history.length) { toast('먼저 측정을 1회 이상 진행하세요'); return; }
    buildReport();
    window.print();
  });

  function buildReport() {
    const d = new Date();
    $('reportDate').textContent = `생성 일시: ${d.toLocaleString('ko-KR')} · 앱 버전 v${APP_VERSION}`;
    const pts = store.points;
    const scores = pts.map(p => p.score);
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const tiles = [
      ['측정점', pts.length + '개'],
      ['평균 점수', avg == null ? '–' : avg + '점'],
      ['최고 점수', scores.length ? Math.max(...scores) + '점' : '–'],
      ['최저 점수', scores.length ? Math.min(...scores) + '점' : '–'],
    ];
    $('reportSummary').innerHTML = tiles.map(t =>
      `<div><div class="rs-label">${t[0]}</div><div class="rs-value">${t[1]}</div></div>`).join('');
    $('reportMap').setAttribute('src', pts.length ? Heatmap.exportPng('와이파이 스코프 히트맵') : '');
    const rows = pts.length
      ? pts.map((p, i) => [i + 1, Quality.fmtTime(p.ts), p.score, Quality.grade(p.score).label.split(' · ')[0],
        Quality.fmtMbps(p.down), Quality.fmtMbps(p.up), Quality.fmtMs(p.ping)])
      : store.history.slice(0, 20).map((hh, i) => [i + 1, Quality.fmtTime(hh.ts), hh.score, Quality.grade(hh.score).label.split(' · ')[0],
        Quality.fmtMbps(hh.down), Quality.fmtMbps(hh.up), Quality.fmtMs(hh.ping)]);
    $('reportTable').innerHTML =
      '<tr><th>#</th><th>시각</th><th>점수</th><th>등급</th><th>다운로드(Mbps)</th><th>업로드(Mbps)</th><th>핑(ms)</th></tr>' +
      rows.map(r => '<tr>' + r.map(v => `<td>${v}</td>`).join('') + '</tr>').join('');
  }

  // ── 기록 ──
  function renderHistory() {
    const h = store.history;
    $('histCount').textContent = h.length;
    $('sumCount').textContent = h.length;
    const scores = h.map(x => x.score).filter(s => s != null);
    $('sumAvg').textContent = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : '–';
    const downs = h.map(x => x.down).filter(v => v != null);
    $('sumMaxDown').textContent = downs.length ? Quality.fmtMbps(Math.max(...downs)) : '–';
    const pings = h.map(x => x.ping).filter(v => v != null);
    $('sumMinPing').textContent = pings.length ? Math.round(Math.min(...pings)) : '–';

    const ul = $('histList');
    if (!h.length) { ul.innerHTML = '<li class="empty">기록이 없습니다.</li>'; return; }
    ul.innerHTML = '';
    h.slice(0, 50).forEach(x => {
      const li = document.createElement('li');
      li.innerHTML =
        `<span class="p-badge" style="background:${Quality.rampCss((x.score || 0) / 100)}">${x.score ?? '–'}</span>` +
        `<div class="p-info"><b>${x.source} · ${Quality.grade(x.score).label.split(' · ')[0]}</b>` +
        `<span>↓${Quality.fmtMbps(x.down)} ↑${Quality.fmtMbps(x.up)} Mbps · 핑 ${Quality.fmtMs(x.ping)}ms · ${Quality.fmtTime(x.ts)}</span></div>`;
      ul.appendChild(li);
    });
  }
  $('btnHistCsv').addEventListener('click', () => {
    if (!store.history.length) { toast('저장된 기록이 없습니다'); return; }
    const rows = [['시각', '출처', '점수', '등급', '다운로드(Mbps)', '업로드(Mbps)', '핑(ms)', '지터(ms)']];
    store.history.forEach(x => rows.push([
      new Date(x.ts).toLocaleString('ko-KR'), x.source, x.score, Quality.grade(x.score).label.split(' · ')[0],
      x.down == null ? '' : x.down.toFixed(2), x.up == null ? '' : x.up.toFixed(2),
      x.ping == null ? '' : Math.round(x.ping), x.jitter == null ? '' : Math.round(x.jitter),
    ]));
    csvDownload(rows, `wifiscope-history-${Date.now()}.csv`);
  });
  $('btnHistClear').addEventListener('click', () => {
    if (!store.history.length) return;
    if (!confirm('측정 기록을 모두 삭제할까요? (측정점은 유지됩니다)')) return;
    store.history = [];
    save();
    renderHistory();
  });
  $('btnWipeAll').addEventListener('click', () => {
    if (!confirm('평면도·측정점·기록을 포함한 모든 데이터를 초기화할까요?')) return;
    store = { plan: null, points: [], history: [] };
    try { localStorage.removeItem(STORE_KEY); } catch (_) { }
    Heatmap.setPlan(null);
    Heatmap.setPoints([]);
    Heatmap.render();
    renderPointList();
    renderHistory();
    setGauge(null);
    toast('모든 데이터를 초기화했습니다');
  });

  // ── 초기화 ──
  $('appVer').textContent = 'v' + APP_VERSION;
  load();
  setupGauge();
  setGauge(null);
  renderNetBadge();
  renderConnInfo(null);
  Heatmap.setPoints(store.points);
  Heatmap.setPlan(store.plan);
  renderPointList();
  renderHistory();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }

  window.App = { toast, downloadBlob };
})();
