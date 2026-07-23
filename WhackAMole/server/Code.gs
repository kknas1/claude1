/**
 * 두더지 잡기 — 공유 순위판 백엔드 (Google Apps Script)
 *
 * 설치 방법:
 *  1. https://script.google.com 접속 (구글 로그인)
 *  2. "새 프로젝트" → 기본 코드를 지우고 이 파일 전체를 붙여넣기 → 저장
 *  3. 우측 상단 "배포" > "새 배포" > 유형 선택(톱니바퀴): "웹 앱"
 *     - 실행 계정: 나
 *     - 액세스 권한: 모든 사용자
 *  4. "배포" 클릭 → 웹 앱 URL 복사 (https://script.google.com/macros/s/…/exec)
 *  5. 그 URL을 game.js 의 BOARD_URL 에 넣으면 연결 완료
 *
 * API:
 *  GET                      -> {"scores":[...]}  점수순 상위 50개
 *  POST {"scores":[...]}    -> 보내온 기록을 병합/검증 후 전체 순위 반환
 *
 * 저장소는 스크립트 속성(PropertiesService)이라 별도 시트가 필요 없습니다.
 */
var STORE_KEY = 'scores';
var RESET_KEY = 'resetAt';
var STORE_MAX = 50;
// 관리자 키: 게임의 시작/게임오버 화면에서 버전 배지를 탭하면 이 키를
// 물어보고, 맞으면 순위판을 비웁니다. 원하면 다른 문구로 바꿔도 됩니다.
var ADMIN_KEY = '1357';

function doGet() {
  return respond({ scores: load() });
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    // malformed body -> merge nothing, still return the current board
  }

  var lock = LockService.getScriptLock();
  // tryLock: waitLock would throw on timeout and Apps Script turns uncaught
  // exceptions into HTML error pages with HTTP 200, breaking the JSON contract
  if (!lock.tryLock(10000)) {
    return respond({ scores: load(), error: 'busy' });
  }
  try {
    if (body.action === 'clear') {
      if (String(body.admin || '') !== ADMIN_KEY) {
        return respond({ error: 'unauthorized' });
      }
      // resetAt: 이 시각 이전의 기록은 이후 병합에서 거부됨 —
      // 클라이언트 복제본이 지운 순위를 되살리는 것(자가복구)을 차단
      var props = PropertiesService.getScriptProperties();
      props.setProperty(STORE_KEY, '[]');
      props.setProperty(RESET_KEY, String(Date.now()));
      return respond({ scores: [], reset: true });
    }

    var incoming = Array.isArray(body.scores) ? body.scores : [];
    var merged = merge(load(), incoming);
    PropertiesService.getScriptProperties().setProperty(STORE_KEY, JSON.stringify(merged));
    return respond({ scores: merged });
  } finally {
    lock.releaseLock();
  }
}

function resetAt() {
  var v = Number(PropertiesService.getScriptProperties().getProperty(RESET_KEY) || 0);
  return isFinite(v) ? v : 0;
}

// 수동 초기화: 에디터에서 이 함수를 선택하고 ▶ 실행해도 됩니다
function clearScores() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty(STORE_KEY, '[]');
  props.setProperty(RESET_KEY, String(Date.now()));
}

function load() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(STORE_KEY);
    var v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch (err) {
    return [];
  }
}

function merge(current, incoming) {
  var seen = {};
  var out = [];
  var cutoff = resetAt();
  current.concat(incoming).forEach(function (r) {
    var c = clean(r);
    if (!c || seen[c.id]) return;
    if (c.date < cutoff) return; // pre-reset records stay deleted
    seen[c.id] = true;
    out.push(c);
  });
  out.sort(function (a, b) {
    return (b.score - a.score) || (a.date - b.date);
  });
  return out.slice(0, STORE_MAX);
}

// Entries come from an open endpoint, so clamp every field server-side.
function clean(r) {
  if (!r || typeof r !== 'object') return null;
  var id = String(r.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 32);
  var name = String(r.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  var score = Math.round(Number(r.score));
  var moles = Math.round(Number(r.moles));
  var date = Math.round(Number(r.date));
  if (!id || !name) return null;
  if (!isFinite(score) || score < 0 || score > 1000000) return null;
  return {
    id: id,
    name: name,
    score: score,
    moles: isFinite(moles) ? Math.max(0, Math.min(100000, moles)) : 0,
    date: isFinite(date) ? date : Date.now(),
  };
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
