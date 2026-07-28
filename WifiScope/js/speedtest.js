/* 실측 엔진 — Cloudflare 속도 측정 엔드포인트 사용 (테스트용 무의미 데이터만 송수신) */
(function () {
  'use strict';

  const BASE = 'https://speed.cloudflare.com';
  let currentAbort = null;
  let seq = 0;

  function timedFetch(url, opts, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs);
    const outer = opts && opts.signal;
    if (outer) {
      if (outer.aborted) ctrl.abort(outer.reason);
      else outer.addEventListener('abort', () => ctrl.abort(outer.reason), { once: true });
    }
    return fetch(url, Object.assign({}, opts, { signal: ctrl.signal, cache: 'no-store' }))
      .finally(() => clearTimeout(timer));
  }

  async function pingOnce(signal) {
    const t0 = performance.now();
    const res = await timedFetch(`${BASE}/__down?bytes=0&r=${seq++}`, { signal }, 8000);
    await res.arrayBuffer();
    return performance.now() - t0;
  }

  // n회 측정, 첫 샘플(커넥션 수립)은 버림 → 중앙값 핑 + 지터(연속 차 평균)
  async function measurePing(n, signal, onSample) {
    const samples = [];
    for (let i = 0; i < n; i++) {
      try {
        const ms = await pingOnce(signal);
        if (i > 0) samples.push(ms);
        if (onSample) onSample(i + 1, n, ms);
      } catch (e) {
        if (isAbort(e)) throw e;
      }
    }
    if (!samples.length) return { ping: null, jitter: null };
    const sorted = samples.slice().sort((a, b) => a - b);
    const ping = sorted[Math.floor(sorted.length / 2)];
    let jitter = null;
    if (samples.length > 1) {
      let acc = 0;
      for (let i = 1; i < samples.length; i++) acc += Math.abs(samples[i] - samples[i - 1]);
      jitter = acc / (samples.length - 1);
    }
    return { ping, jitter };
  }

  async function measureDown(bytes, signal, timeoutMs) {
    const t0 = performance.now();
    const res = await timedFetch(`${BASE}/__down?bytes=${bytes}&r=${seq++}`, { signal }, timeoutMs);
    const reader = res.body.getReader();
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
    }
    const secs = (performance.now() - t0) / 1000;
    return { mbps: (received * 8) / secs / 1e6, secs, bytes: received };
  }

  async function measureUp(bytes, signal, timeoutMs) {
    const body = new Blob([new Uint8Array(bytes)]);
    const t0 = performance.now();
    const res = await timedFetch(`${BASE}/__up?r=${seq++}`, { method: 'POST', body, signal }, timeoutMs);
    await res.text();
    const secs = (performance.now() - t0) / 1000;
    return { mbps: (bytes * 8) / secs / 1e6, secs };
  }

  async function fetchMeta(signal) {
    try {
      const res = await timedFetch(`${BASE}/meta`, { signal }, 6000);
      return await res.json();
    } catch (e) {
      if (isAbort(e)) throw e;
      return null;
    }
  }

  function isAbort(e) {
    return e && (e.name === 'AbortError' || (e instanceof DOMException && e.name === 'TimeoutError' && currentAbort && currentAbort.signal.aborted));
  }

  /**
   * 전체 측정 실행
   * mode: 'quick'(~5MB) | 'full'(~30MB)
   * onPhase(label, frac): 진행 상황 콜백
   */
  async function run(mode, onPhase) {
    if (currentAbort) currentAbort.abort();
    const ctrl = new AbortController();
    currentAbort = ctrl;
    const signal = ctrl.signal;
    const full = mode === 'full';
    const phase = (l, f) => { try { onPhase && onPhase(l, f); } catch (_) { } };
    const out = { ts: Date.now(), mode, ping: null, jitter: null, down: null, up: null, meta: null, errors: [] };

    try {
      phase('서버 정보 확인 중…', 0.04);
      out.meta = await fetchMeta(signal);

      phase('핑 측정 중…', 0.12);
      const n = full ? 9 : 6;
      const p = await measurePing(n, signal, (i, tot) => phase(`핑 측정 중… (${i}/${tot})`, 0.1 + 0.2 * (i / tot)));
      out.ping = p.ping; out.jitter = p.jitter;

      phase('다운로드 측정 중…', 0.35);
      try {
        await measureDown(200000, signal, 10000); // 워밍업
        let d = await measureDown(full ? 10e6 : 2e6, signal, full ? 30000 : 20000);
        // 빠른 회선이면 더 큰 파일로 재측정해 정확도 확보
        if (d.secs < (full ? 1.6 : 0.9)) {
          phase('다운로드 정밀 측정 중…', 0.55);
          d = await measureDown(full ? 25e6 : 8e6, signal, full ? 40000 : 25000);
        }
        out.down = d.mbps;
      } catch (e) {
        if (isAbort(e)) throw e;
        out.errors.push('download');
      }

      phase('업로드 측정 중…', 0.75);
      try {
        let u = await measureUp(full ? 3e6 : 1e6, signal, full ? 30000 : 20000);
        if (u.secs < 1.0) {
          phase('업로드 정밀 측정 중…', 0.88);
          u = await measureUp(full ? 8e6 : 3e6, signal, 40000);
        }
        out.up = u.mbps;
      } catch (e) {
        if (isAbort(e)) throw e;
        out.errors.push('upload');
      }

      phase('완료', 1);
      return out;
    } finally {
      if (currentAbort === ctrl) currentAbort = null;
    }
  }

  function cancel() {
    if (currentAbort) { currentAbort.abort(); currentAbort = null; }
  }

  // AR 라이브 샘플링용 경량 측정
  async function liveSample() {
    const ctrl = new AbortController();
    try {
      const ms = await pingOnce(ctrl.signal);
      return { ping: ms };
    } catch (_) {
      return { ping: null };
    }
  }
  async function liveDown() {
    const ctrl = new AbortController();
    try {
      const d = await measureDown(400000, ctrl.signal, 8000);
      return { down: d.mbps };
    } catch (_) {
      return { down: null };
    }
  }

  window.SpeedTest = { run, cancel, liveSample, liveDown, isRunning: () => !!currentAbort };
})();
