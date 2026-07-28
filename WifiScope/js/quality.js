/* 품질 점수 모델 + 신호 색상 램프 */
(function () {
  'use strict';

  // 앵커 기반 구간 선형 보간
  function interp(anchors, x) {
    if (x <= anchors[0][0]) return anchors[0][1];
    for (let i = 1; i < anchors.length; i++) {
      if (x <= anchors[i][0]) {
        const [x0, y0] = anchors[i - 1], [x1, y1] = anchors[i];
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      }
    }
    return anchors[anchors.length - 1][1];
  }

  const DOWN = [[0, 0], [0.5, 15], [2, 35], [5, 50], [10, 62], [25, 74], [50, 83], [100, 90], [200, 96], [400, 100]];
  const UP = [[0, 0], [0.5, 20], [2, 40], [5, 55], [10, 68], [25, 80], [50, 88], [100, 95], [200, 100]];
  const PING = [[5, 100], [15, 95], [30, 85], [60, 70], [100, 55], [200, 35], [400, 18], [800, 6], [1500, 0]];

  // down/up: Mbps, ping: ms — 없는 항목(null)은 가중치에서 제외
  function score({ down, up, ping }) {
    const parts = [];
    if (down != null && isFinite(down)) parts.push([0.5, interp(DOWN, down)]);
    if (ping != null && isFinite(ping)) parts.push([0.3, interp(PING, ping)]);
    if (up != null && isFinite(up)) parts.push([0.2, interp(UP, up)]);
    if (!parts.length) return null;
    const wSum = parts.reduce((s, p) => s + p[0], 0);
    return Math.round(parts.reduce((s, p) => s + p[0] * p[1], 0) / wSum);
  }

  function grade(s) {
    if (s == null) return { key: 'none', label: '측정 전', cls: 'grade-none' };
    if (s >= 70) return { key: 'good', label: '좋음 · 강한 신호', cls: 'grade-good' };
    if (s >= 40) return { key: 'mid', label: '보통', cls: 'grade-mid' };
    return { key: 'weak', label: '약함', cls: 'grade-weak' };
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r, g, b;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  // 신호 램프: 0(약함) 보라 → 자홍 → 주황 → 52(중간) 노랑 → 연두 → 100(좋음) 초록
  // 보라→노랑 구간은 적색 방향으로 색상환을 크게 돌아(써멀 카메라 스타일) 중간에 초록이 끼지 않게 함
  function rampRgb(s01) {
    const t = Math.max(0, Math.min(1, s01));
    let h, sat, lig;
    if (t < 0.52) {
      const k = Math.pow(t / 0.52, 1.55); // 보라 구간을 길게 유지(약함=보라 의미 강조)
      h = 265 + k * 143;                  // 265°(보라) → 360+48°(노랑, 적색 경유)
      sat = 72 + k * 20;
      lig = 54 + k * 8;
    } else {
      const k = (t - 0.52) / 0.48;     // 48°(노랑) → 150°(초록)
      h = 48 + k * 102;
      sat = 92 - k * 12;
      lig = 62 - k * 24;
    }
    return hslToRgb(h, sat, lig);
  }

  function rampCss(s01) {
    const [r, g, b] = rampRgb(s01);
    return `rgb(${r},${g},${b})`;
  }

  const GRADE_COLOR = { good: '#00a35c', mid: '#ffd866', weak: '#8e5bd6', none: '#3a4a6e' };
  const GRADE_INK = { good: '#2fd672', mid: '#ffd866', weak: '#b794f0', none: '#a8b3cc' };

  function fmtMbps(v) { return v == null ? '–' : v >= 100 ? Math.round(v).toString() : v >= 10 ? v.toFixed(1) : v.toFixed(2); }
  function fmtMs(v) { return v == null ? '–' : Math.round(v).toString(); }
  function fmtTime(ts) {
    const d = new Date(ts);
    const p = n => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  window.Quality = { score, grade, rampRgb, rampCss, GRADE_COLOR, GRADE_INK, fmtMbps, fmtMs, fmtTime, interp };
})();
